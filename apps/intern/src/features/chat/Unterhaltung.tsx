import { useEffect, useRef, useState } from 'react';
import { repository, type WissenTreffer } from '../../data';
import { Mascot } from '../../ui/Mascot';

/**
 * Die Unterhaltung mit Pinny.
 *
 * Steht in einer eigenen Datei, weil sie an zwei Orten gebraucht wird: auf der
 * Seite „Fragen an Pinny" und in der Blase unten rechts. Zwei Fassungen
 * derselben Antwortlogik waeren zwei Gelegenheiten, sie auseinanderlaufen zu
 * lassen.
 *
 * Heute antwortet sie aus dem Wissensspeicher; was er nicht hergibt, sagt sie
 * offen und haelt die Frage fest. Kommt spaeter ein Sprachmodell dazu, aendert
 * sich nur, was hinter repository.chatAntwort() geschieht.
 */

interface Beitrag {
  wer: 'mensch' | 'pinny';
  text: string;
  quellen?: WissenTreffer[];
  frageId?: string | null;
  bewertet?: boolean;
}

const BEGRUESSUNG: Beitrag = {
  wer: 'pinny',
  text:
    'Hallo! Frag mich alles rund um die Arbeit und dieses Programm — Dienstplan, ' +
    'Bahnwartung, Anmeldung, Drucken. Ich antworte aus dem, was hier hinterlegt ist. ' +
    'Wenn ich etwas nicht weiß, sage ich das und gebe die Frage weiter.',
};

const VORSCHLAEGE = [
  'Wo sehe ich meine Schichten?',
  'Wie trage ich Frame-Stände ein?',
  'Passwort vergessen — was tun?',
  'Wie melde ich einen Defekt?',
];

export function Unterhaltung({ kompakt = false }: { kompakt?: boolean }) {
  const [beitraege, setBeitraege] = useState<Beitrag[]>([BEGRUESSUNG]);
  const [frage, setFrage] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const endeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [beitraege]);

  async function fragen(text: string) {
    const sauber = text.trim();
    if (!sauber || laeuft) return;
    setFrage('');
    setBeitraege((b) => [...b, { wer: 'mensch', text: sauber }]);
    setLaeuft(true);

    try {
      const treffer = await repository.chatAntwort(sauber);
      const frageId = await repository.chatFrageMerken(sauber, treffer.length);

      setBeitraege((b) => [
        ...b,
        treffer.length > 0
          ? { wer: 'pinny', text: treffer[0].inhalt, quellen: treffer, frageId }
          : {
              wer: 'pinny',
              text:
                'Das weiß ich noch nicht. Ich habe deine Frage weitergegeben — deine ' +
                'Bereichsleitung kann sie hinterlegen, dann kann ich sie beim nächsten Mal ' +
                'beantworten. Wenn es eilt, frag jemanden aus deinem Bereich.',
              frageId,
            },
      ]);
    } catch (err) {
      setBeitraege((b) => [
        ...b,
        {
          wer: 'pinny',
          text:
            'Ich komme gerade nicht an die Antworten heran: ' +
            (err instanceof Error ? err.message : String(err)),
        },
      ]);
    } finally {
      setLaeuft(false);
    }
  }

  async function bewerten(index: number, geholfen: boolean) {
    const b = beitraege[index];
    if (!b.frageId) return;
    await repository.chatRueckmeldung(b.frageId, geholfen).catch(() => {});
    setBeitraege((alle) => alle.map((x, i) => (i === index ? { ...x, bewertet: true } : x)));
  }

  return (
    <div
      className={`flex flex-col overflow-hidden ${kompakt ? 'h-full' : 'db-card h-[min(70vh,40rem)]'}`}
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {beitraege.map((b, i) => (
          <div key={i} className={b.wer === 'mensch' ? 'flex justify-end' : 'flex gap-2'}>
            {b.wer === 'pinny' && <Mascot name="winken" size={34} variante="kopf" />}
            <div className={b.wer === 'mensch' ? 'max-w-[80%]' : 'max-w-[85%]'}>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                  b.wer === 'mensch' ? 'bg-db-gold text-[#241c08]' : 'bg-db-card2 text-db-text'
                }`}
              >
                {b.text}
              </div>

              {/* Woher die Antwort stammt — nachlesen können ist wichtiger, als
                  eine Auskunft glauben zu müssen. */}
              {b.quellen && b.quellen.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {b.quellen.slice(1).map((q) => (
                    <span
                      key={q.id}
                      title={q.inhalt}
                      className="rounded-md bg-db-card2 px-2 py-1 text-xs text-db-text3"
                    >
                      auch dazu: {q.titel}
                    </span>
                  ))}
                </div>
              )}

              {b.wer === 'pinny' && b.frageId && !b.bewertet && (
                <div className="mt-2 flex items-center gap-2 text-xs text-db-text3">
                  Hat das geholfen?
                  <button onClick={() => bewerten(i, true)} className="hover:text-db-gold">
                    ja
                  </button>
                  <button onClick={() => bewerten(i, false)} className="hover:text-db-gold">
                    nein
                  </button>
                </div>
              )}
              {b.bewertet && <div className="mt-2 text-xs text-db-text3">Danke.</div>}
            </div>
          </div>
        ))}

        {beitraege.length === 1 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {VORSCHLAEGE.map((v) => (
              <button key={v} onClick={() => void fragen(v)} className="db-btn-ghost px-3 py-1.5 text-xs">
                {v}
              </button>
            ))}
          </div>
        )}

        {laeuft && <p className="text-sm text-db-text3">Pinny sucht…</p>}
        <div ref={endeRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void fragen(frage);
        }}
        className="flex gap-2 border-t border-db-line p-3"
      >
        <input
          value={frage}
          onChange={(e) => setFrage(e.target.value)}
          placeholder="Deine Frage…"
          className="db-input flex-1"
        />
        <button type="submit" disabled={laeuft} className="db-btn-gold px-4 py-2 disabled:opacity-40">
          Fragen
        </button>
      </form>
    </div>
  );
}

