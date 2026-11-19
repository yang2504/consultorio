import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createClinic } from '../src/application/clinic.js';
import { openStore } from '../src/adapters/sqlite.js';
import { createHttp } from '../src/adapters/http.js';

test('flujo local de pacientes, citas, permisos, expediente y respaldo', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'consultorio-test-'));
  const store = openStore(join(directory, 'test.sqlite'));
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const setupCode = 'demo-test-code';
  server.on('request', createHttp(createClinic(store), { publicPath: directory, setupCode, port }));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    store.close();
    await rm(directory, { recursive: true, force: true });
  });

  async function call(path, status, { method = 'GET', body, cookie, noHeader } = {}) {
    const response = await fetch('http://127.0.0.1:' + port + '/api' + path, {
      method, headers: {
        ...(!noHeader && { 'X-Consultorio': 'local' }), ...(cookie && { Cookie: cookie }),
        ...(body && { 'Content-Type': 'application/json' })
      }, body: body && JSON.stringify(body)
    });
    const data = response.headers.get('content-type')?.includes('application/json')
      ? await response.json() : Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, status, JSON.stringify(data));
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }

  const password = 'contraseña-ficticia';
  const credentials = { name: 'Administración', username: 'admin', password };
  await call('/overview', 401);
  await call('/setup', 403, { method: 'POST', body: { ...credentials, code: setupCode }, noHeader: true });
  const admin = (await call('/setup', 200, { method: 'POST', body: { ...credentials, code: setupCode } })).cookie;
  await call('/setup', 409, { method: 'POST', body: { ...credentials, code: setupCode } });
  const { data: doctor } = await call('/staff', 201, { method: 'POST', cookie: admin, body: { name: 'Especialista', username: 'medico', role: 'medico', password } });
  const { data: technician } = await call('/staff', 201, { method: 'POST', cookie: admin, body: { name: 'Técnica', username: 'tecnico', role: 'tecnico', password } });
  await call('/staff', 201, { method: 'POST', cookie: admin, body: { name: 'Recepción', username: 'recepcion', role: 'recepcion', password } });
  const login = async username => (await call('/login', 200, { method: 'POST', body: { username, password } })).cookie;
  const reception = await login('recepcion');
  const tech = await login('tecnico');

  const profile = { name: 'Paciente Ficticio', document: 'TEST-1', birthDate: '1986-02-03', phone: '0000' };
  const { data: patient } = await call('/patients', 201, { method: 'POST', cookie: reception, body: profile });
  await call('/patients', 409, { method: 'POST', cookie: reception, body: profile });
  await call('/patients/' + patient.id, 200, { method: 'PUT', cookie: reception, body: { ...profile, phone: '0001' } });
  await call('/history/' + patient.id, 403, { cookie: reception });
  const details = { patientId: patient.id, professionalId: doctor.id, technicianId: technician.id, day: '2026-11-12', specialty: 'ecografia', start: '09:00', duration: 30 };
  const { data: appointment } = await call('/appointments', 201, { method: 'POST', cookie: reception, body: details });
  await call('/appointments', 409, { method: 'POST', cookie: reception, body: { ...details, start: '09:20' } });
  assert.equal((await call('/overview', 200, { cookie: tech })).data.appointments.length, 0);
  const statusPath = '/appointments/' + appointment.id + '/status';
  await call(statusPath, 409, { method: 'PATCH', cookie: reception, body: { status: 'completada' } });
  await call(statusPath, 200, { method: 'PATCH', cookie: reception, body: { status: 'confirmada' } });
  assert.equal((await call('/overview', 200, { cookie: tech })).data.appointments[0].id, appointment.id);

  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NgYGD4DwABBAEAVGr5JwAAAABJRU5ErkJggg==';
  const entry = { patientId: patient.id, appointmentId: appointment.id, kind: 'Resultado', title: 'Resultado de prueba', body: 'Prueba de integración.', image: { name: 'prueba.png', mime: 'image/png', data: png } };
  await call('/entries', 403, { method: 'POST', cookie: tech, body: { ...entry, kind: 'Informe' } });
  await call('/entries', 201, { method: 'POST', cookie: tech, body: entry });
  const { data: history } = await call('/history/' + patient.id, 200, { cookie: admin });
  assert.equal(history.patient.phone, '0001');
  assert.equal(history.entries[0].title, entry.title.toUpperCase());
  const attachment = '/attachments/' + history.entries[0].attachments[0].id;
  await call(attachment, 403, { cookie: reception });
  assert.deepEqual((await call(attachment, 200, { cookie: admin })).data, Buffer.from(png, 'base64'));
  const files = [entry.image, { ...entry.image, name: 'segunda-vista.png' }];
  const { data: radiography } = await call('/appointments', 201, { method: 'POST', cookie: reception,
    body: { ...details, day: '2026-11-10', specialty: 'rayosx' } });
  const imaging = { appointmentId: radiography.id, kind: 'Resultado', imaging: true, title: 'Radiografía de prueba', images: files };
  await call('/entries', 400, { method: 'POST', cookie: admin, body: { ...imaging, appointmentId: null } });
  await call('/entries', 400, { method: 'POST', cookie: admin, body: { ...imaging, patientId: patient.id + 1 } });
  await call('/entries', 400, { method: 'POST', cookie: admin, body: { ...imaging, images: [] } });
  await call('/entries', 400, { method: 'POST', cookie: admin, body: { ...imaging, images: [files[0], { ...files[1], data: 'bm8gZXMgdW4gcG5n' }] } });
  await call('/entries', 403, { method: 'POST', cookie: tech, body: imaging });
  await call('/entries', 201, { method: 'POST', cookie: admin, body: { ...imaging, specialty: 'ecografia', studyDate: '2026-11-12' } });
  const imagingHistory = (await call('/history/' + patient.id, 200, { cookie: admin })).data.entries;
  assert.deepEqual(imagingHistory.map(item => [item.appointment_id, item.specialty, item.study_day, item.attachments.length]),
    [[radiography.id, 'rayosx', '2026-11-10', 2], [appointment.id, 'ecografia', '2026-11-12', 1]]);

  const snapshot = (await call('/backup', 200, { method: 'POST', cookie: admin })).data;
  const backupPath = join(directory, 'restored.sqlite');
  await writeFile(backupPath, snapshot);
  const restored = openStore(backupPath);
  try {
    assert.equal(restored.patient(patient.id).phone, '0001');
    assert.equal(restored.attachments(imagingHistory[0].id).length, 2);
    assert.equal(restored.auditLog()[0].action, 'copia_seguridad');
  } finally {
    restored.close();
  }
  await call('/logout', 200, { method: 'POST', cookie: admin });
  await call('/overview', 401, { cookie: admin });
});
