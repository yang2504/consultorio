import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react';
import { clock, dateKey, eventIcon, localDate, longDate, specialties, statuses, today, visitLabel } from './clinic.js';
import { monthDays, monthLabel, moveDay, weekdays } from './DatePicker.jsx';

export function Calendar({ appointments, canSchedule, openAppointment, openDay, createAppointment, createPatient, go }) {
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState('Mes');
  const active = localDate(selected);
  const startWeek = moveDay(selected, -((active.getDay() + 6) % 7));
  const days = view === 'Mes' ? monthDays(selected) : view === 'Día' ? [selected]
    : Array.from({ length: 7 }, (_, index) => moveDay(startWeek, index));
  const title = view === 'Día' ? longDate(selected) : monthLabel(selected);
  const visible = appointments.filter(appointment => appointment.status !== 'cancelada');
  const dayCount = visible.filter(appointment => appointment.day === selected).length;
  const currentDay = today();
  const compact = view !== 'Día';

  function showDay(day) {
    setSelected(day);
    openDay(day);
  }

  function navigate(direction) {
    if (view === 'Mes') {
      setSelected(dateKey(new Date(active.getFullYear(), active.getMonth() + direction, 1, 12)));
    } else {
      setSelected(moveDay(selected, direction * (view === 'Semana' ? 7 : 1)));
    }
  }

  return <>
    <section className="calendar panel" aria-label="Calendario de citas">
      <header className="calendar-toolbar">
        <div className="calendar-heading"><CalendarDays size={28} /><h2>Calendario</h2></div>
        <div className="calendar-period">
          <button className="icon-button" aria-label="Periodo anterior" onClick={() => navigate(-1)}><ChevronLeft size={20} /></button>
          <h3>{title}</h3>
          <button className="icon-button" aria-label="Periodo siguiente" onClick={() => navigate(1)}><ChevronRight size={20} /></button>
        </div>
        <div className="calendar-actions">
          <div className="segmented" aria-label="Vista de calendario">
            {['Mes', 'Semana', 'Día'].map(item => <button key={item} aria-pressed={item === view} onClick={() => setView(item)}>{item}</button>)}
          </div>
          <button className="secondary calendar-today" onClick={() => setSelected(currentDay)}>Hoy</button>
          {canSchedule && <button className="secondary" onClick={createPatient}><Plus size={17} /> Nuevo paciente</button>}
          {canSchedule && <button className="primary" onClick={() => createAppointment(selected)}><Plus size={19} /> Nueva cita</button>}
        </div>
      </header>
      <div className="calendar-scroll">
        <div className={'calendar-grid ' + (view === 'Día' ? 'single-day' : '') + (view === 'Semana' ? ' week-view' : '')}>
          {(view === 'Día' ? [weekdays[(active.getDay() + 6) % 7]] : weekdays).map(day => <div key={day} className={'weekday ' + (day === 'Dom' ? 'sunday' : '')}>{day}</div>)}
          {days.map(day => {
            const current = localDate(day);
            const events = visible.filter(event => event.day === day);
            const hidden = compact ? Math.max(0, events.length - 2) : 0;
            return <div key={day} className={'calendar-day' + (day === selected ? ' selected-day' : '') + (day === currentDay ? ' current-day' : '') + (current.getMonth() !== active.getMonth() ? ' outside-month' : '') + (current.getDay() === 0 ? ' sunday' : '')}>
              <div className="day-controls">
                <button className="day-number" onClick={() => showDay(day)} aria-haspopup="dialog"
                  aria-label={'Ver agenda del ' + longDate(day) + (day === currentDay ? ', hoy' : '')}
                  aria-current={day === currentDay ? 'date' : undefined}>
                  <span>{current.getDate()}</span>{day === currentDay && <small>Hoy</small>}
                </button>
                {canSchedule && <button className="day-add" aria-label={'Programar cita el ' + longDate(day)} onClick={() => {
                  setSelected(day);
                  createAppointment(day);
                }}><Plus size={15} /></button>}
              </div>
              {(compact ? events.slice(0, 2) : events).map(event => {
                const Icon = eventIcon(event.specialty);
                return <button className={'event ' + event.specialty} key={event.id} onClick={() => openAppointment(event)} title={event.patient + ' · ' + specialties[event.specialty].name + ' · ' + clock(event.start)}>
                  <Icon size={14} /><span>{visitLabel(event)}</span><time>{clock(event.start)}</time>
                  {view === 'Día' && <small>{event.patient} · {event.professional}</small>}
                </button>;
              })}
              {hidden > 0 && <button className="event event-more" aria-haspopup="dialog" onClick={() => showDay(day)}
                aria-label={'Ver las ' + events.length + ' citas del ' + longDate(day)}><List size={14} /><span>+{hidden} más</span></button>}
              {view === 'Día' && !events.length && <div className="empty">No hay citas para este día.</div>}
            </div>;
          })}
        </div>
      </div>
      <footer className="calendar-selection">
        <div aria-live="polite"><strong>{longDate(selected)}</strong><span>{dayCount === 0 ? 'Sin citas' : dayCount === 1 ? '1 cita' : dayCount + ' citas'}</span></div>
        <button className="text-button" aria-haspopup="dialog" onClick={() => showDay(selected)}>Ver agenda del día <ChevronRight size={16} /></button>
      </footer>
    </section>
    <details className="secondary-options calendar-specialties"><summary>Estudios y especialidades</summary><div className="specialties" aria-label="Especialidades">
      {Object.entries(specialties).map(([id, item]) => <button className="specialty-card panel" key={id} onClick={() => go('especialidades/' + id)}>
        <span className={'specialty-icon ' + id}><item.icon size={31} strokeWidth={1.85} /></span>
        <span className="specialty-text"><strong>{item.name}</strong><small>{item.description}</small></span>
        <ChevronRight className="specialty-arrow" size={19} />
      </button>)}
    </div></details>
  </>;
}

export function DayAgenda({ day, appointments, open, create }) {
  const booked = appointments.filter(item => item.day === day && item.status !== 'cancelada');
  return <section className="day-agenda" aria-label="Citas del día">
    <header><div><strong>{longDate(day)}</strong><small>{booked.length} {booked.length === 1 ? 'cita' : 'citas'}</small></div>
      {create && <button type="button" className="primary" onClick={create}><Plus size={18} /> Nueva cita</button>}
    </header>
    {booked.length === 0 && <p className="empty">No hay citas programadas para este día.</p>}
    {booked.length > 0 && <ul>{booked.map(item => {
      const Icon = eventIcon(item.specialty);
      return <li key={item.id}><button type="button" className="day-appointment" onClick={() => open(item)}>
        <span className={'agenda-time ' + item.specialty}><Icon size={16} /><time>{clock(item.start)}</time></span>
        <span className="agenda-patient"><strong>{item.patient}</strong><small>{visitLabel(item)}{item.specialty !== 'consulta' && ' · ' + specialties[item.specialty].name}</small></span>
        <span className={'status ' + item.status}>{statuses[item.status]}</span><ChevronRight size={18} className="day-chevron" />
      </button></li>;
    })}</ul>}
  </section>;
}
