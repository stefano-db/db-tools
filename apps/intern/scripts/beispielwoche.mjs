/**
 * Eine Beispielwoche für den Dienstplan erzeugen.
 *
 *   node scripts/beispielwoche.mjs [montag] > woche.sql
 *
 * Wofür: eine leere Woche zeigt nichts. Weder ob die Wandtafel am Fernseher
 * passt, noch wie der Ausdruck aussieht, noch was passiert, wenn dreizehn
 * Namen darin stehen. Dafür braucht es eine Woche, die aussieht wie eine
 * echte — nicht wie eine Reihe zufälliger Kästchen.
 *
 * Das Ergebnis ist SQL. Es füllt die Woche nur, wenn dort noch nichts steht:
 * ein vorhandener Plan bleibt unangetastet. Wer die Beispielwoche wieder
 * loswerden will, löscht die eine Zeile:
 *
 *   delete from roster_weeks where week_start = date '2026-08-31';
 */

/** Montag der Woche. Ohne Angabe: übernächste Woche, die ist meist noch leer. */
const WOCHE = process.argv[2] ?? naechsterFreierMontag();

function naechsterFreierMontag() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 14);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Wer da ist --------------------------------------------------------------

const NAMEN = ['Marko', 'Sven', 'Kinfe', 'Antonia', 'Justin', 'Kaua', 'Ivana', 'Hasret', 'Stefano', 'Mehmet', 'Jürgen', 'Diego'];
/** Eine ganze Woche Urlaub — im Plan gelb, und ohne so einen Fall sieht man nie, ob das stimmt. */
const URLAUB = 'Sabse';
/** Ein einzelner Krankheitstag, aus demselben Grund. */
const KRANK = { name: 'Mehmet', tag: 1 };

// --- Wie viele wann gebraucht werden ----------------------------------------
//
// Nicht überall gleich: unter der Woche läuft der Betrieb nachmittags an, von
// Freitag bis Sonntag ist Hochbetrieb. Ein Plan mit sieben Leuten an jedem Tag
// sieht auf den ersten Blick ordentlich aus und wäre in einem Bowlingcenter
// grober Unfug.
const ZIEL = [6, 6, 6, 7, 9, 10, 8]; // Mo … So
const HOECHSTENS = 5; // Tage je Person

// Öffnungszeiten, aus denen sich Früh- und Spätdienst ergeben.
const FRUEH = [['14:00', '20:00'], ['14:00', '20:00'], ['14:00', '20:00'], ['14:00', '20:00'], ['15:00', '21:00'], ['11:00', '19:00'], ['11:00', '18:00']];
const SPAET = [['16:00', '23:00'], ['16:00', '23:00'], ['16:00', '23:00'], ['16:00', '23:00'], ['17:00', '01:00'], ['16:00', '01:00'], ['15:00', '22:00']];

// --- Verteilen ---------------------------------------------------------------

const plan = NAMEN.map(() => Array(7).fill('.'));
const tage = NAMEN.map(() => 0);

for (let d = 0; d < 7; d++) {
  // Wer bisher am wenigsten hat, kommt zuerst dran. Bei Gleichstand entscheidet
  // ein Versatz, der mit dem Tag wandert — ohne ihn zerfällt die Belegschaft in
  // zwei feste Lager, und das sieht nach Maschine aus, weil es eine war.
  const versatz = (i) => (i + d * 5) % NAMEN.length;
  NAMEN.map((_, i) => i)
    .filter((i) => tage[i] < HOECHSTENS)
    .sort((a, b) => tage[a] - tage[b] || versatz(a) - versatz(b))
    .slice(0, ZIEL[d])
    .forEach((i, n) => {
      plan[i][d] = (n + d) % 2 === 0 ? 'F' : 'S';
      tage[i]++;
    });
}

// --- In die Form bringen, in der der Plan speichert --------------------------

const minuten = (b, e) => {
  const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const [a, z] = [m(b), m(e)];
  return z >= a ? z - a : 24 * 60 - a + z; // die Spätschicht endet nach Mitternacht
};
const alsZeit = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

function woche(name) {
  if (name === URLAUB) {
    const d = Array.from({ length: 7 }, () => ({ status: 'urlaub', b: '', e: '', std: '0:00' }));
    return { d, tot: '0:00' };
  }
  const i = NAMEN.indexOf(name);
  let summe = 0;
  const d = plan[i].map((zeichen, tag) => {
    if (name === KRANK.name && tag === KRANK.tag) return { status: 'krank', b: '', e: '', std: '0:00' };
    if (zeichen === '.') return { status: 'frei', b: '', e: '', std: '0:00' };
    const [b, e] = zeichen === 'F' ? FRUEH[tag] : SPAET[tag];
    const dauer = minuten(b, e);
    summe += dauer;
    return { status: 'dienst', b, e, std: alsZeit(dauer) };
  });
  return { d, tot: alsZeit(summe) };
}

const zeilen = [...NAMEN, URLAUB].map((name) => {
  const wert = JSON.stringify(woche(name)).replace(/'/g, "''");
  return `    ('${name.replace(/'/g, "''")}', '${wert}'::jsonb)`;
});

console.log(`-- Beispielwoche ab Montag, ${WOCHE}.
--
-- Fuellt die Woche nur, wenn dort noch nichts steht: 'do nothing' statt
-- 'do update'. Ein vorhandener Plan bleibt unangetastet.
--
-- Wieder loswerden:
--   delete from roster_weeks where week_start = date '${WOCHE}';
with vorgabe(name, woche) as (
  values
${zeilen.join(',\n')}
)
insert into roster_weeks (week_start, data)
select date '${WOCHE}', jsonb_object_agg(e.id::text, v.woche)
  from vorgabe v
  join roster_employees e on e.name = v.name and e.active
on conflict (week_start) do nothing;`);
