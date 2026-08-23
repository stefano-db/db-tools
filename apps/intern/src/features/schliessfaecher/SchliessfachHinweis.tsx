import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../ui/Icon';
import { repository, type Schliessfach } from '../../data';
import { hinweisText, hinweise, type Hinweis } from './schliessfachModel';

/**
 * Der kleine Hinweis auf der Übersicht.
 *
 * Er meldet sich nur, wenn etwas ansteht — und dann leise: keine Meldung aufs
 * Handy, kein rotes Feld, das nach Störung aussieht. Ein Schließfach, das in
 * fünf Wochen ausläuft, ist kein Notfall; es ist etwas, das man beim nächsten
 * ruhigen Moment am Counter erledigt. Genau dafür ist die Übersicht da.
 *
 * Steht nichts an, verschwindet der ganze Kasten. Eine Zeile „alles in
 * Ordnung" liest nach dem dritten Mal niemand mehr, und sie kostet den Platz,
 * an dem sonst etwas Wichtiges stünde.
 */
export function SchliessfachHinweis() {
  const [meldungen, setMeldungen] = useState<Hinweis[] | null>(null);

  useEffect(() => {
    let laeuft = true;
    Promise.all([repository.schliessfaecher(), repository.schliessfachFrist()])
      .then(([faecher, frist]: [Schliessfach[], number]) => {
        if (laeuft) setMeldungen(hinweise(faecher, new Date(), frist));
      })
      // Still bleiben: Die Übersicht ist nicht der Ort, an dem man erfährt,
      // dass eine Nebensache nicht laden konnte. Wer die Schließfächer
      // öffnet, sieht den Fehler dort.
      .catch(() => laeuft && setMeldungen([]));
    return () => {
      laeuft = false;
    };
  }, []);

  if (!meldungen || meldungen.length === 0) return null;

  return (
    <article className="db-card p-4" style={{ borderColor: 'var(--color-db-warn)' }}>
      <div className="flex items-center gap-2">
        <Icon name="schloss" size={18} className="text-db-warn" />
        <h2 className="text-sm font-semibold tracking-wide text-db-text3 uppercase">
          Schließfächer
        </h2>
      </div>

      <ul className="mt-3 space-y-1.5">
        {meldungen.map((h) => (
          <li key={h.lage}>
            <Link
              to={`/schliessfaecher?zeigen=${h.lage}`}
              className="flex items-baseline gap-2 text-sm hover:text-db-gold"
            >
              <span className="db-num font-bold text-db-warn">{h.anzahl}</span>
              <span className="min-w-0">
                <span className="block">{hinweisText(h)}</span>
                <span className="block truncate text-xs text-db-text3">
                  Nr. {h.faecher.slice(0, 10).join(', ')}
                  {h.faecher.length > 10 && ' …'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
