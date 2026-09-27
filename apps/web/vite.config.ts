import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Tags usage events with the commit they were built from.
function build(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, process.cwd(), 'VITE_')['VITE_BASE'] ?? '/',
  plugins: [react({ compiler: true })],
  define: { __BUILD__: JSON.stringify(build()) },
  server: { port: 5173 },
  build: { target: 'es2023' },
}));
