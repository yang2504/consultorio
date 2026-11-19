import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttp } from './adapters/http.js';
import { openStore } from './adapters/sqlite.js';
import { seedDemo } from './adapters/demo.js';
import { createClinic } from './application/clinic.js';

const demo = process.argv.includes('--demo');
const port = Number(process.env.CONSULTORIO_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto local inválido.');
const dataRoot = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : (process.env.LOCALAPPDATA ?? homedir());
const dbPath = demo ? ':memory:' : resolve(process.env.CONSULTORIO_DB ??
  join(dataRoot, 'ConsultorioLocal', 'consultorio.sqlite'));
const store = openStore(dbPath);
const demoUser = demo ? seedDemo(store) : null;
const clinic = createClinic(store);
const setupCode = process.argv.includes('--desktop') && /^[a-f0-9]{32}$/.test(process.env.CONSULTORIO_SETUP_CODE ?? '')
  ? process.env.CONSULTORIO_SETUP_CODE : randomBytes(8).toString('hex');
const publicPath = fileURLToPath(new URL('../../frontend/dist', import.meta.url));
const app = createHttp(clinic, { publicPath, setupCode, demoUser, port });
const url = 'http://127.0.0.1:' + port;
const server = app.listen(port, '127.0.0.1', () => {
  console.log('Consultorio disponible en ' + url);
  if (demo) console.log('Modo demostración. Los cambios se pierden al cerrar.');
  if (clinic.needsSetup()) console.log('Código para crear la cuenta inicial: ' + setupCode);
  if (process.argv.includes('--open') && ['win32', 'darwin'].includes(process.platform)) {
    const browser = spawn(process.platform === 'darwin' ? '/usr/bin/open' : 'explorer.exe', [url], { stdio: 'ignore', windowsHide: true, detached: true });
    browser.on('error', () => console.log('Abre manualmente ' + url));
    browser.unref();
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'El puerto está ocupado. Cierra la instancia anterior o usa otro puerto.' : error.message);
  process.exitCode = 1;
  store.close();
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(() => { store.close(); process.exit(0); });
  server.closeIdleConnections();
});
