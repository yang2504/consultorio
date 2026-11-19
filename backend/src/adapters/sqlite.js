import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ClinicError } from '../domain/clinic.js';

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    const appointmentSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='appointments'").get().sql;
    if (!appointmentSql.includes("'consulta'")) {
      const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
      const table = schema.match(/CREATE TABLE IF NOT EXISTS appointments \([\s\S]*?\) STRICT;/)[0];
      db.exec(table.replace('IF NOT EXISTS appointments', 'appointments_new'));
      db.exec(`INSERT INTO appointments_new SELECT * FROM appointments;
        DROP TABLE appointments; ALTER TABLE appointments_new RENAME TO appointments;
        CREATE INDEX appointment_schedule ON appointments (day, professional_id, start)`);
    }
    const patientColumns = db.prepare('PRAGMA table_info(patients)').all();
    if (!patientColumns.some(column => column.name === 'age')) {
      db.exec('ALTER TABLE patients ADD COLUMN age INTEGER CHECK(age BETWEEN 0 AND 130)');
      db.exec('ALTER TABLE patients ADD COLUMN age_recorded TEXT');
    }
    const appointmentColumns = db.prepare('PRAGMA table_info(appointments)').all();
    if (!appointmentColumns.some(column => column.name === 'visit_type')) {
      db.exec("ALTER TABLE appointments ADD COLUMN visit_type TEXT CHECK(visit_type IN ('primera','reconsulta'))");
    }
    const columns = db.prepare('PRAGMA table_info(entries)').all();
    if (!columns.some(column => column.name === 'diagnosis')) {
      db.exec("ALTER TABLE entries ADD COLUMN diagnosis TEXT NOT NULL DEFAULT ''");
    }
    if (!columns.some(column => column.name === 'study_specialty')) {
      db.exec(`ALTER TABLE entries ADD COLUMN study_specialty TEXT
        CHECK(study_specialty IN ('laboratorio','ecografia','tomografia','rayosx'))`);
    }
    if (!columns.some(column => column.name === 'study_date')) {
      db.exec('ALTER TABLE entries ADD COLUMN study_date TEXT');
    }
    for (const [table, fields] of [['patients', ['name', 'document', 'phone']], ['staff', ['name', 'username']], ['entries', ['title', 'body', 'diagnosis']]]) {
      const rows = db.prepare('SELECT * FROM ' + table).all();
      const update = db.prepare('UPDATE ' + table + ' SET ' + fields.map(field => field + '=?').join(',') + ' WHERE id=?');
      for (const row of rows) update.run(...fields.map(field => row[field].toLocaleUpperCase('es')), row.id);
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('La migración contiene vínculos inválidos.');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }
  db.exec('PRAGMA foreign_keys = ON');
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const get = (sql, ...params) => db.prepare(sql).get(...params);
  const run = (sql, ...params) => db.prepare(sql).run(...params);
  const write = (sql, ...params) => Number(run(sql, ...params).lastInsertRowid);
  const staffColumns = 'id, name, username, role';
  const appointmentColumns = `SELECT a.*, p.name AS patient, p.document AS patient_document, s.name AS professional, t.name AS technician
    FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN staff s ON s.id = a.professional_id
    LEFT JOIN staff t ON t.id = a.technician_id`;

  return {
    close: () => db.close(),
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        if (error.errcode === 2067) throw new ClinicError('El documento o usuario ya existe.', 409);
        throw error;
      }
    },
    countStaff: () => get('SELECT count(*) AS count FROM staff').count,
    staff: () => all(`SELECT ${staffColumns} FROM staff ORDER BY name`),
    professionals: () => all(`SELECT id, name FROM staff WHERE role = 'medico'
      OR (role='administrador' AND NOT EXISTS(SELECT 1 FROM staff WHERE role='medico')) ORDER BY id LIMIT 1`),
    technicians: () => all("SELECT id, name FROM staff WHERE role = 'tecnico' ORDER BY name"),
    staffById: id => get(`SELECT ${staffColumns} FROM staff WHERE id = ?`, id),
    staffByUsername: username => get('SELECT * FROM staff WHERE username = ?', username),
    addStaff: (name, username, role, hash) => write(
      'INSERT INTO staff (name, username, role, password_hash) VALUES (?, ?, ?, ?)', name, username, role, hash
    ),
    patients: () => all('SELECT * FROM patients ORDER BY name'),
    patient: id => get('SELECT * FROM patients WHERE id = ?', id),
    addPatient: (...data) => write('INSERT INTO patients (name, document, birth_date, phone, age, age_recorded) VALUES (?, ?, ?, ?, ?, ?)', ...data),
    updatePatient: (id, ...data) => run(
      'UPDATE patients SET name = ?, document = ?, birth_date = ?, phone = ?, age = ?, age_recorded = ? WHERE id = ?', ...data, id
    ),
    appointments: () => all(`${appointmentColumns} ORDER BY a.day, a.start, a.id`),
    appointment: id => get(`${appointmentColumns} WHERE a.id = ?`, id),
    conflicts: (patient, professional, technician, kind, day, start, end, exclude) => get(`SELECT id FROM appointments
      WHERE day = ? AND (patient_id = ? OR professional_id = ? OR technician_id = ? OR specialty = ?)
      AND status <> 'cancelada' AND start < ? AND end > ? AND id <> ?`, day, patient, professional, technician, kind, end, start, exclude),
    addAppointment: (...data) => write(
      'INSERT INTO appointments (patient_id, professional_id, specialty, day, start, end, technician_id, visit_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ...data
    ),
    updateAppointment: (id, ...data) => run(
      'UPDATE appointments SET patient_id=?, professional_id=?, specialty=?, day=?, start=?, end=?, technician_id=?, visit_type=? WHERE id=?', ...data, id
    ),
    setStatus: (id, status) => run('UPDATE appointments SET status = ? WHERE id = ?', status, id),
    entries: patient => all(`SELECT e.*, s.name AS author,
      COALESCE(a.specialty, e.study_specialty) AS specialty, COALESCE(e.study_date, a.day) AS study_day,
      a.day AS appointment_day, a.start AS appointment_start, a.visit_type
      FROM entries e JOIN staff s ON s.id=e.author_id LEFT JOIN appointments a ON a.id=e.appointment_id
      WHERE e.patient_id=? ORDER BY e.id DESC`, patient),
    entry: id => get('SELECT * FROM entries WHERE id = ?', id),
    addEntry: (...data) => write(`INSERT INTO entries
      (patient_id, appointment_id, author_id, kind, title, body, study_specialty, study_date, diagnosis)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...data),
    attachments: entry => all('SELECT id, name, mime FROM attachments WHERE entry_id = ?', entry),
    attachment: id => get('SELECT * FROM attachments WHERE id = ?', id),
    addAttachment: (...data) => write('INSERT INTO attachments (entry_id, name, mime, data) VALUES (?, ?, ?, ?)', ...data),
    audit: (actor, action, entity = null) => run(
      'INSERT INTO audit (actor_id, action, entity_id) VALUES (?, ?, ?)', actor, action, entity
    ),
    auditLog: () => all(`SELECT a.*, s.name FROM audit a JOIN staff s ON s.id = a.actor_id ORDER BY a.id DESC LIMIT 200`),
    backup: path => run('VACUUM INTO ?', path)
  };
}
