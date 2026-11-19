import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ClipboardList, Download, FileText, Plus, Search, Users } from 'lucide-react';
import { api } from './api.js';
import { StudyImages } from './StudyImages.jsx';
import { clock, longDate, matchesPatient, patientAge, patientCode, roles, specialties, statuses, visitLabel, visitTypes } from './clinic.js';

export function PageHeader({ title, description, action }) {
  return <div className="page-heading"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>;
}

function SearchBox({ value, change, placeholder }) {
  return <label className="search"><Search size={18} /><input aria-label={placeholder} placeholder={placeholder} type="search" value={value} onChange={event => change(event.target.value)} /></label>;
}

export function PatientList({ patients, history, open, add, edit }) {
  const [query, setQuery] = useState('');
  const filter = query.trim();
  const matches = patients.filter(p => matchesPatient(p, query));
  return <section className="page panel">
    <PageHeader title={history ? 'Historial médico' : 'Pacientes'} description={history ? 'Busca un paciente para abrir su expediente.' : 'Registro y datos de contacto de los pacientes.'}
      action={!history && <button className="primary" onClick={add}><Plus size={18} /> Nuevo paciente</button>} />
    <SearchBox value={query} change={setQuery} placeholder="Buscar por carnet, nombre o apellido" />
    <div className="table-scroll"><table><thead><tr><th>Paciente</th><th>Carnet</th><th>Edad registrada</th><th>Teléfono</th><th>Acciones</th></tr></thead>
      <tbody>{matches.map(p => <tr key={p.id}><td><strong>{p.name}</strong><small>{patientCode(p.id)}</small></td><td>{p.document}</td><td>{patientAge(p)} años{p.age_recorded && <small>{longDate(p.age_recorded)}</small>}</td><td>{p.phone || '—'}</td>
        <td className="table-actions">{open && <button className="text-button" onClick={() => open(p.id)}>Expediente</button>}{!history && <button className="text-button" onClick={() => edit(p)}>Editar</button>}</td></tr>)}</tbody></table>
    {!matches.length && <p className="empty">{filter ? 'No se encontraron pacientes.' : 'Aún no hay pacientes registrados.'}</p>}</div>
  </section>;
}

export function AppointmentList({ appointments, specialty, canSchedule, open, add }) {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [day, setDay] = useState('');
  const [visit, setVisit] = useState('');
  const meta = specialties[specialty];
  const rows = appointments.filter(a => (!specialty || a.specialty === specialty) && (!status || a.status === status)
    && (!visit || a.visit_type === visit) && (!day || a.day === day) && matchesPatient(a, query));
  return <section className="page panel">
    <PageHeader title={meta?.name ?? 'Citas'} description={meta?.description ?? 'Agenda, disponibilidad y estados de atención.'}
      action={canSchedule && <button className="primary" onClick={add}><Plus size={18} /> Nueva cita</button>} />
    <div className="filters"><SearchBox value={query} change={setQuery} placeholder="Buscar por carnet, nombre o apellido" />
      <select aria-label="Filtrar tipo de consulta" value={visit} onChange={e => setVisit(e.target.value)}><option value="">Todas las consultas</option>{Object.entries(visitTypes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select aria-label="Filtrar por estado" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos los estados</option>{Object.entries(statuses).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <input type="date" aria-label="Filtrar por fecha" value={day} onChange={e => setDay(e.target.value)} /></div>
    <div className="table-scroll"><table><thead><tr><th>Fecha y hora</th><th>Paciente</th><th>Consulta</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>{rows.map(a => <tr key={a.id}><td><strong>{longDate(a.day)}</strong><small>{clock(a.start)}–{clock(a.end)}</small></td><td>{a.patient}<small>CI {a.patient_document}</small></td><td>{visitLabel(a)}{a.specialty !== 'consulta' && <small>{specialties[a.specialty].name}</small>}</td>
        <td><span className={'status ' + a.status}>{statuses[a.status]}</span></td><td><button className="text-button" onClick={() => open(a)}>Ver cita</button></td></tr>)}</tbody></table>
      {!rows.length && <p className="empty">No hay citas para los filtros seleccionados.</p>}</div>
  </section>;
}

export function History({ data, back, add, addImages, print }) {
  const [filter, setFilter] = useState('');
  if (!data) return <section className="page panel" aria-busy="true"><p className="empty">Cargando expediente…</p></section>;
  const { patient, entries } = data;
  const appointments = data.appointments ?? [];
  const shown = entries.filter(entry => !filter || (filter === 'diagnostico' ? entry.kind === 'Diagnóstico' || entry.diagnosis : entry.visit_type === filter));
  return <section className="page panel">
    <button className="text-button back" onClick={back}><ChevronLeft size={17} /> Volver a expedientes</button>
    <PageHeader title={patient.name} description={patientCode(patient.id) + ' · CI ' + patient.document + ' · ' + patientAge(patient) + ' años'}
      action={<button className="primary" onClick={add}><Plus size={18} /> Nuevo registro</button>} />
    <div className="consultation-breakdown" aria-label="Desglose de consultas">
      {Object.entries(visitTypes).map(([id, name]) => <span key={id}><strong>{appointments.filter(a => a.visit_type === id && a.status !== 'cancelada').length}</strong> {name}</span>)}
      <span><strong>{entries.filter(e => e.kind === 'Diagnóstico' || e.diagnosis).length}</strong> Registros con diagnóstico</span>
    </div>
    <div className="filters"><label>Ver historial<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todos los registros</option>
      <option value="primera">Primera consulta</option><option value="reconsulta">Reconsultas</option><option value="diagnostico">Diagnósticos</option></select></label></div>
    <div className="history-list"><h3>Historial médico</h3>{shown.map(entry => <article key={entry.id} className="clinical-entry">
      <div className="entry-heading"><span className="status confirmada">{entry.kind}{entry.visit_type && ' · ' + visitLabel(entry)}</span>{entry.kind === 'Informe' && <button className="text-button" onClick={() => print(patient, entry)}><FileText size={16} /> Imprimir / PDF</button>}</div>
      <h3>{entry.title}</h3>
      <small>{entry.author} · {new Date(entry.created_at).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}{entry.specialty && ' · ' + specialties[entry.specialty].name}</small>
      {entry.body && <p>{entry.body}</p>}
      {entry.diagnosis && <div className="clinical-diagnosis"><strong>Diagnóstico</strong><p>{entry.diagnosis}</p></div>}
    </article>)}
    {!shown.length && <p className="empty">No hay registros para esta selección.</p>}</div>
    <details className="secondary-options"><summary>Imágenes y estudios adjuntos</summary><StudyImages entries={entries} add={addImages} /></details>
  </section>;
}

export function Reports({ data }) {
  const [month, setMonth] = useState('');
  const appointments = data.appointments.filter(a => !month || a.day.startsWith(month));
  const completed = appointments.filter(a => a.status === 'completada');
  return <section className="page panel">
    <PageHeader title="Reportes" description="Consultas y seguimiento del consultorio." action={<input type="month" aria-label="Mes del reporte" value={month} onChange={e => setMonth(e.target.value)} />} />
    <div className="metrics">{[[CalendarDays, 'Citas registradas', appointments.length], [ClipboardList, 'Atenciones completadas', completed.length], [Users, 'Pacientes registrados', data.patients.length]].map(([Icon, label, value]) => <div key={label}><Icon size={22} /><strong>{value}</strong><small>{label}</small></div>)}</div>
    <div className="table-scroll"><table><thead><tr><th>Tipo de consulta</th><th>Citas</th><th>Completadas</th><th>Canceladas</th></tr></thead><tbody>
      {Object.entries({ ...visitTypes, sin_tipo: 'Sin clasificación anterior' }).map(([id, name]) => {
        const rows = appointments.filter(a => (a.visit_type ?? 'sin_tipo') === id);
        return <tr key={id}><td>{name}</td><td>{rows.length}</td><td>{rows.filter(a => a.status === 'completada').length}</td><td>{rows.filter(a => a.status === 'cancelada').length}</td></tr>;
      })}</tbody></table></div>
    <details className="secondary-options"><summary>Desglose por especialidad</summary><div className="table-scroll"><table><thead><tr><th>Especialidad</th><th>Citas</th><th>Completadas</th><th>Canceladas</th></tr></thead>
      <tbody>{Object.entries(specialties).map(([id, item]) => {
        const matches = appointments.filter(a => a.specialty === id);
        return <tr key={id}><td>{item.name}</td><td>{matches.length}</td><td>{matches.filter(a => a.status === 'completada').length}</td><td>{matches.filter(a => a.status === 'cancelada').length}</td></tr>;
      })}</tbody></table></div></details>
    <h3>Atenciones por profesional</h3>
    <div className="table-scroll"><table><thead><tr><th>Profesional</th><th>Citas</th><th>Completadas</th></tr></thead><tbody>{data.professionals.map(person => <tr key={person.id}><td>{person.name}</td><td>{appointments.filter(a => a.professional_id === person.id).length}</td><td>{completed.filter(a => a.professional_id === person.id).length}</td></tr>)}</tbody></table></div>
  </section>;
}

export function Settings({ revision, add }) {
  const [data, setData] = useState({ staff: [], audit: [] });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([api('/staff'), api('/audit')]).then(([staff, audit]) => {
      if (active) setData({ staff, audit });
    }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [revision]);
  async function backup() {
    setBusy(true);
    setMessage('');
    try {
      const file = await api('/backup', { method: 'POST', download: true });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'consultorio-' + new Date().toISOString().slice(0, 10) + '.sqlite';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const audit = await api('/audit');
      setData(current => ({ ...current, audit }));
      setMessage('Copia de seguridad generada.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section className="page panel">
    <PageHeader title="Configuración" description="Personal, auditoría y copias de seguridad."
      action={<div className="row-actions"><button className="secondary" onClick={backup} disabled={busy}><Download size={18} /> Copia de seguridad</button><button className="primary" onClick={add}><Plus size={18} /> Nuevo usuario</button></div>} />
    {message && <p role="status">{message}</p>}
    <h3>Personal</h3>
    <div className="table-scroll"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Perfil</th></tr></thead><tbody>{data.staff.map(person => <tr key={person.id}><td>{person.name}</td><td>{person.username}</td><td>{roles[person.role]}</td></tr>)}</tbody></table></div>
    <h3>Actividad reciente</h3>
    <div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Registro</th></tr></thead><tbody>{data.audit.map(item => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}</td><td>{item.name}</td><td>{item.action.replaceAll('_', ' ')}</td><td>{item.entity_id ?? '—'}</td></tr>)}</tbody></table></div>
  </section>;
}
