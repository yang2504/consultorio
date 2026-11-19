import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openStore } from '../src/adapters/sqlite.js';
import { createClinic } from '../src/application/clinic.js';

test('contraseñas de 8 caracteres en configuración y altas de personal', () => {
  const store = openStore(':memory:');
  try {
    const clinic = createClinic(store);
    const input = { name: 'Administración', username: 'admin', password: 'Abc1234' };
    assert.throws(() => clinic.setup(input), /entre 8 y 128/);
    const actor = clinic.setup({ ...input, password: 'Abc12345' });
    assert.equal(clinic.login('admin', 'Abc12345').id, actor.id);
    const staff = { name: 'Recepción', username: 'recepcion', role: 'recepcion', password: 'Xyz1234' };
    assert.throws(() => clinic.addStaff(actor, staff), /entre 8 y 128/);
    clinic.addStaff(actor, { ...staff, password: 'Xyz12345' });
    assert.equal(clinic.login('recepcion', 'Xyz12345').role, 'recepcion');
    assert.throws(() => clinic.login('admin', 'abc12345'), /incorrectos/);
    assert.throws(() => clinic.addStaff(actor, { ...staff, password: 'x'.repeat(129) }), /entre 8 y 128/);
  } finally { store.close(); }
});

test('consultorio único, edad, mayúsculas y diagnóstico vinculado', () => {
  const store = openStore(':memory:');
  try {
    const clinic = createClinic(store);
    const actor = clinic.setup({ name: 'doctor pérez', username: 'Doctor', password: 'Contraseña-12345' });
    assert.equal(actor.name, 'DOCTOR PÉREZ');
    assert.equal(actor.username, 'DOCTOR');
    assert.equal(clinic.login('doctor', 'Contraseña-12345').id, actor.id);
    const id = clinic.savePatient(actor, { name: 'Sofía pérez', document: 'abc-123', age: '30', phone: '' });
    assert.equal(store.patient(id).name, 'SOFÍA PÉREZ');
    assert.equal(store.patient(id).document, 'ABC-123');
    assert.equal(store.patient(id).age, 30);
    assert.equal(store.patient(id).birth_date, '');
    assert.throws(() => clinic.savePatient(actor, { name: 'SOFÍA', document: 'ABC-123', age: 30 }), /ya existe/);
    assert.throws(() => clinic.savePatient(actor, { name: 'SOFÍA', document: 'OTRO', age: -1 }), /edad/);
    const appointmentId = clinic.saveAppointment(actor, { patientId: id, day: '2026-11-19', start: '09:00', duration: 30, visitType: 'primera' });
    assert.equal(store.appointment(appointmentId).professional_id, actor.id);
    assert.equal(store.appointment(appointmentId).specialty, 'consulta');
    assert.equal(store.appointment(appointmentId).visit_type, 'primera');
    clinic.addEntry(actor, { patientId: id, appointmentId, kind: 'Consulta', title: 'Primera consulta', body: 'Historia médica', diagnosis: 'Diagnóstico de prueba' });
    const history = clinic.history(actor, id);
    assert.equal(history.entries[0].diagnosis, 'DIAGNÓSTICO DE PRUEBA');
    assert.equal(history.entries[0].visit_type, 'primera');
    assert.equal(history.appointments.length, 1);
    clinic.saveAppointment(actor, { patientId: id, day: '2026-11-20', start: '09:00', duration: 30, visitType: 'reconsulta' });
    assert.equal(clinic.history(actor, id).appointments[1].visit_type, 'reconsulta');
  } finally { store.close(); }
});

test('migra la estructura anterior conservando citas, imágenes e historial', () => {
  const directory = mkdtempSync(join(tmpdir(), 'consultorio-legacy-'));
  const path = join(directory, 'legacy.sqlite');
  try {
    const legacy = new DatabaseSync(path);
    const schema = readFileSync(new URL('../src/adapters/schema.sql', import.meta.url), 'utf8').replace("'consulta',", '');
    legacy.exec(schema);
    legacy.exec(`INSERT INTO staff VALUES (1,'Médico','doctor','medico','test');
      INSERT INTO patients VALUES (1,'Sofía Pérez','abc-123','1990-05-10','');
      INSERT INTO appointments (id,patient_id,professional_id,specialty,day,start,end) VALUES (1,1,1,'ecografia','2026-11-12',540,570);
      INSERT INTO entries (id,patient_id,appointment_id,author_id,kind,title,body) VALUES (1,1,1,1,'Resultado','Ecografía','Estudio anterior');
      INSERT INTO attachments VALUES (1,1,'eco.png','image/png',x'89504e47');`);
    legacy.close();
    for (let attempt = 0; attempt < 2; attempt++) {
      const store = openStore(path);
      try {
        assert.equal(store.patient(1).name, 'SOFÍA PÉREZ');
        assert.equal(store.patient(1).birth_date, '1990-05-10');
        assert.equal(store.appointment(1).visit_type, null);
        assert.equal(store.entries(1)[0].appointment_id, 1);
        assert.equal(store.attachments(1)[0].name, 'eco.png');
        createClinic(store).saveAppointment(store.staffById(1), { patientId: 1, day: '2026-11-2' + attempt, start: '09:00', duration: 30, visitType: 'primera' });
      } finally { store.close(); }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
