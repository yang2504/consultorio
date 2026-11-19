PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('administrador','medico','recepcion','tecnico')),
  password_hash TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  document TEXT NOT NULL COLLATE NOCASE UNIQUE,
  birth_date TEXT NOT NULL,
  phone TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  professional_id INTEGER NOT NULL REFERENCES staff(id),
  technician_id INTEGER REFERENCES staff(id),
  specialty TEXT NOT NULL CHECK(specialty IN ('consulta','laboratorio','ecografia','tomografia','rayosx')),
  day TEXT NOT NULL,
  start INTEGER NOT NULL CHECK(start BETWEEN 0 AND 1439),
  end INTEGER NOT NULL CHECK(end > start AND end <= 1440),
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','confirmada','en_atencion','completada','cancelada'))
) STRICT;

CREATE INDEX IF NOT EXISTS appointment_schedule ON appointments (day, professional_id, start);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  author_id INTEGER NOT NULL REFERENCES staff(id),
  kind TEXT NOT NULL CHECK(kind IN ('Antecedente','Consulta','Diagnóstico','Orden','Resultado','Informe')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES staff(id),
  action TEXT NOT NULL,
  entity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
