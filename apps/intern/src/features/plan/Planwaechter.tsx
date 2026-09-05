import { useEffect, useRef, useState } from 'react';
import { repository, type MyWeek, type ShiftDay } from '../../data';
import { unterschied } from './unterschied';
import { warEigeneSchreibung } from './eigeneSchreibung';

/**
 * Wächter über den eigenen Plan.
 *
 * Wenn die Leitung etwas ändert, soll man es erfahren — und zwar mit der
 * Auskunft, die zählt: betrifft es mich oder nicht. „Der Dienstplan wurde
 * geändert" allein zwingt jeden dazu, selbst nachzusehen; bei neunzehn Leuten
 * und einer Änderung an einer einzigen Schicht ist das achtzehnmal umsonst.
 *
 * Verglichen wird deshalb der eigene Wochenstand vorher und nachher. Ist er
 * gleich geblieben, sagt die Meldung genau das — und man kann weiterarbeiten.
 *
 * Grenze dieser Stufe: Sie läuft, solange die Seite geöffnet ist. Für eine
 * Meldung bei geschlossener App braucht es einen Dienst, der sie verschickt;
 * die Vorbereitung dafür steht in der Beschreibung im Profil.
 */

/**
 * Zustand des Waechters, damit das Profil ihn anzeigen kann.
 *
 * Ein Modul-weites Signal statt eines Zustands im Baum: Waechter und Anzeige
 * stehen an verschiedenen Stellen der Seite, und ein gemeinsamer Elternteil
 * waere nur dafuer da, diesen einen Wert weiterzureichen.
 */
type Verbindung = { steht: boolean; meldung?: string; person?: string };
let verbindung: Verbindung = { steht: false, meldung: 'noch nicht verbunden' };
const zuhoerer = new Set<(v: Verbindung) => void>();

function setzeVerbindung(v: Verbindung) {
  verbindung = v;
  zuhoerer.forEach((f) => f(v));
}

export function useVerbindung(): Verbindung {
  const [wert, setWert] = useState(verbindung);
  useEffect(() => {
    zuhoerer.add(setWert);
    setWert(verbindung);
    return () => {
      zuhoerer.delete(setWert);
    };
  }, []);
  return wert;
}

export function Planwaechter() {
  const [meldung, setMeldung] = useState<{ betrifftMich: boolean; text: string } | null>(null);
  const woche = useRef<MyWeek | null>(null);
  /**
   * Der zuletzt gesehene veroeffentlichte Stand.
   *
   * Die Datenbank meldet jede Zeilenaenderung, auch die am Entwurf. Ohne
   * diesen Vergleich meldete die App „Der Dienstplan wurde geaendert",
   * waehrend die Leitung noch tippt — und nach dem dritten Mal schaltet man
   * die Meldungen ab.
   */
  const letzterStand = useRef<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    let abmelden: (() => void) | null = null;

    repository
      .myWeek()
      .then((w) => {
        if (!aktiv) return;
        if (!w) {
          setzeVerbindung({
            steht: false,
            meldung: 'Dein Konto ist keinem Namen im Dienstplan zugeordnet.',
          });
          return;
        }
        woche.current = w;

        abmelden = repository.watchRosterWeek(
          w.weekStart,
          (zeile) => {
            const data = zeile.data;

            // Nur der veroeffentlichte Plan zaehlt. Solange die Leitung am
            // Entwurf arbeitet, aendert sich `data` nicht — und dann gibt es
            // hier nichts zu melden. Ohne diese Pruefung bekaeme die Mannschaft
            // bei jedem Tastendruck der Planung eine Nachricht.
            const jetzt = JSON.stringify(data ?? {});
            if (jetzt === letzterStand.current) return;
            letzterStand.current = jetzt;

            // Wer gerade selbst gespeichert hat, weiss Bescheid.
            if (warEigeneSchreibung()) {
              woche.current = { ...w, days: (data?.[w.employeeId]?.d ?? []) as ShiftDay[] };
              return;
            }

            const alt = woche.current?.days ?? [];
            const neu = (data?.[w.employeeId]?.d ?? []) as ShiftDay[];
            const meine = unterschied(alt, neu);

            // Den neuen Stand merken, sonst meldet die naechste Aenderung noch
            // einmal denselben Unterschied.
            woche.current = { ...w, days: neu };

            const text =
              meine.length > 0
                ? `Deine Schicht hat sich geändert — ${meine.join(', ')}`
                : 'Der Dienstplan wurde geändert. Deine Schichten bleiben gleich.';

            setMeldung({ betrifftMich: meine.length > 0, text });
            zeigeSystemmeldung(meine.length > 0, text);
          },
          (steht, meldung) => setzeVerbindung({ steht, meldung, person: w.employeeName }),
        );
      })
      .catch((e) =>
        setzeVerbindung({ steht: false, meldung: e instanceof Error ? e.message : String(e) }),
      );

    return () => {
      aktiv = false;
      abmelden?.();
    };
  }, []);

  if (!meldung) return null;

  return (
    <div className="nicht-drucken fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 lg:bottom-6">
      <div
        className={`db-card flex max-w-lg items-start gap-3 px-4 py-3 shadow-2xl ${
          meldung.betrifftMich ? 'border-db-gold' : ''
        }`}
      >
        <span aria-hidden="true">{meldung.betrifftMich ? '🔔' : 'ℹ️'}</span>
        <div className="min-w-0 flex-1 text-sm">
          <div className={meldung.betrifftMich ? 'font-semibold text-db-gold' : 'text-db-text2'}>
            {meldung.betrifftMich ? 'Betrifft dich' : 'Betrifft dich nicht'}
          </div>
          <p className="mt-0.5 text-db-text2">{meldung.text}</p>
        </div>
        <button
          onClick={() => setMeldung(null)}
          aria-label="Meldung schließen"
          className="shrink-0 text-db-text3 hover:text-db-text"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * Zusätzlich eine Meldung des Systems, wenn sie erlaubt wurde.
 *
 * Ohne Erlaubnis geschieht schlicht nichts — gefragt wird im Profil, denn ein
 * Fenster, das ungefragt nach Erlaubnis fragt, lehnen die meisten ab, und
 * danach ist der Weg für immer zu.
 */
function zeigeSystemmeldung(betrifftMich: boolean, text: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(betrifftMich ? 'Deine Schicht hat sich geändert' : 'Dienstplan geändert', {
      body: text,
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      tag: 'dienstplan',
    });
  } catch {
    // Auf manchen Geräten nur über den Service Worker erlaubt — dann bleibt es
    // bei der Meldung in der App.
  }
}
