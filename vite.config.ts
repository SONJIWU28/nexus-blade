import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/nexus-blade/',
  server: {
    host: true,
    port: 5173
  },
  build: {
    sourcemap: false,
    target: 'es2020'
  }
});
