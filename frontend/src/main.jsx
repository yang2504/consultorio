import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { Calendar, DayAgenda } from './Calendar.jsx';
import { AppointmentDetails, AppointmentForm, Dialog, EntryForm, PatientForm, StaffForm } from './Forms.jsx';
import { AppointmentList, History, PatientList, Reports, Settings } from './Pages.jsx';
import { Brand, Shell, SignIn } from './Shell.jsx';
import { clinical, patientCode, specialties } from './clinic.js';
import './styles.css';

const currentRoute = () => window.location.hash.slice(1) || 'inicio';

function App() {
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [route, setRoute] = useState(currentRoute);
  const [history, setHistory] = useState(null);
  const [modal, setModal] = useState(null);
  const [report, setReport] = useState(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const user = session?.user;
  const historyId = /^historial\/(\d+)$/.exec(route)?.[1];
  const activeHistory = String(history?.patient.id) === historyId ? history : null;

  const refreshSession = useCallback(async () => {
    setError('');
    setSession(await api('/session'));
  }, []);
  const handleError = useCallback(error => {
    setError(error.message);
    if (error.status === 401) {
      setData(null);
      setModal(null);
      refreshSession().catch(error => setError(error.message));
    }
  }, [refreshSession]);

  useEffect(() => {
    refreshSession().catch(handleError);
    const onHashChange = () => { setRoute(currentRoute()); setError(''); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [refreshSession, handleError]);

  useEffect(() => {
    if (!user) return;
    let current = true;
    api('/overview').then(value => { if (current) setData(value); }).catch(error => { if (current) handleError(error); });
    return () => { current = false; };
  }, [user, revision, handleError]);

  useEffect(() => {
    if (!historyId || !user || !clinical(user)) return;
    let current = true;
    api('/history/' + historyId).then(value => { if (current) setHistory(value); }).catch(error => { if (current) handleError(error); });
    return () => { current = false; };
  }, [user, historyId, revision, handleError]);

  const go = path => { window.location.hash = path; };
  const openDay = day => setModal({ type: 'day-agenda', day });
  const done = () => {
    setModal(modal?.agendaDay ? { type: 'day-agenda', day: modal.agendaDay } : null);
    setRevision(revision => revision + 1);
  };
  const openAppointment = (item, agendaDay) => setModal({ type: 'appointment', item, agendaDay });
  const createAppointment = (day, specialty) => setModal({ type: 'appointment-form', day, specialty });
  const openHistory = id => { setHistory(null); setModal(null); go('historial/' + id); };

  async function logout() {
    try { await api('/logout', { method: 'POST' }); }
    catch (error) { if (error.status !== 401) return handleError(error); }
    setData(null);
    setHistory(null);
    setModal(null);
    setReport(null);
    go('inicio');
    refreshSession().catch(handleError);
  }

  function print(patient, entry) {
    setReport({ patient, entry });
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  if (!session) return <main className="signin"><section className="signin-card panel" aria-live="polite">
    <p>{error || 'Cargando el consultorio…'}</p>
    {error && <button className="secondary" onClick={() => refreshSession().catch(handleError)}>Reintentar</button>}
  </section></main>;
  if (!user) return <SignIn config={session} accept={setSession} />;

  const canSchedule = user.role !== 'tecnico';
  const canReadHistory = clinical(user);
  const specialty = route.startsWith('especialidades/') ? route.split('/')[1] : null;
  let page;
  if (data) {
    if (route === 'pacientes' && canSchedule || route === 'historial' && canReadHistory) page = <PatientList key={route} patients={data.patients}
      history={route === 'historial'} open={canReadHistory && openHistory} add={() => setModal({ type: 'patient' })} edit={patient => setModal({ type: 'patient', patient })} />;
    else if (historyId && canReadHistory) page = <History key={historyId} data={activeHistory} back={() => go('historial')}
      add={() => setModal({ type: 'entry' })} addImages={specialty => setModal({ type: 'images', specialty })} print={print} />;
    else if (route === 'citas' || Object.hasOwn(specialties, specialty)) page = <AppointmentList key={route} appointments={data.appointments} specialty={specialty} canSchedule={canSchedule} open={openAppointment} add={() => createAppointment(undefined, specialty)} />;
    else if (route === 'reportes' && canSchedule) page = <Reports data={data} />;
    else if (route === 'configuracion' && user.role === 'administrador') page = <Settings revision={revision} add={() => setModal({ type: 'staff' })} />;
    else page = <Calendar appointments={data.appointments} canSchedule={canSchedule} openAppointment={openAppointment} openDay={openDay}
      createPatient={() => setModal({ type: 'patient' })} createAppointment={createAppointment} go={go} />;
  }

  const item = modal?.item;
  const titles = {
    patient: modal?.patient ? 'Editar paciente' : 'Nuevo paciente',
    'day-agenda': 'Agenda del día',
    appointment: 'Detalle de la cita', 'appointment-form': item ? 'Reprogramar cita' : 'Nueva cita',
    entry: user.role === 'tecnico' ? 'Registrar resultado' : 'Nuevo registro clínico',
    images: 'Cargar imágenes del estudio', staff: 'Nuevo usuario'
  };

  return <>
    <Shell user={user} demo={session.demo} route={route} go={go} logout={logout} appointments={data?.appointments ?? []} openAppointment={openAppointment}>
      {error && <p className="error workspace-error" role="alert">{error}</p>}
      {page ?? (!error && <p className="empty">Cargando agenda…</p>)}
    </Shell>
    {modal && data && <Dialog key={modal.type} title={titles[modal.type]} close={() => setModal(null)}
      back={modal.agendaDay && (() => openDay(modal.agendaDay))}
      className={modal.type === 'appointment-form' ? 'appointment-dialog' : undefined}>
      {modal.type === 'day-agenda' && <DayAgenda day={modal.day} appointments={data.appointments}
        open={appointment => openAppointment(appointment, modal.day)}
        create={canSchedule && (() => setModal({ type: 'appointment-form', day: modal.day, agendaDay: modal.day }))} />}
      {modal.type === 'patient' && <PatientForm patient={modal.patient} done={done} />}
      {modal.type === 'appointment-form' && <AppointmentForm item={item} day={modal.day} specialty={modal.specialty} data={data} done={done}
        patientCreated={async () => { setData(await api('/overview')); }} />}
      {modal.type === 'appointment' && <AppointmentDetails item={item} user={user} done={done} edit={() => setModal({ ...modal, type: 'appointment-form' })}
        history={canReadHistory && (() => openHistory(item.patient_id))} result={() => setModal({ ...modal, type: 'entry' })}
        upload={canReadHistory && item.status !== 'cancelada' && (() => setModal({ ...modal, type: 'images' }))} />}
      {['entry', 'images'].includes(modal.type) && <EntryForm item={item} patientId={item?.patient_id ?? Number(historyId)}
        patientName={activeHistory?.patient.name} technician={user.role === 'tecnico'} imaging={modal.type === 'images'} specialty={modal.specialty}
        done={() => {
          done();
          if (modal.type === 'images' && item && !modal.agendaDay) go('historial/' + item.patient_id);
        }}
        appointments={data.appointments.filter(a => a.patient_id === Number(historyId))} />}
      {modal.type === 'staff' && <StaffForm done={done} />}
    </Dialog>}
    {report && <article className="print-report">
      <Brand />
      <h1>{report.entry.title}</h1>
      <dl>
        <dt>Paciente</dt><dd>{report.patient.name} · {patientCode(report.patient.id)}</dd>
        <dt>Documento</dt><dd>{report.patient.document}</dd>
        <dt>Profesional</dt><dd>{report.entry.author}</dd>
        <dt>Fecha</dt><dd>{new Date(report.entry.created_at).toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' })}</dd>
        {report.entry.specialty && <><dt>Especialidad</dt><dd>{specialties[report.entry.specialty].name}</dd></>}
      </dl>
      <p>{report.entry.body}</p>
      {report.entry.diagnosis && <><h2>Diagnóstico</h2><p>{report.entry.diagnosis}</p></>}
    </article>}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
