import { CalendarDays, FlaskConical, ScanLine, Radio, Scan } from 'lucide-react';

export const specialties = {
  consulta: { name: 'Consulta general', description: 'Atención del consultorio', icon: CalendarDays },
  laboratorio: { name: 'Laboratorio', description: 'Análisis y resultados', icon: FlaskConical },
  ecografia: { name: 'Ecografía', description: 'Estudios ecográficos', icon: ScanLine },
  tomografia: { name: 'Tomografía', description: 'Estudios tomográficos', icon: Radio },
  rayosx: { name: 'Rayos X', description: 'Estudios radiográficos', icon: Scan }
};

export const statuses = {
  pendiente: 'Pendiente', confirmada: 'Confirmada', en_atencion: 'En atención',
  completada: 'Completada', cancelada: 'Cancelada'
};
export const nextStatus = {
  pendiente: ['confirmada', 'cancelada'], confirmada: ['en_atencion', 'cancelada'],
  en_atencion: ['completada'], completada: [], cancelada: []
};
export const roles = {
  administrador: 'Administrador', medico: 'Médico', recepcion: 'Recepción', tecnico: 'Técnico'
};

export const clinical = user => ['administrador', 'medico'].includes(user.role);
export const clock = minutes => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/La_Paz' });
export const localDate = day => new Date(day + 'T12:00:00');
export const dateKey = date => date.toLocaleDateString('sv-SE');
export const longDate = day => new Intl.DateTimeFormat('es-BO', { dateStyle: 'long' }).format(localDate(day));
export const eventIcon = kind => ['laboratorio', 'tomografia'].includes(kind) ? specialties[kind].icon : CalendarDays;
export const patientCode = id => 'PAC-' + String(id).padStart(4, '0');

export const visitTypes = { primera: 'Primera consulta', reconsulta: 'Reconsulta' };
export const visitLabel = item => visitTypes[item.visit_type] ?? 'Consulta';
export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es').trim();
export function matchesPatient(patient, query) {
  const text = normalizeSearch([patient.name ?? patient.patient, patient.document ?? patient.patient_document, patient.id && patientCode(patient.id)].join(' '));
  return normalizeSearch(query).split(/\s+/).every(term => text.includes(term));
}
export function patientAge(patient) {
  if (patient.age !== null && patient.age !== undefined) return patient.age;
  if (!patient.birth_date) return '';
  const current = today();
  return Number(current.slice(0, 4)) - Number(patient.birth_date.slice(0, 4)) - (current.slice(5) < patient.birth_date.slice(5) ? 1 : 0);
}
