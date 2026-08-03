import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // Ingen sourcemaps i produktion: statisk build der lægges bag Caddy.
    sourcemap: false,
  },
  server: {
    host: true, // så telefonen på samme net kan nå dev-serveren
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
