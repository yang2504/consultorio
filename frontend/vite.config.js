import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  esbuild: { jsx: 'automatic' },
  build: { target: ['es2020', 'safari15.4'], cssTarget: 'safari15.4' },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4317', changeOrigin: true } }
  }
});
