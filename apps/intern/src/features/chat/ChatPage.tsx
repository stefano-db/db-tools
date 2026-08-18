import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { repository, type WissenEintrag, type WissenTreffer } from '../../data';
import { Mascot } from '../../ui/Mascot';

/**
 * Chat und Hilfe.
 *
 * Pinny beantwortet Fragen zur Arbeit und zum Programm. Heute tut er das nicht
 * mit einem Sprachmodell, sondern aus dem Wissensspeicher — und das ist
 * Absicht: ein Modell ohne Kenntnis des Hauses erfindet Antworten, und eine
 * erfundene Auskunft über Arbeitszeiten oder Maschinen ist schlimmer als keine.
 *
 * Was der Speicher nicht hergibt, sagt er offen — und die Frage wird
 * festgehalten. Genau daraus wächst er: nach ein paar Wochen steht dort, was im
 * Haus wirklich gefragt wird, und nicht, was jemand am Schreibtisch für wichtig
 * hielt. Kommt später ein Sprachmodell dazu, bekommt es diese Treffer als
 * Grundlage und formuliert daraus — es erfindet dann nichts, sondern erklärt,
 * was ohnehin gilt.
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

export function ChatPage() {
  const { session } = useAuth();
  const darfPflegen = session?.isLead || session?.isAdmin;
  const [reiter, setReiter] = useState<'chat' | 'wissen'>('chat');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Mascot name="winken" size={52} />
        <div>
          <h1 className="text-2xl font-extrabold">Fragen an Pinny</h1>
          <p className="text-sm text-db-text2">Hilfe zur Arbeit und zum Programm</p>
        </div>
      </div>

      {darfPflegen && (
        <nav className="flex gap-1">
          {(
            [
              ['chat', 'Chat'],
              ['wissen', 'Wissen pflegen'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setReiter(k)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                reiter === k ? 'bg-db-card2 text-db-gold' : 'text-db-text2 hover:text-db-text'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {reiter === 'chat' ? <Unterhaltung /> : <WissenPflege />}
    </div>
  );
}

function Unterhaltung() {
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
    <div className="db-card flex h-[min(70vh,40rem)] flex-col overflow-hidden">
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

/** Zweiter Reiter: der Speicher selbst, und was noch fehlt. */
function WissenPflege() {
  const [eintraege, setEintraege] = useState<WissenEintrag[] | null>(null);
  const [offen, setOffen] = useState<{ id: string; frage: string; wann: string }[]>([]);
  const [bearbeitet, setBearbeitet] = useState<Partial<WissenEintrag> | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    try {
      setEintraege(await repository.wissenListe());
      setOffen(await repository.offeneFragen());
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void laden();
  }, []);

  async function speichern() {
    if (!bearbeitet?.titel?.trim() || !bearbeitet?.inhalt?.trim()) return;
    try {
      await repository.wissenSpeichern({
        id: bearbeitet.id,
        titel: bearbeitet.titel.trim(),
        inhalt: bearbeitet.inhalt.trim(),
        bereich: bearbeitet.bereich ?? null,
        schlagworte: (bearbeitet.schlagworte ?? []).filter(Boolean),
        aktiv: bearbeitet.aktiv ?? true,
      });
      setBearbeitet(null);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-5">
      {fehler && <p className="db-card border-db-bad/50 px-4 py-3 text-sm text-db-bad">■ {fehler}</p>}

      {offen.length > 0 && (
        <section className="db-card p-4">
          <h2 className="text-sm font-bold tracking-wide text-db-text3 uppercase">
            Fragen ohne Antwort
          </h2>
          <p className="mt-1 mb-3 text-sm text-db-text2">
            Danach wurde gefragt, ohne dass etwas hinterlegt war. Jede Zeile hier ist ein Eintrag,
            der fehlt.
          </p>
          <ul className="space-y-1.5">
            {offen.slice(0, 12).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>„{f.frage}"</span>
                <button
                  onClick={() => setBearbeitet({ titel: f.frage, inhalt: '', aktiv: true })}
                  className="db-btn-ghost px-2 py-1 text-xs"
                >
                  beantworten
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-bold tracking-wide text-db-text3 uppercase">
            Wissensspeicher {eintraege && `(${eintraege.length})`}
          </h2>
          <button
            onClick={() => setBearbeitet({ titel: '', inhalt: '', aktiv: true })}
            className="db-btn-gold px-3 py-1.5 text-sm"
          >
            Eintrag anlegen
          </button>
        </div>

        {eintraege === null ? (
          <p className="text-sm text-db-text3">Wird geladen…</p>
        ) : (
          <div className="space-y-2">
            {eintraege.map((e) => (
              <div key={e.id} className="db-card px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.titel}</span>
                  {!e.aktiv && <span className="text-xs text-db-text3">(ausgeblendet)</span>}
                  <button
                    onClick={() => setBearbeitet(e)}
                    className="ml-auto text-xs text-db-text3 hover:text-db-gold"
                  >
                    bearbeiten
                  </button>
                </div>
                <p className="mt-1 text-sm text-db-text2">{e.inhalt.slice(0, 160)}
                  {e.inhalt.length > 160 ? '…' : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {bearbeitet && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="db-card w-full max-w-lg p-5">
            <h3 className="text-lg font-semibold">
              {bearbeitet.id ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
            </h3>
            <label className="mt-3 block text-sm font-medium">
              Titel — am besten die Frage, wie sie gestellt wird
              <input
                value={bearbeitet.titel ?? ''}
                onChange={(e) => setBearbeitet({ ...bearbeitet, titel: e.target.value })}
                className="db-input mt-1"
              />
            </label>
            <label className="mt-3 block text-sm font-medium">
              Antwort
              <textarea
                rows={6}
                value={bearbeitet.inhalt ?? ''}
                onChange={(e) => setBearbeitet({ ...bearbeitet, inhalt: e.target.value })}
                className="db-input mt-1"
              />
            </label>
            <label className="mt-3 block text-sm font-medium">
              Schlagworte, mit Komma getrennt — womit sonst noch danach gesucht wird
              <input
                value={(bearbeitet.schlagworte ?? []).join(', ')}
                onChange={(e) =>
                  setBearbeitet({
                    ...bearbeitet,
                    schlagworte: e.target.value.split(',').map((x) => x.trim()),
                  })
                }
                className="db-input mt-1"
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {bearbeitet.id && (
                <button
                  onClick={async () => {
                    await repository.wissenLoeschen(bearbeitet.id!).catch(() => {});
                    setBearbeitet(null);
                    await laden();
                  }}
                  className="db-btn-ghost mr-auto px-4 py-2 text-sm"
                >
                  Löschen
                </button>
              )}
              <button onClick={() => setBearbeitet(null)} className="db-btn-ghost px-4 py-2 text-sm">
                Abbrechen
              </button>
              <button onClick={speichern} className="db-btn-gold px-4 py-2 text-sm">
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
