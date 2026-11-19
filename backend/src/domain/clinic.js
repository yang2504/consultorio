export const specialties = {
  consulta: 'Consulta general',
  laboratorio: 'Laboratorio',
  ecografia: 'Ecografía',
  tomografia: 'Tomografía',
  rayosx: 'Rayos X'
};

export const transitions = {
  pendiente: ['confirmada', 'cancelada'],
  confirmada: ['en_atencion', 'cancelada'],
  en_atencion: ['completada'],
  completada: [],
  cancelada: []
};

export const roles = ['administrador', 'medico', 'recepcion', 'tecnico'];

export class ClinicError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function field(value, label, max, required = true) {
  if (!required && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new ClinicError(`${label}: ingresa un valor válido de hasta ${max} caracteres.`);
  }
  const normalized = value.trim().toLocaleUpperCase('es');
  if (normalized.length > max) throw new ClinicError(`${label}: el valor es demasiado largo.`);
  return normalized;
}

export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ClinicError('Selecciona una fecha válida.');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ClinicError('Selecciona una fecha válida.');
  }
  return value;
}

export function time(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new ClinicError('Selecciona una hora válida.');
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function specialty(value) {
  if (!Object.hasOwn(specialties, value)) throw new ClinicError('Selecciona una especialidad válida.');
  return value;
}
