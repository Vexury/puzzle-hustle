import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, process.cwd(), 'VITE_')['VITE_BASE'] ?? '/',
  plugins: [react({ compiler: true })],
  server: { port: 5173 },
  build: { target: 'es2023' },
}));
