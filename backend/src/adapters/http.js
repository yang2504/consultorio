import express from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ClinicError } from '../domain/clinic.js';

const cookieName = 'consultorio_sid';
const sessionDuration = 8 * 60 * 60 * 1000;
const maxImageBytes = 5 * 1024 * 1024;
const signatures = {
  'image/png': Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  'image/jpeg': Buffer.from([255, 216, 255])
};

function image(input) {
  const signature = input && Object.hasOwn(signatures, input.mime) && signatures[input.mime];
  if (!signature) throw new ClinicError('Adjunta imágenes JPG o PNG de hasta 5 MB por archivo.');
  const validData = typeof input.data === 'string' && input.data.length <= Math.ceil(maxImageBytes / 3) * 4;
  if (!validData) throw new ClinicError('Adjunta imágenes JPG o PNG de hasta 5 MB por archivo.');
  const data = Buffer.from(input.data, 'base64');
  if (data.length > maxImageBytes || !data.subarray(0, signature.length).equals(signature)) {
    throw new ClinicError('El archivo no coincide con el formato de imagen seleccionado.');
  }
  const name = typeof input.name === 'string' ? input.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 150) : '';
  return { name: name || 'imagen', mime: input.mime, data };
}

function images(body) {
  const attachments = body.images ?? (body.image ? [body.image] : []);
  if (!Array.isArray(attachments) || attachments.length > 4) throw new ClinicError('Adjunta hasta cuatro imágenes por estudio.');
  return attachments.map(image);
}

function recordId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ClinicError('Identificador inválido.');
  return id;
}

export function createHttp(clinic, { publicPath, setupCode, demoUser = null, port }) {
  const app = express();
  const sessions = new Map();
  const address = '127.0.0.1:' + port;
  const loginWindow = 60_000;
  let nextWindow = 0;
  let attempts = 0;

  function limitAttempts() {
    if (Date.now() >= nextWindow) {
      nextWindow = Date.now() + loginWindow;
      attempts = 0;
    }
    if (++attempts > 15) throw new ClinicError('Demasiados intentos. Vuelve a intentar en un minuto.', 429);
  }

  function session(req, res, user) {
    const now = Date.now();
    for (const [token, value] of sessions) if (value.expires <= now) sessions.delete(token);
    sessions.delete(req.sessionToken);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { user, expires: now + sessionDuration });
    res.cookie(cookieName, token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: sessionDuration });
    res.json({ user, demo: Boolean(demoUser) });
  }

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (req.headers.host !== address) return res.status(403).end();
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && (req.get('X-Consultorio') !== 'local' ||
      (req.headers.origin && req.headers.origin !== 'http://' + address && req.headers.origin !== 'http://127.0.0.1:5173'))) {
      return next(new ClinicError('Solicitud de origen no permitido.', 403));
    }
    req.sessionToken = req.headers.cookie?.match(/(?:^|; )consultorio_sid=([a-f0-9]{64})(?:;|$)/)?.[1];
    const value = sessions.get(req.sessionToken);
    req.actor = value?.expires > Date.now() ? value.user : null;
    next();
  });
  const json = express.json({ limit: '256kb' });
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && req.path.replace(/\/$/, '').toLowerCase() === '/entries') return next();
    json(req, res, next);
  });

  app.get('/api/session', (req, res) => res.json({
    user: req.actor, needsSetup: clinic.needsSetup(), demo: Boolean(demoUser)
  }));
  app.post('/api/setup', (req, res) => {
    limitAttempts();
    const code = Buffer.from(String(req.body?.code ?? ''));
    const expected = Buffer.from(setupCode);
    if (code.length !== expected.length || !timingSafeEqual(code, expected)) throw new ClinicError('Código de configuración incorrecto.', 403);
    session(req, res, clinic.setup(req.body));
  });
  app.post('/api/login', (req, res) => {
    limitAttempts();
    session(req, res, clinic.login(req.body?.username, req.body?.password));
  });
  app.post('/api/demo', (req, res) => {
    limitAttempts();
    if (!demoUser) throw new ClinicError('La demostración no está disponible.', 404);
    session(req, res, demoUser);
  });
  app.use('/api', (req, res, next) => {
    if (!req.actor) return next(new ClinicError('Inicia sesión para continuar.', 401));
    next();
  });
  app.post('/api/logout', (req, res) => {
    sessions.delete(req.sessionToken);
    res.clearCookie(cookieName, { path: '/' }).json({ ok: true });
  });
  app.get('/api/overview', (req, res) => res.json(clinic.overview(req.actor)));
  app.post('/api/patients', (req, res) => res.status(201).json({ id: clinic.savePatient(req.actor, req.body ?? {}) }));
  app.put('/api/patients/:id', (req, res) => res.json({ id: clinic.savePatient(req.actor, req.body ?? {}, recordId(req.params.id)) }));
  app.post('/api/appointments', (req, res) => res.status(201).json({ id: clinic.saveAppointment(req.actor, req.body ?? {}) }));
  app.put('/api/appointments/:id', (req, res) => res.json({ id: clinic.saveAppointment(req.actor, req.body ?? {}, recordId(req.params.id)) }));
  app.patch('/api/appointments/:id/status', (req, res) => {
    clinic.setStatus(req.actor, recordId(req.params.id), req.body?.status);
    res.json({ ok: true });
  });
  app.get('/api/history/:id', (req, res) => res.json(clinic.history(req.actor, recordId(req.params.id))));
  app.post('/api/entries', express.json({ limit: '28mb' }), (req, res) => {
    const body = req.body ?? {};
    res.status(201).json({ id: clinic.addEntry(req.actor, body, images(body)) });
  });
  app.get('/api/attachments/:id', (req, res) => {
    const file = clinic.attachment(req.actor, recordId(req.params.id));
    res.type(file.mime).send(Buffer.from(file.data));
  });
  app.get('/api/staff', (req, res) => res.json(clinic.staff(req.actor)));
  app.post('/api/staff', (req, res) => res.status(201).json({ id: clinic.addStaff(req.actor, req.body ?? {}) }));
  app.get('/api/audit', (req, res) => res.json(clinic.auditLog(req.actor)));
  app.post('/api/backup', (req, res, next) => {
    const directory = mkdtempSync(join(tmpdir(), 'consultorio-backup-'));
    const path = join(directory, 'consultorio.sqlite');
    const cleanup = () => rmSync(directory, { recursive: true, force: true });
    try {
      clinic.backup(req.actor, path);
      res.download(path, 'consultorio-' + new Date().toISOString().slice(0, 10) + '.sqlite', error => {
        cleanup();
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      cleanup();
      next(error);
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no disponible.' }));
  app.use(express.static(publicPath));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ClinicError) return res.status(error.status).json({ error: error.message });
    if (error.status === 413) return res.status(413).json({ error: 'El archivo supera el tamaño permitido.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Solicitud inválida.' });
    console.error(error);
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  });
  return app;
}
