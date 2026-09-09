/**
 * Probe für den Excel-Import des Urkundensystems.
 *
 * Die Seite ist eine eigenständige Datei ohne Baukette, deshalb liegt die
 * Prüfung hier statt in vitest: sie zieht parseRows aus der ausgelieferten
 * index.html und schickt Dateien hindurch, wie sie im Haus entstehen.
 *
 * Aufruf: npm run pruefe:urkunden
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = resolve(hier, '..', 'public', 'urkunden');

const k = { console }; k.global = k; k.globalThis = k; k.window = k; k.self = k;
createContext(k);
runInContext(readFileSync(resolve(wurzel, 'lib/xlsx.full.min.js'), 'utf8'), k);
const XLSX = k.XLSX;

const html = readFileSync(resolve(wurzel, 'index.html'), 'utf8');
const quelle = html.slice(html.indexOf('function parseRows(rows){'), html.indexOf('async function fileToPlayers'));
const parseRows = new Function(quelle + '; return parseRows;')();

/** Wie fileToPlayers: alle Blätter durchsehen, das erste mit Treffern nehmen. */
function ausMappe(blaetter) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(blaetter)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  const roh = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const gelesen = XLSX.read(new Uint8Array(roh), { type: 'array', codepage: 1252, cellDates: true });
  let bestes = null;
  for (const name of gelesen.SheetNames) {
    const erg = parseRows(XLSX.utils.sheet_to_json(gelesen.Sheets[name], { header: 1, defval: '', raw: false }));
    if (!bestes || erg.pl.length > bestes.pl.length) bestes = erg;
    if (erg.pl.length) break;
  }
  return bestes;
}

const dienst = (name, ...punkte) => [name, ...punkte];

const faelle = [
  ['Name + 3 Spiele', { A: [['Name', 'Spiel 1', 'Spiel 2', 'Spiel 3'], dienst('Max Müller', 145, 132, 178), dienst('Anna Weber', 98, 156, 121)] }, 2],
  ['Titelzeilen darüber', { A: [['Dream Bowl'], ['Geburtstag Klein'], ['12.09.2026'], [], ['Name', 'Spiel 1', 'Spiel 2'], dienst('Max Müller', 145, 132)] }, 1],
  ['Überschrift „Spielername"', { A: [['Spielername', 'Durchgang 1', 'Durchgang 2'], dienst('Max Müller', 145, 132)] }, 1],
  ['Platzierung und Gesamt', { A: [['Pos', 'Name', 'Spiel 1', 'Spiel 2', 'Gesamt'], [1, 'Max Müller', 145, 132, 277]] }, 1],
  ['Nummer vor dem Namen', { A: [['Name', 'Spiel 1'], dienst('1. Max Müller', 145)] }, 1],
  ['Zahlen als Text', { A: [['Name', 'Spiel 1'], dienst('Max Müller', '145')] }, 1],
  ['Komma statt Punkt', { A: [['Name', 'Schnitt'], dienst('Max Müller', '145,5')] }, 1],
  ['Leerzeilen dazwischen', { A: [['Name', 'Spiel 1'], dienst('Max Müller', 145), [], dienst('Anna Weber', 98)] }, 2],
  // Die Fälle, an denen es vorher still scheiterte:
  ['Liste ohne jede Überschrift', { A: [dienst('Max Müller', 145, 132), dienst('Anna Weber', 98, 156)] }, 2],
  ['Daten im zweiten Blatt', { Deckblatt: [['Auswertung'], ['Dream Bowl']], Ergebnisse: [['Name', 'Spiel 1'], dienst('Max Müller', 145)] }, 1],
  ['Überschrift erst in Zeile 9', { A: [...Array.from({ length: 8 }, (_, i) => [`Zeile ${i}`]), ['Name', 'Spiel 1'], dienst('Max Müller', 145)] }, 1],
  ['Umlaute im Namen', { A: [['Name', 'Spiel 1'], dienst('Jörg Käfer-Süß', 145)] }, 1],
];

let fehler = 0;
for (const [name, blaetter, erwartet] of faelle) {
  const { pl, warn } = ausMappe(blaetter);
  const ok = pl.length === erwartet;
  if (!ok) fehler++;
  console.log(
    `${ok ? '  ok  ' : '  FEHL'} ${name.padEnd(28)} ${pl.length}/${erwartet}` +
    (pl.length ? `  ${pl.map((p) => `${p.name} ${p.scores.join('/')}`).join(' · ')}` : '') +
    (warn.length ? `  ⚠ ${warn[0]}` : ''),
  );
}

// Und der Fall, der eine ehrliche Meldung braucht statt eines stillen Erfolgs.
const leer = ausMappe({ A: [['Datum', 'Bahn'], ['12.09.2026', 4]] });
const meldet = leer.pl.length === 0 && leer.warn.length > 0;
console.log(`${meldet ? '  ok  ' : '  FEHL'} ${'Unbrauchbare Datei meldet Grund'.padEnd(28)} ${leer.warn[0] ?? '(keine Meldung)'}`);
if (!meldet) fehler++;

console.log(fehler === 0 ? `\n${faelle.length + 1} Fälle, alle bestanden.` : `\n${fehler} Fälle gescheitert.`);
process.exit(fehler === 0 ? 0 : 1);
