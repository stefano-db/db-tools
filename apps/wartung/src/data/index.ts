import { DemoRepository } from './demo/demoRepo';
import { SupabaseRepository } from './supabase/supabaseRepo';
import type { Repository } from './types';

export * from './types';
export { DemoRepository } from './demo/demoRepo';

/**
 * Sind Supabase-Zugangsdaten hinterlegt, läuft die App gegen die echte Datenbank;
 * andernfalls gegen den lokalen Demo-Bestand im Browser. Die Oberfläche merkt
 * davon nichts — sie kennt nur das Repository-Interface.
 */
export function createRepository(): Repository {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url && key) return new SupabaseRepository(url, key);
  return new DemoRepository();
}
