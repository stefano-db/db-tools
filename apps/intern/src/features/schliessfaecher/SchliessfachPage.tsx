import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useModule } from '../../app/ModuleContext';
import { Icon } from '../../ui/Icon';
import { repository, type Schliessfach, type SchliessfachZustand } from '../../data';
import {
  LAGE_TEXT,
  hinweisText,
  hinweise,
  lage,
  tageBisAblauf,
  type Lage,
} from './schliessfachModel';

/**
 * Schließfächer.
 *
 * Zwei Ansichten derselben Sache, weil im Haus zwei Bilder im Kopf sind: die
 * Kacheln aus dem Brunswick, an denen man auf einen Blick sieht, was los ist,
 * und die Liste vom Blatt in der Klarsichthülle, an der man Zeile für Zeile
 * abhakt. Beide zeigen dieselben Daten; wer die eine gewohnt ist, muss die
 * andere nicht lernen.
 *
 * Die Farben sind absichtlich dieselben wie im Brunswick. Wer beides
 * nebeneinander hat — und das hat der Counter —, darf nicht zweimal umdenken.
 */

/** Farbe und Beschriftung je Lage. Grün, rot, orange wie im Brunswick. */
const FARBE: Record<Lage, { flaeche: string; rand: string; schrift: string }> = {
  frei: { flaeche: '#e9e4da', rand: '#cdc6b8', schrift: '#4a453c' },
  reserviert: { flaeche: '#3f6fd8', rand: '#5b86e8', schrift: '#ffffff' },
  vermietet: { flaeche: '#4fbf63', rand: '#6bd07d', schrift: '#10300f' },
  ueberzahlung: { flaeche: '#ef8a2a', rand: '#f6a457', schrift: '#3a1f04' },
  unbezahlt: { flaeche: '#e0a038', rand: '#efb75c', schrift: '#3a2705' },
  faellig: { flaeche: '#d9d13a', rand: '#e8e26a', schrift: '#33310a' },
  abgelaufen: { flaeche: '#e03c34', rand: '#ef645c', schrift: '#ffffff' },
  lager: { flaeche: '#a464e0', rand: '#bb87ea', schrift: '#ffffff' },
  defekt: { flaeche: '#575049', rand: '#736b62', schrift: '#e6e0d6' },
};

export function SchliessfachPage() {
  const { session } = useAuth();
  const { module } = useModule();
  const darfAendern =
    module?.find((m) => m.key === 'schliessfaecher')?.canWrite === true ||
    session?.isAdmin === true;

  const [faecher, setFaecher] = useState<Schliessfach[] | null>(null);
  const [frist, setFrist] = useState(42);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<'kacheln' | 'liste'>(() =>
    localStorage.getItem('schliessfach-ansicht') === 'liste' ? 'liste' : 'kacheln',
  );
  const [suche, setSuche] = useState('');
  // Der Startbildschirm fuehrt unmittelbar auf „faellig" oder „unbezahlt".
  // Ohne diesen Umweg ueber die Adresse muesste man dort erst suchen, was die
  // Kachel schon gezaehlt hat.
  const [param, setzeParam] = useSearchParams();
  const zeigen = param.get('zeigen') as Lage | null;
  const [offen, setOffen] = useState<Schliessfach | 'neu' | null>(null);

  const laden = useCallback(async () => {
    try {
      const [liste, tage] = await Promise.all([
        repository.schliessfaecher(),
        repository.schliessfachFrist(),
      ]);
      setFaecher(liste);
      setFrist(tage);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  useEffect(() => {
    localStorage.setItem('schliessfach-ansicht', ansicht);
  }, [ansicht]);

  const heute = useMemo(() => new Date(), []);
  const meldungen = useMemo(
    () => hinweise(faecher ?? [], heute, frist),
    [faecher, heute, frist],
  );

  const gefiltert = useMemo(() => {
    const bestand = zeigen
      ? (faecher ?? []).filter((f) => lage(f, heute, frist) === zeigen)
      : (faecher ?? []);
    const begriff = suche.trim().toLowerCase();
    if (!begriff) return bestand;
    return bestand.filter(
      (f) =>
        String(f.nummer) === begriff ||
        String(f.nummer).startsWith(begriff) ||
        (f.mieter ?? '').toLowerCase().includes(begriff) ||
        (f.notiz ?? '').toLowerCase().includes(begriff),
    );
  }, [faecher, suche, zeigen, heute, frist]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Schließfächer</h1>
          <p className="text-sm text-db-text2">
            Vermietung und Fristen. Die Farben sind dieselben wie im Brunswick.
          </p>
        </div>
        {darfAendern && (
          <button onClick={() => setOffen('neu')} className="db-btn-gold px-4 py-2.5 text-sm">
            + Fach anlegen
          </button>
        )}
      </div>

      {fehler && (
        <p className="db-card border-db-bad px-4 py-3 text-sm text-db-bad">■ {fehler}</p>
      )}

      {/* Was ansteht, bevor irgendetwas anderes kommt. */}
      {meldungen.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {meldungen.map((h) => (
            <button
              key={h.lage}
              onClick={() => {
                setSuche('');
                setzeParam(zeigen === h.lage ? {} : { zeigen: h.lage }, { replace: true });
              }}
              className={`db-card flex items-center gap-3 p-3 text-left transition ${
                zeigen === h.lage ? 'ring-2' : ''
              }`}
              style={{ borderColor: FARBE[h.lage].flaeche }}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold"
                style={{ background: FARBE[h.lage].flaeche, color: FARBE[h.lage].schrift }}
              >
                {h.anzahl}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{hinweisText(h)}</span>
                <span className="block truncate text-xs text-db-text3">
                  Nr. {h.faecher.slice(0, 8).join(', ')}
                  {h.faecher.length > 8 && ' …'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-db-line p-1">
          {(
            [
              ['kacheln', 'Kacheln'],
              ['liste', 'Liste'],
            ] as const
          ).map(([wert, text]) => (
            <button
              key={wert}
              onClick={() => setAnsicht(wert)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                ansicht === wert ? 'bg-db-card2 text-db-gold' : 'text-db-text2'
              }`}
            >
              {text}
            </button>
          ))}
        </div>
        <input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Nummer oder Name…"
          className="db-input flex-1 sm:max-w-xs"
        />
      </div>

      {zeigen && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-db-text2">
          Es werden nur Fächer gezeigt, die <strong className="text-db-text">{LAGE_TEXT[zeigen]}</strong> sind.
          <button
            onClick={() => setzeParam({}, { replace: true })}
            className="db-btn-ghost px-3 py-1 text-xs"
          >
            Alle zeigen
          </button>
        </p>
      )}

      {faecher !== null && faecher.length === 0 && (
        <div className="db-card p-6">
          <p className="text-db-text2">
            Noch keine Fächer angelegt. Trage sie einmal ein — danach steht hier der ganze
            Bestand.
          </p>
          {darfAendern && (
            <button onClick={() => setOffen('neu')} className="db-btn-gold mt-4 px-4 py-2 text-sm">
              Fächer anlegen
            </button>
          )}
        </div>
      )}

      {ansicht === 'kacheln' ? (
        <Kacheln
          faecher={gefiltert}
          heute={heute}
          frist={frist}
          onWaehlen={(f) => darfAendern && setOffen(f)}
        />
      ) : (
        <Liste
          faecher={gefiltert}
          heute={heute}
          frist={frist}
          onWaehlen={(f) => darfAendern && setOffen(f)}
        />
      )}

      <Legende />

      {offen && (
        <Bearbeiten
          fach={offen === 'neu' ? null : offen}
          vorhandene={(faecher ?? []).map((f) => f.nummer)}
          onSchliessen={() => setOffen(null)}
          onFertig={async () => {
            setOffen(null);
            await laden();
          }}
        />
      )}
    </div>
  );
}

/**
 * Die Wand, wie sie im Brunswick aussieht.
 *
 * Feste Kachelgröße statt sich dehnender Spalten: Die Fächer hängen in Reihen
 * an der Wand, und wer Nummer 47 sucht, findet sie schneller, wenn das Raster
 * bei jeder Fensterbreite gleich zählt.
 */
function Kacheln({
  faecher,
  heute,
  frist,
  onWaehlen,
}: {
  faecher: Schliessfach[];
  heute: Date;
  frist: number;
  onWaehlen: (f: Schliessfach) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {faecher.map((f) => {
        const l = lage(f, heute, frist);
        const farbe = FARBE[l];
        const tage = tageBisAblauf(f, heute);
        return (
          <button
            key={f.id}
            onClick={() => onWaehlen(f)}
            title={`Fach ${f.nummer} · ${LAGE_TEXT[l]}${f.mieter ? ` · ${f.mieter}` : ''}`}
            className="grid h-14 w-14 place-items-center rounded-lg border text-center transition hover:brightness-110"
            style={{ background: farbe.flaeche, borderColor: farbe.rand, color: farbe.schrift }}
          >
            <span className="db-num text-base leading-none font-bold">{f.nummer}</span>
            {/* Die verbleibenden Tage stehen nur dort, wo sie zaehlen. Auf jeder
                Kachel eine Zahl waere Rauschen, und die Nummer ginge unter. */}
            {(l === 'faellig' || l === 'abgelaufen') && tage !== null && (
              <span className="db-num mt-0.5 text-[10px] leading-none">
                {tage < 0 ? `${-tage} T. über` : `${tage} T.`}
              </span>
            )}
            {f.groesse !== 'S' && (
              <span className="text-[9px] leading-none opacity-70">{f.groesse}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Die Liste vom Blatt: Nummer, Größe, Name, bezahlt, bis wann. */
function Liste({
  faecher,
  heute,
  frist,
  onWaehlen,
}: {
  faecher: Schliessfach[];
  heute: Date;
  frist: number;
  onWaehlen: (f: Schliessfach) => void;
}) {
  return (
    <div className="db-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-db-line text-left text-xs tracking-wide text-db-text3 uppercase">
            <th className="px-3 py-2 font-semibold">Nr.</th>
            <th className="px-3 py-2 font-semibold">Größe</th>
            <th className="px-3 py-2 font-semibold">Name</th>
            <th className="px-3 py-2 font-semibold">Zustand</th>
            <th className="px-3 py-2 font-semibold">Miete bis</th>
            <th className="px-3 py-2 font-semibold">Bezahlt</th>
          </tr>
        </thead>
        <tbody>
          {faecher.map((f) => {
            const l = lage(f, heute, frist);
            const tage = tageBisAblauf(f, heute);
            return (
              <tr
                key={f.id}
                onClick={() => onWaehlen(f)}
                className="cursor-pointer border-b border-db-line/60 hover:bg-db-card2"
              >
                <td className="db-num px-3 py-2 font-bold">{f.nummer}</td>
                <td className="px-3 py-2 text-db-text2">{f.groesse}</td>
                <td className="px-3 py-2">{f.mieter ?? <span className="text-db-text3">—</span>}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: FARBE[l].flaeche, color: FARBE[l].schrift }}
                  >
                    {LAGE_TEXT[l]}
                  </span>
                </td>
                <td className="db-num px-3 py-2 text-db-text2">
                  {f.mieteBis ? (
                    <>
                      {formatDatum(f.mieteBis)}
                      {(l === 'faellig' || l === 'abgelaufen') && tage !== null && (
                        <span className="ml-1.5 text-xs text-db-text3">
                          {tage < 0 ? `${-tage} T. über` : `noch ${tage} T.`}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-db-text3">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {f.bezahlt ? (
                    <span className="text-db-ok">✓</span>
                  ) : f.zustand === 'vermietet' ? (
                    <span className="text-db-warn">offen</span>
                  ) : (
                    <span className="text-db-text3">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Legende() {
  const gezeigt: Lage[] = [
    'frei',
    'reserviert',
    'vermietet',
    'ueberzahlung',
    'unbezahlt',
    'faellig',
    'abgelaufen',
    'lager',
    'defekt',
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-db-text2">
      {gezeigt.map((l) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded"
            style={{ background: FARBE[l].flaeche, border: `1px solid ${FARBE[l].rand}` }}
          />
          {LAGE_TEXT[l]}
        </span>
      ))}
    </div>
  );
}

const ZUSTAND_TEXT: Record<SchliessfachZustand, string> = {
  frei: 'Unbesetzt',
  reserviert: 'Reserviert',
  vermietet: 'Verliehen',
  lager: 'Lager',
  defekt: 'Defekt',
};

function Bearbeiten({
  fach,
  vorhandene,
  onSchliessen,
  onFertig,
}: {
  fach: Schliessfach | null;
  vorhandene: number[];
  onSchliessen: () => void;
  onFertig: () => Promise<void>;
}) {
  const neu = fach === null;
  const [nummer, setNummer] = useState(
    fach?.nummer ?? (vorhandene.length ? Math.max(...vorhandene) + 1 : 1),
  );
  const [groesse, setGroesse] = useState(fach?.groesse ?? 'S');
  const [zustand, setZustand] = useState<SchliessfachZustand>(fach?.zustand ?? 'frei');
  const [mieter, setMieter] = useState(fach?.mieter ?? '');
  const [kontakt, setKontakt] = useState(fach?.kontakt ?? '');
  const [von, setVon] = useState(fach?.mieteVon ?? '');
  const [bis, setBis] = useState(fach?.mieteBis ?? '');
  const [bezahlt, setBezahlt] = useState(fach?.bezahlt ?? false);
  const [ueberzahlung, setUeberzahlung] = useState(fach?.ueberzahlung ?? false);
  const [notiz, setNotiz] = useState(fach?.notiz ?? '');
  const [reihe, setReihe] = useState(false);
  const [bisNummer, setBisNummer] = useState(nummer);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    try {
      if (neu && reihe) {
        const anzahl = await repository.schliessfaecherAnlegen(nummer, bisNummer, groesse);
        if (anzahl === 0) setFehler('Alle diese Nummern gibt es schon.');
      } else {
        await repository.schliessfachSpeichern({
          id: fach?.id,
          nummer,
          groesse,
          zustand,
          mieter,
          kontakt,
          mieteVon: von,
          mieteBis: bis,
          bezahlt,
          ueberzahlung,
          notiz,
        });
      }
      await onFertig();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setLaeuft(false);
    }
  }

  async function loeschen() {
    if (!fach || !confirm(`Fach ${fach.nummer} wirklich entfernen?`)) return;
    setLaeuft(true);
    try {
      await repository.schliessfachLoeschen(fach.id);
      await onFertig();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
      setLaeuft(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <form onSubmit={speichern} className="db-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
        <h2 className="text-lg font-semibold">
          {neu ? 'Fach anlegen' : `Fach ${fach!.nummer}`}
        </h2>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            Nummer
            <input
              type="number"
              min={1}
              required
              value={nummer}
              onChange={(e) => setNummer(Number(e.target.value))}
              className="db-input mt-1"
            />
          </label>
          <label className="block text-sm font-medium">
            Größe
            <input
              value={groesse}
              onChange={(e) => setGroesse(e.target.value)}
              placeholder="S"
              className="db-input mt-1"
            />
          </label>
        </div>

        {/* Bei der Ersteinrichtung legt niemand dreiundachtzig Faecher einzeln
            an. Beim Aendern waere die Option sinnlos, deshalb steht sie nur hier. */}
        {neu && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reihe}
              onChange={(e) => {
                setReihe(e.target.checked);
                setBisNummer(Math.max(bisNummer, nummer));
              }}
            />
            Eine ganze Reihe anlegen
          </label>
        )}

        {neu && reihe && (
          <label className="mt-3 block text-sm font-medium">
            bis Nummer
            <input
              type="number"
              min={nummer}
              value={bisNummer}
              onChange={(e) => setBisNummer(Number(e.target.value))}
              className="db-input mt-1"
            />
            <span className="mt-1 block text-xs font-normal text-db-text3">
              Legt {Math.max(0, bisNummer - nummer + 1)} leere Fächer an. Vorhandene Nummern
              bleiben unberührt.
            </span>
          </label>
        )}

        {!(neu && reihe) && (
          <>
            <label className="mt-4 block text-sm font-medium">
              Zustand
              <select
                value={zustand}
                onChange={(e) => setZustand(e.target.value as SchliessfachZustand)}
                className="db-input mt-1"
              >
                {(Object.keys(ZUSTAND_TEXT) as SchliessfachZustand[]).map((z) => (
                  <option key={z} value={z}>
                    {ZUSTAND_TEXT[z]}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-sm font-medium">
              Name
              <input
                value={mieter}
                onChange={(e) => setMieter(e.target.value)}
                placeholder={'Nachname, Vorname \u2014 oder \u201eLager\u201c, \u201eVereinsfach \u2026\u201c'}
                className="db-input mt-1"
              />
            </label>

            <label className="mt-4 block text-sm font-medium">
              Erreichbar unter (optional)
              <input
                value={kontakt}
                onChange={(e) => setKontakt(e.target.value)}
                placeholder="Telefon oder E-Mail"
                className="db-input mt-1"
              />
              <span className="mt-1 block text-xs font-normal text-db-text3">
                Nur dafür da, jemanden vor dem Ablauf ansprechen zu können.
              </span>
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Miete von
                <input
                  type="date"
                  value={von}
                  onChange={(e) => setVon(e.target.value)}
                  className="db-input mt-1"
                />
              </label>
              <label className="block text-sm font-medium">
                Miete bis
                <input
                  type="date"
                  value={bis}
                  onChange={(e) => setBis(e.target.value)}
                  className="db-input mt-1"
                />
              </label>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bezahlt}
                  onChange={(e) => setBezahlt(e.target.checked)}
                />
                Bezahlt
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ueberzahlung}
                  onChange={(e) => setUeberzahlung(e.target.checked)}
                />
                Überbezahlung
                <span className="text-xs text-db-text3">
                  — es steht mehr Guthaben auf dem Fach als nötig
                </span>
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium">
              Notiz
              <input
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                placeholder="z. B. Schlüssel nachbestellt"
                className="db-input mt-1"
              />
            </label>
          </>
        )}

        {fehler && (
          <p className="mt-4 rounded-lg border border-db-bad px-3 py-2 text-sm text-db-bad">
            ■ {fehler}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="submit" disabled={laeuft} className="db-btn-gold px-4 py-2 text-sm">
            {laeuft ? 'Speichern…' : 'Speichern'}
          </button>
          <button type="button" onClick={onSchliessen} className="db-btn-ghost px-4 py-2 text-sm">
            Abbrechen
          </button>
          {!neu && (
            <button
              type="button"
              onClick={() => void loeschen()}
              disabled={laeuft}
              className="db-btn-ghost ml-auto px-4 py-2 text-sm text-db-bad"
            >
              <Icon name="warnung" size={14} className="mr-1 inline" />
              Entfernen
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function formatDatum(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
