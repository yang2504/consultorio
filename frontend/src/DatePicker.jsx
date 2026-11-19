import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dateKey, localDate, longDate, today } from './clinic.js';

export const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function moveDay(day, delta) {
  const date = localDate(day);
  date.setDate(date.getDate() + delta);
  return dateKey(date);
}

export function monthDays(day) {
  const date = localDate(day);
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
  const offset = (first.getDay() + 6) % 7;
  const start = moveDay(dateKey(first), -offset);
  return Array.from({ length: Math.ceil((end.getDate() + offset) / 7) * 7 }, (_, index) => moveDay(start, index));
}

export const monthLabel = day => new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric' }).format(localDate(day));

export function DatePicker({ value, onChange, appointments, isAvailable }) {
  const [month, setMonth] = useState(value);
  const [cursor, setCursor] = useState(value);
  const grid = useRef(null);
  const currentDay = today();

  function choose(day) {
    setMonth(day);
    setCursor(day);
    onChange(day);
  }

  function navigate(amount) {
    const current = localDate(month);
    const next = dateKey(new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
    setMonth(next);
    setCursor(next);
  }

  function keyboard(event, day) {
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!Object.hasOwn(steps, event.key)) return;
    event.preventDefault();
    const next = moveDay(day, steps[event.key]);
    setMonth(next);
    setCursor(next);
    requestAnimationFrame(() => grid.current?.querySelector('[data-day="' + next + '"]')?.focus());
  }

  return <div className="mini-calendar" role="group" aria-label="Fecha de la cita">
    <div className="mini-month">
      <button type="button" className="icon-button" aria-label="Mes anterior" onClick={() => navigate(-1)}><ChevronLeft size={17} /></button>
      <strong aria-live="polite">{monthLabel(month)}</strong>
      <button type="button" className="icon-button" aria-label="Mes siguiente" onClick={() => navigate(1)}><ChevronRight size={17} /></button>
    </div>
    <div className="mini-days" ref={grid}>
      {weekdays.map(day => <small key={day} aria-hidden="true">{day}</small>)}
      {monthDays(month).map(day => {
        const outside = !day.startsWith(month.slice(0, 7));
        const occupied = !outside && appointments.some(item => item.day === day && !isAvailable(item, day));
        return <button key={day} type="button" data-day={day} tabIndex={day === cursor ? 0 : -1}
          className={outside ? 'mini-outside' : undefined} aria-current={day === currentDay ? 'date' : undefined}
          aria-pressed={day === value} aria-label={longDate(day) + (occupied ? ', horario en conflicto' : '')}
          onClick={() => choose(day)} onKeyDown={event => keyboard(event, day)}>
          <span>{Number(day.slice(-2))}</span>{occupied && <i aria-hidden="true" />}
        </button>;
      })}
    </div>
    <div className="mini-footer"><span><i /> Cruce a la hora indicada</span>
      <button type="button" className="text-button" onClick={() => choose(currentDay)}>Ir a hoy</button>
    </div>
  </div>;
}
