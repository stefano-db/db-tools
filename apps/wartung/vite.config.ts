import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Die App läuft unter einer eigenen Subdomain (z. B. wartung.example.de) und
// damit im Wurzelverzeichnis. Soll sie später als Unterpfad einer bestehenden
// Seite ausgeliefert werden, hier und im Router-basename '/wartung/' eintragen.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5178 },
});
