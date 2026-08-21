import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Mascot } from '../../ui/Mascot';
import { Unterhaltung } from './Unterhaltung';

/**
 * Pinny unten rechts.
 *
 * Eine Frage kommt selten dort auf, wo die Antwort steht — sie kommt beim
 * Eintragen der Frame-Stände oder beim Blick auf den Dienstplan. Der Weg über
 * die Seitenleiste unterbricht dann genau das, womit man gerade beschäftigt
 * ist. Deshalb sitzt Pinny auf jeder Seite in Reichweite, und die Antwort legt
 * sich über die Arbeit, statt sie zu ersetzen.
 *
 * Auf der Seite „Fragen an Pinny" bleibt er weg — dort steht er schon.
 */
export function ChatBlase() {
  const [offen, setOffen] = useState(false);
  const { pathname } = useLocation();

  // Beim Seitenwechsel schliessen: eine Blase, die über der neuen Seite stehen
  // bleibt, verdeckt genau das, wohin man gerade wollte.
  useEffect(() => setOffen(false), [pathname]);

  useEffect(() => {
    if (!offen) return;
    const beiEscape = (e: KeyboardEvent) => e.key === 'Escape' && setOffen(false);
    window.addEventListener('keydown', beiEscape);
    return () => window.removeEventListener('keydown', beiEscape);
  }, [offen]);

  if (pathname === '/chat') return null;

  return (
    <>
      {offen && (
        <div
          className="nicht-drucken fixed inset-0 z-40 bg-black/40 lg:bg-transparent"
          onClick={() => setOffen(false)}
        />
      )}

      <div
        // Über der Reiterleiste am Handy — sonst sitzt Pinny auf „Profil".
        className="pinny-blase nicht-drucken fixed right-4 z-50 flex flex-col items-end gap-3"
      >
        {offen && (
          <div
            className="db-card flex h-[min(70vh,32rem)] w-[min(92vw,23rem)] flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-db-line px-3 py-2">
              <Mascot name="winken" size={30} variante="kopf" />
              <span className="font-semibold">Pinny</span>
              <a href="/chat" className="ml-auto text-xs text-db-text3 hover:text-db-gold">
                ganze Seite
              </a>
              <button
                onClick={() => setOffen(false)}
                aria-label="Schließen"
                className="text-db-text3 hover:text-db-text"
              >
                ✕
              </button>
            </div>
            <Unterhaltung kompakt />
          </div>
        )}

        <button
          onClick={() => setOffen((o) => !o)}
          aria-label={offen ? 'Pinny schließen' : 'Pinny fragen'}
          className="db-figur-schein grid h-12 w-12 place-items-center rounded-full shadow-xl ring-2 ring-db-gold/60 transition hover:ring-db-gold"
        >
          {offen ? (
            <span className="text-xl text-db-text2">✕</span>
          ) : (
            <Mascot name="winken" size={44} variante="kopf" />
          )}
        </button>
      </div>
    </>
  );
}
