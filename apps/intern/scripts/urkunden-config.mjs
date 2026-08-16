/**
 * Schreibt die Supabase-Zugangsdaten für das Urkundensystem.
 *
 * Das Urkundensystem ist eine statische Seite und wird nicht von Vite gebaut —
 * es kann import.meta.env also nicht lesen. Deshalb landen die Werte vor dem
 * Build in einer kleinen config.json daneben.
 *
 * Beide Werte sind ohnehin öffentlich: der anon key steckt genauso im
 * ausgelieferten JavaScript der Plattform. Geschützt wird über die Anmeldung
 * und die RLS-Regeln der Datenbank, nicht über Geheimhaltung dieses Schlüssels.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// Lokal kommen die Werte aus .env, auf Cloudflare aus den Umgebungsvariablen.
const fromEnvFile = {};
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) fromEnvFile[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const url = process.env.VITE_SUPABASE_URL || fromEnvFile.VITE_SUPABASE_URL || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || fromEnvFile.VITE_SUPABASE_ANON_KEY || '';

const target = resolve(root, 'public/urkunden/config.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify({ url, anonKey }, null, 2) + '\n');

if (!url || !anonKey) {
  console.warn(
    '[urkunden] Warnung: VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt — ' +
      'das Urkundensystem kann sich nicht mit der Datenbank verbinden.',
  );
} else {
  console.log('[urkunden] config.json geschrieben.');
}
