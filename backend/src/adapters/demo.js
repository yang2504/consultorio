import { randomBytes } from 'node:crypto';
import { createClinic } from '../application/clinic.js';

export function seedDemo(store) {
  const clinic = createClinic(store);
  const password = randomBytes(24).toString('hex');
  const admin = clinic.setup({ name: 'Administración', username: 'admin', password });
  const id = clinic.addStaff(admin, { name: 'Dr. Teeddy Cuiza Vera', username: 'teeddy', password, role: 'medico' });
  const doctor = store.staffById(id);
  const names = ['Sofía Álvarez', 'Diego Flores', 'Camila Rojas', 'Mateo Vargas', 'Valentina Pérez', 'Bruno Mendoza'];
  const patients = names.map((name, index) => clinic.savePatient(doctor, {
    name, document: 'DEMO-' + (101 + index), age: 36, phone: ''
  }));
  const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/La_Paz' }).slice(0, 7);
  const sample = [
    [3, 'consulta', '09:00'], [5, 'consulta', '10:00'], [7, 'consulta', '10:30'],
    [10, 'consulta', '08:00'], [12, 'ecografia', '14:00'], [17, 'consulta', '11:30'],
    [19, 'consulta', '16:00'], [21, 'consulta', '09:30'], [24, 'consulta', '11:00'],
    [26, 'tomografia', '15:00']
  ];
  sample.forEach(([day, specialty, start], index) => {
    const patientId = patients[index % patients.length];
    const appointmentId = clinic.saveAppointment(doctor, {
      patientId, professionalId: id, specialty, day: month + '-' + String(day).padStart(2, '0'), start, duration: 30,
      visitType: index < 6 ? 'primera' : 'reconsulta'
    });
    if (index === 0) {
      clinic.setStatus(doctor, appointmentId, 'confirmada');
      clinic.addEntry(doctor, {
        patientId, appointmentId, kind: 'Consulta', title: 'Primera consulta', body: 'Antecedentes y consulta de demostración.',
        diagnosis: 'Registro ficticio para probar el historial médico.'
      });
    }
  });
  return doctor;
}
