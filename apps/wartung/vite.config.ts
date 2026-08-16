import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base: '/wartung/' -> die App liegt als Unterpfad neben der bestehenden Website.
export default defineConfig({
  base: '/wartung/',
  plugins: [react(), tailwindcss()],
  server: { port: 5178 },
});
