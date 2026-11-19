import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ClinicError, date, field, roles, specialty, time, transitions } from '../domain/clinic.js';

export const clinicalRoles = ['administrador', 'medico'];
export const scheduleRoles = [...clinicalRoles, 'recepcion'];
const kinds = ['Antecedente', 'Consulta', 'Diagnóstico', 'Orden', 'Resultado', 'Informe'];

function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}

function existing(value, message = 'No se encontró el registro.') {
  if (!value) throw new ClinicError(message, 404);
  return value;
}

function allow(actor, roles) {
  if (!roles.includes(actor.role)) throw new ClinicError('No tienes permiso para esta acción.', 403);
}

export function createClinic(store) {
  const audit = (actor, action, entity) => store.audit(actor.id, action, entity);
  const change = (actor, action, execute, id) => store.transaction(() => {
    const result = execute();
    audit(actor, action, id ?? result);
    return result;
  });

  function addStaff(input, role) {
    const name = field(input.name, 'Nombre', 120);
    const username = field(input.username, 'Usuario', 60);
    if (!/^[A-Z0-9._-]{3,60}$/.test(username)) throw new ClinicError('Usa entre 3 y 60 letras, números, puntos o guiones en el usuario.');
    const password = input.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      throw new ClinicError('La contraseña debe tener entre 8 y 128 caracteres.');
    }
    if (!roles.includes(role)) throw new ClinicError('Selecciona un perfil válido.');
    return store.addStaff(name, username, role, passwordHash(password));
  }

  function appointmentData(input, excludedId = 0) {
    const patient = existing(store.patient(Number(input.patientId)), 'Selecciona un paciente registrado.');
    const professional = existing(store.staffById(Number(input.professionalId || store.professionals()[0]?.id)), 'Configura el médico del consultorio.');
    if (!['medico', 'administrador'].includes(professional.role)) throw new ClinicError('Selecciona un médico.');
    const technician = input.technicianId ? existing(store.staffById(Number(input.technicianId)), 'Selecciona un técnico.') : null;
    if (technician && technician.role !== 'tecnico') throw new ClinicError('Selecciona un técnico.');
    const kind = specialty(input.specialty ?? 'consulta');
    const current = excludedId ? store.appointment(excludedId) : null;
    const visitType = input.visitType ?? current?.visit_type ?? null;
    if (visitType !== null && !['primera', 'reconsulta'].includes(visitType)) throw new ClinicError('Selecciona primera consulta o reconsulta.');
    const day = date(input.day);
    const start = time(input.start);
    const duration = Number(input.duration);
    const end = start + duration;
    if (!Number.isInteger(duration) || duration < 5 || duration > 480 || end > 1440) {
      throw new ClinicError('La cita debe durar entre 5 y 480 minutos y terminar el mismo día.');
    }
    if (store.conflicts(patient.id, professional.id, technician?.id ?? null, kind, day, start, end, excludedId)) {
      throw new ClinicError('El paciente, el personal o la sala de esa especialidad ya tiene una cita en ese horario.', 409);
    }
    return [patient.id, professional.id, kind, day, start, end, technician?.id ?? null, visitType];
  }

  function studyForTechnician(actor, id) {
    const study = existing(store.appointment(id));
    if (actor.role === 'tecnico' && (study.technician_id !== actor.id || ['cancelada', 'pendiente'].includes(study.status))) {
      throw new ClinicError('El estudio debe estar confirmado y asignado a tu usuario.', 403);
    }
    return study;
  }

  return {
    needsSetup: () => store.countStaff() === 0,
    setup: input => store.transaction(() => {
      if (store.countStaff()) throw new ClinicError('La cuenta inicial ya está configurada.', 409);
      const id = addStaff(input, 'administrador');
      store.audit(id, 'administrador_inicial', id);
      return store.staffById(id);
    }),
    login(username, password) {
      if (typeof username !== 'string' || username.length > 60 || typeof password !== 'string' || password.length > 128) {
        throw new ClinicError('Usuario o contraseña incorrectos.', 401);
      }
      const row = store.staffByUsername(username.trim().toLocaleUpperCase('es'));
      const expected = row?.password_hash ?? ('0'.repeat(32) + ':' + '0'.repeat(128));
      const actual = passwordHash(password, expected.split(':')[0]);
      if (!timingSafeEqual(Buffer.from(expected), Buffer.from(actual)) || !row) {
        throw new ClinicError('Usuario o contraseña incorrectos.', 401);
      }
      audit(row, 'inicio_sesion');
      return store.staffById(row.id);
    },
    staff(actor) {
      allow(actor, ['administrador']);
      return store.staff();
    },
    addStaff(actor, input) {
      allow(actor, ['administrador']);
      return change(actor, 'alta_personal', () => addStaff(input, input.role));
    },
    overview(actor) {
      audit(actor, 'consulta_agenda');
      const appointments = store.appointments().filter(a => actor.role !== 'tecnico' ||
        (a.technician_id === actor.id && !['pendiente', 'cancelada'].includes(a.status)));
      return {
        patients: actor.role === 'tecnico' ? [] : store.patients(),
        professionals: store.professionals(),
        technicians: actor.role === 'tecnico' ? [] : store.technicians(),
        appointments
      };
    },
    savePatient(actor, input, id) {
      allow(actor, scheduleRoles);
      const existingPatient = id ? existing(store.patient(id)) : null;
      const recorded = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/La_Paz' });
      const ageProvided = input.age !== undefined;
      const age = ageProvided ? Number(input.age) : null;
      if (ageProvided && (!['string', 'number'].includes(typeof input.age) || !/^\d{1,3}$/.test(String(input.age)) || !Number.isInteger(age) || age < 0 || age > 130)) {
        throw new ClinicError('Ingresa una edad de 0 a 130 años.');
      }
      const birthDate = ageProvided ? existingPatient?.birth_date ?? '' : date(input.birthDate);
      const data = [
        field(input.name, 'Nombre completo', 150), field(input.document, 'Documento', 40),
        birthDate, field(input.phone, 'Teléfono', 50, false), age, ageProvided ? recorded : null
      ];
      if (birthDate > recorded) throw new ClinicError('La fecha de nacimiento no puede ser futura.');
      return change(actor, id ? 'edicion_paciente' : 'alta_paciente', () => {
        if (!id) return store.addPatient(...data);
        existing(store.patient(id));
        store.updatePatient(id, ...data);
        return id;
      });
    },
    saveAppointment(actor, input, id) {
      allow(actor, scheduleRoles);
      return change(actor, id ? 'reprogramacion_cita' : 'alta_cita', () => {
        if (id) {
          const current = existing(store.appointment(id));
          if (!['pendiente', 'confirmada'].includes(current.status)) throw new ClinicError('Solo se pueden reprogramar citas pendientes o confirmadas.', 409);
          const data = appointmentData(input, id);
          if (data[0] !== current.patient_id || data[2] !== current.specialty) {
            throw new ClinicError('La reprogramación conserva el paciente y la especialidad.');
          }
          store.updateAppointment(id, ...data);
          return id;
        }
        return store.addAppointment(...appointmentData(input));
      });
    },
    setStatus(actor, id, status) {
      allow(actor, scheduleRoles);
      return change(actor, 'cita_' + String(status), () => {
        const row = existing(store.appointment(id));
        if (!transitions[row.status].includes(status)) throw new ClinicError('Ese cambio de estado no está permitido.', 409);
        store.setStatus(id, status);
      }, id);
    },
    history(actor, patientId) {
      allow(actor, clinicalRoles);
      const patient = existing(store.patient(patientId));
      audit(actor, 'consulta_expediente', patientId);
      return { patient, appointments: store.appointments().filter(a => a.patient_id === patientId),
        entries: store.entries(patientId).map(entry => ({ ...entry, attachments: store.attachments(entry.id) })) };
    },
    addEntry(actor, input, images = []) {
      allow(actor, [...clinicalRoles, 'tecnico']);
      const kind = input.kind;
      if (!kinds.includes(kind)) throw new ClinicError('Selecciona un tipo de registro válido.');
      const title = field(input.title, 'Título', 150);
      const imaging = input.imaging === true;
      if (imaging && (kind !== 'Resultado' || !images.length)) {
        throw new ClinicError('Adjunta al menos una imagen para guardar el estudio.');
      }
      const body = field(input.body, 'Contenido clínico', 12000, !imaging);
      const diagnosis = field(input.diagnosis, 'Diagnóstico', 4000, false);
      return change(actor, 'registro_clinico', () => {
        const study = input.appointmentId ? studyForTechnician(actor, Number(input.appointmentId)) : null;
        if (actor.role === 'tecnico' && (!study || kind !== 'Resultado')) {
          throw new ClinicError('El perfil técnico registra resultados vinculados a un estudio.', 403);
        }
        if (images.length && (!study || study.status === 'cancelada')) {
          throw new ClinicError('Selecciona una cita vigente del paciente para cargar imágenes.');
        }
        const patientId = study?.patient_id ?? Number(input.patientId);
        if (study && input.patientId != null && Number(input.patientId) !== patientId) {
          throw new ClinicError('La cita pertenece a otro paciente.');
        }
        existing(store.patient(patientId));
        const studyDay = imaging ? study.day : null;
        const id = store.addEntry(patientId, study?.id ?? null, actor.id, kind, title, body, null, studyDay, diagnosis);
        for (const image of images) store.addAttachment(id, image.name, image.mime, image.data);
        return id;
      });
    },
    attachment(actor, id) {
      allow(actor, clinicalRoles);
      const image = existing(store.attachment(id));
      audit(actor, 'consulta_adjunto', id);
      return image;
    },
    auditLog(actor) {
      allow(actor, ['administrador']);
      return store.auditLog();
    },
    backup(actor, path) {
      allow(actor, ['administrador']);
      audit(actor, 'copia_seguridad');
      store.backup(path);
    }
  };
}
