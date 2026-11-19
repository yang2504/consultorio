import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { api } from './api.js';
import { clock, longDate, matchesPatient, nextStatus, patientAge, roles, specialties, statuses, today, visitLabel, visitTypes } from './clinic.js';
import { DatePicker } from './DatePicker.jsx';
import { ImageUpload, readImage } from './ImageUpload.jsx';

export function Dialog({ title, children, close, back, className }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={className} onCancel={event => { event.preventDefault(); close(); }} aria-labelledby={titleId}>
    <header className="dialog-header"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Cerrar" onClick={close}><X size={20} /></button></header>
    {back && <button type="button" className="text-button dialog-back" onClick={back}><ChevronLeft size={17} /> Volver a la agenda del día</button>}
    {children}
  </dialog>;
}

export function Form({ children, save, label = 'Guardar', className = '', disabled = false }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setError('');
    setPending(true);
    try {
      await save(values);
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }
  return <form className={'form ' + className} onSubmit={submit}>
    <fieldset disabled={pending}>{children}</fieldset>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="primary form-submit" disabled={pending || disabled}>{pending ? 'Guardando…' : label}</button>
  </form>;
}

export function PatientForm({ patient, done }) {
  return <Form save={async body => {
    const result = await api('/patients' + (patient ? '/' + patient.id : ''), { method: patient ? 'PUT' : 'POST', body });
    await done(result.id);
  }}>
    <label>Nombre completo<input name="name" defaultValue={patient?.name} required maxLength={150} autoFocus /></label>
    <div className="form-row">
      <label>Carnet de identidad<input name="document" defaultValue={patient?.document} required maxLength={40} /></label>
      <label>Edad (años)<input type="number" name="age" defaultValue={patient ? patientAge(patient) : ''} min="0" max="130" required /></label>
    </div>
    <label>Teléfono<input name="phone" type="tel" defaultValue={patient?.phone} maxLength={50} /></label>
  </Form>;
}

export function AppointmentForm({ item, day, specialty, data, done, patientCreated }) {
  const [registering, setRegistering] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(() => ({
    patientId: item?.patient_id ?? '', professionalId: item?.professional_id ?? (data.professionals.length === 1 ? data.professionals[0].id : ''),
    technicianId: item?.technician_id ?? '', specialty: item?.specialty ?? specialty ?? 'consulta', day: item?.day ?? day ?? today(),
    visitType: item?.visit_type ?? 'primera',
    start: item ? clock(item.start) : '09:00', duration: item ? item.end - item.start : 30
  }));
  const set = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const bind = name => ({ name, value: draft[name], onChange: event => set(name, event.target.value) });
  const [hours, minutes] = draft.start.split(':').map(Number);
  const start = hours * 60 + minutes;
  const duration = Number(draft.duration);
  const end = start + duration;
  const timeValid = Number.isFinite(start) && Number.isInteger(duration) && duration >= 5 && duration <= 480 && end <= 1440;
  const overlaps = (event, date) => timeValid && event.id !== item?.id && event.day === date
    && event.status !== 'cancelada' && event.start < end && event.end > start
    && (event.patient_id === Number(draft.patientId) || event.professional_id === Number(draft.professionalId)
      || event.technician_id === Number(draft.technicianId) || event.specialty === draft.specialty);
  const conflict = data.appointments.find(event => overlaps(event, draft.day));
  const missing = !draft.patientId || !draft.specialty || !draft.professionalId;
  function selectPatient(id) {
    setDraft(current => ({ ...current, patientId: id,
      visitType: data.appointments.some(a => a.patient_id === Number(id) && a.status !== 'cancelada') ? 'reconsulta' : 'primera' }));
    setQuery('');
  }
  if (registering) return <div className="inline-patient">
    <button type="button" className="text-button" onClick={() => setRegistering(false)}><ChevronLeft size={16} /> Volver a la cita</button>
    <h3>Nuevo paciente</h3>
    <PatientForm done={async id => {
      await patientCreated();
      selectPatient(id);
      setRegistering(false);
    }} />
  </div>;
  const selectedPatient = data.patients.find(p => p.id === Number(draft.patientId));
  const results = data.patients.filter(p => matchesPatient(p, query));
  return <Form save={async body => {
    body = { ...body, ...draft };
    await api('/appointments' + (item ? '/' + item.id : ''), { method: item ? 'PUT' : 'POST', body });
    await done();
  }} label={item ? 'Guardar cambios' : 'Programar cita'} disabled={Boolean(conflict) || !timeValid || missing}>
    {item ? <p className="muted">{item.patient} · {visitLabel(item)}</p> :
      <div className="patient-picker">
        <div className="patient-picker-heading"><strong>Paciente</strong><button type="button" className="text-button" onClick={() => setRegistering(true)}>+ Nuevo paciente</button></div>
        {selectedPatient && <div className="patient-selected"><span><strong>{selectedPatient.name}</strong><small>CI {selectedPatient.document} · {patientAge(selectedPatient)} años</small></span><button type="button" className="text-button" onClick={() => set('patientId', '')}>Cambiar</button></div>}
        {!selectedPatient && <><label>Buscar por carnet, nombre o apellido<input type="search" value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" /></label>
          <ul className="patient-results" aria-label="Pacientes encontrados">{results.slice(0, 20).map(p => <li key={p.id}>
            <button type="button" onClick={() => selectPatient(p.id)}><strong>{p.name}</strong><small>CI {p.document} · {patientAge(p)} años</small></button>
          </li>)}</ul>
          <small className="muted" aria-live="polite">{results.length ? results.length + ' pacientes encontrados' : 'Sin coincidencias. Puedes registrar un nuevo paciente.'}</small>
        </>}
      </div>}
    <label>Tipo de consulta<select {...bind('visitType')} required>{Object.entries(visitTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <details className="secondary-options"><summary>Especialidad y opciones de atención</summary><div className="form-row">
      {!item && <label>Especialidad<select {...bind('specialty')} required><option value="" disabled>Selecciona una especialidad</option>{Object.entries(specialties).map(([id, kind]) => <option key={id} value={id}>{kind.name}</option>)}</select></label>}
      <p className="muted">Médico del consultorio · {data.professionals[0]?.name ?? 'Configura la cuenta del médico'}</p>
    </div>
    {data.technicians.length > 0 && <label>Técnico asignado<select {...bind('technicianId')}><option value="">Sin asignar</option>{data.technicians.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
    </details>
    <div className="schedule-fields">
      <DatePicker value={draft.day} onChange={day => set('day', day)} appointments={data.appointments} isAvailable={(event, day) => !overlaps(event, day)} />
      <div className="schedule-time">
        <div className="date-summary" aria-live="polite"><small>Fecha seleccionada</small><strong>{longDate(draft.day)}</strong></div>
        <label>Hora de inicio<input type="time" {...bind('start')} required /></label>
        <label>Duración (min)<input type="number" {...bind('duration')} min="5" max="480" required /></label>
        <div className={'slot-feedback' + (conflict || !timeValid ? ' conflict' : '')} aria-live="polite">
          {!timeValid ? 'Ingresa una hora válida y una duración de 5 a 480 minutos. La cita debe terminar el mismo día.'
            : conflict ? 'Cruce con una cita de ' + clock(conflict.start) + ' a ' + clock(conflict.end) + '. Elige otra fecha u hora.'
              : missing ? 'Completa los datos de la cita para verificar el horario.'
                : 'Horario disponible · ' + clock(start) + '–' + clock(end)}
        </div>
      </div>
    </div>
    {!data.professionals.length && <p className="muted">Configura la cuenta del médico para agendar.</p>}
  </Form>;
}

export function AppointmentDetails({ item, user, done, edit, history, result, upload }) {
  const options = nextStatus[item.status];
  return <div className="appointment-detail">
    <div className="detail-pairs">
      <div><small>Paciente</small><strong>{item.patient}</strong></div>
      <div><small>Tipo de consulta</small><strong>{visitLabel(item)}</strong></div>
      <div><small>Fecha y hora</small><strong>{longDate(item.day)} · {clock(item.start)}–{clock(item.end)}</strong></div>
      <div><small>Profesional</small><strong>{item.professional}</strong></div>
      {item.technician && <div><small>Técnico asignado</small><strong>{item.technician}</strong></div>}
    </div>
    <span className={'status ' + item.status}>{statuses[item.status]}</span>
    <div className="row-actions">
      {history && <button className="secondary" onClick={history}>Historial médico</button>}
      {history && <button className="primary" onClick={result}>Registrar atención</button>}
      {upload && <button className="secondary" onClick={upload}>Cargar imágenes</button>}
      {user.role === 'tecnico' && <button className="primary" onClick={result}>Registrar resultado</button>}
      {user.role !== 'tecnico' && ['pendiente', 'confirmada'].includes(item.status) && <button className="secondary" onClick={edit}>Reprogramar</button>}
    </div>
    {user.role !== 'tecnico' && options.length > 0 && <Form label="Actualizar estado" save={async body => {
      await api('/appointments/' + item.id + '/status', { method: 'PATCH', body });
      await done();
    }}>
      <label>Nuevo estado<select name="status" required defaultValue=""><option value="" disabled>Selecciona un estado</option>{options.map(status => <option value={status} key={status}>{statuses[status]}</option>)}</select></label>
    </Form>}
  </div>;
}

export function EntryForm({ patientId, patientName, appointments, item, technician, imaging, specialty, done }) {
  const [files, setFiles] = useState([]);
  const [linkedId, setLinkedId] = useState('');
  const needsAppointment = imaging || files.length > 0;
  const options = appointments.filter(a => (!specialty || a.specialty === specialty) && (!needsAppointment || a.status !== 'cancelada'));
  const linked = item ?? options.find(a => a.id === Number(linkedId)) ?? (needsAppointment && options.length === 1 ? options[0] : null);
  const missingAppointment = needsAppointment && !linked;
  const noAppointments = needsAppointment && !item && !options.length;
  return <Form label={imaging ? 'Guardar imágenes' : 'Guardar'} disabled={missingAppointment || (imaging && !files.length)} save={async body => {
    body.patientId = patientId;
    body.images = await Promise.all(files.map(readImage));
    body.appointmentId = linked?.id;
    if (imaging) body.imaging = true;
    if (technician || imaging) body.kind = 'Resultado';
    await api('/entries', { method: 'POST', body });
    await done();
  }}>
    {!technician && !imaging && <label>Tipo de registro<select name="kind" defaultValue="Consulta">{['Consulta', 'Diagnóstico', 'Antecedente', 'Orden', 'Resultado', 'Informe'].map(kind => <option key={kind}>{kind}</option>)}</select></label>}
    {!item && !noAppointments && <label>Cita vinculada<select name="appointmentId" value={linked?.id ?? ''} required={needsAppointment} onChange={event => setLinkedId(event.target.value)}>
      <option value="" disabled={needsAppointment}>{needsAppointment ? 'Selecciona la cita del estudio' : 'Sin cita vinculada'}</option>
      {options.map(a => <option key={a.id} value={a.id}>{visitLabel(a)} · {longDate(a.day)} · {clock(a.start)} · {specialties[a.specialty].name}</option>)}</select></label>}
    {item && !imaging && <p className="muted">{item.patient} · {visitLabel(item)} · {longDate(item.day)}</p>}
    {needsAppointment && <div className="date-summary" aria-live="polite">
      <small>Paciente</small><strong>{item?.patient ?? patientName}</strong>
      {linked && <small>{specialties[linked.specialty].name} · {longDate(linked.day)} · {clock(linked.start)}</small>}
      {noAppointments && <small>Este paciente necesita una cita {specialty ? 'de ' + specialties[specialty].name + ' ' : ''}para cargar imágenes.</small>}
    </div>}
    <label>{imaging ? 'Nombre del estudio' : 'Título'}<input name="title" defaultValue={!imaging && item ? visitLabel(item) : undefined} placeholder={imaging ? 'Ej. Radiografía de tórax' : undefined} required maxLength={150} /></label>
    <label>{imaging ? 'Observaciones (opcional)' : 'Contenido clínico'}<textarea name="body" rows={imaging ? 2 : 5} maxLength={12000} required={!imaging} /></label>
    {!imaging && !technician && <label>Diagnóstico<textarea name="diagnosis" rows="3" maxLength={4000} /></label>}
    {(!imaging || !noAppointments) && <ImageUpload files={files} onChange={setFiles} required={imaging} />}
  </Form>;
}

export function StaffForm({ done }) {
  return <Form save={async body => { await api('/staff', { method: 'POST', body }); await done(); }}>
    <label>Nombre completo<input name="name" required maxLength={120} /></label>
    <div className="form-row">
      <label>Usuario<input name="username" autoComplete="off" required minLength={3} maxLength={60} pattern="[a-zA-Z0-9._\-]{3,60}" /></label>
      <label>Perfil<select name="role" defaultValue="recepcion">{Object.entries(roles).filter(([id]) => ['administrador', 'medico', 'recepcion'].includes(id)).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
    </div>
    <label>Contraseña inicial<input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
  </Form>;
}
