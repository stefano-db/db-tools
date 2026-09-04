import { useCallback, useEffect, useMemo, useState } from 'react';
import { repository, DEPARTMENT_LABEL, type Wunsch, type WunschStatus } from '../../data';
import { useAuth } from '../../app/AuthContext';
import { sortiere, STATUS_TEXT, type Filter } from './wunschModel';

/**
 * Wünsche der Mannschaft an die Plattform.
 *
 * Ein Briefkasten allein hätte hier nicht gereicht. Wer etwas einwirft und nie
 * wieder davon hört, wirft kein zweites Mal ein — deshalb trägt jeder Wunsch
 * seinen Stand, und die Leitung kann antworten. Und weil zwölf Zustimmungen
 * etwas anderes sind als ein Einfall, lässt sich zustimmen; ohne diese Zahl
 * müsste die Leitung raten, was sich lohnt.
 */
export function WuenschePage() {
  const { session } = useAuth();
  const darfBeantworten = Boolean(session?.isLead || session?.isAdmin || session === null);

  const [liste, setListe] = useState<Wunsch[] | null>(null);
  const [filter, setFilter] = useState<Filter>('offen');
  const [fehler, setFehler] = useState<string | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);

  const laden = useCallback(async () => {
    try {
      setListe(await repository.wuensche());
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Wünsche konnten nicht geladen werden.');
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  const gezeigt = useMemo(() => sortiere(liste ?? [], filter), [liste, filter]);
  const offene = (liste ?? []).filter((w) => w.status === 'offen').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Wünsche</h1>
          <p className="mt-1 text-sm text-lw-text2">
            Was fehlt dir an der Plattform? Schreib es auf. Was viele wollen, kommt zuerst.
          </p>
        </div>
        <button onClick={() => setNeuOffen(true)} className="lw-btn-primary px-4 py-2 text-sm">
          + Wunsch einreichen
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(['offen', 'alle', 'meine'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              filter === f ? 'lw-btn-primary' : 'lw-btn-ghost'
            }`}
          >
            {f === 'offen' ? `Offen${offene ? ` (${offene})` : ''}` : f === 'alle' ? 'Alle' : 'Meine'}
          </button>
        ))}
      </div>

      {fehler && (
        <p className="rounded border border-lw-bad bg-lw-bad/10 px-3 py-2 text-sm text-lw-bad">{fehler}</p>
      )}

      {liste === null ? (
        <p className="text-lw-text3">Wird geladen…</p>
      ) : gezeigt.length === 0 ? (
        <p className="rounded-lg border border-lw-line bg-lw-card2 px-4 py-6 text-center text-sm text-lw-text3">
          {filter === 'meine'
            ? 'Du hast noch nichts eingereicht.'
            : filter === 'offen'
              ? 'Keine offenen Wünsche.'
              : 'Noch keine Wünsche.'}
        </p>
      ) : (
        <div className="space-y-3">
          {gezeigt.map((w) => (
            <WunschKarte
              key={w.id}
              wunsch={w}
              darfBeantworten={darfBeantworten}
              onGeaendert={laden}
              onFehler={setFehler}
            />
          ))}
        </div>
      )}

      {neuOffen && (
        <WunschDialog
          onClose={() => setNeuOffen(false)}
          onSpeichern={async (titel, text) => {
            await repository.wunschEinreichen(titel, text);
            await laden();
          }}
        />
      )}
    </div>
  );
}

function WunschKarte({
  wunsch,
  darfBeantworten,
  onGeaendert,
  onFehler,
}: {
  wunsch: Wunsch;
  darfBeantworten: boolean;
  onGeaendert: () => Promise<void>;
  onFehler: (text: string | null) => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [antwortOffen, setAntwortOffen] = useState(false);

  async function mit(arbeit: () => Promise<void>) {
    setLaeuft(true);
    onFehler(null);
    try {
      await arbeit();
      await onGeaendert();
    } catch (e) {
      onFehler(e instanceof Error ? e.message : 'Hat nicht geklappt.');
    } finally {
      setLaeuft(false);
    }
  }

  const stand = STATUS_TEXT[wunsch.status];

  return (
    <div className="lw-card p-4">
      <div className="flex items-start gap-3">
        {/* Der Zustimmungsknopf steht vorn und trägt die Zahl. Sie ist das
            Erste, wonach jemand sucht, der die Liste von oben durchgeht. */}
        <button
          onClick={() => void mit(() => repository.wunschStimmen(wunsch.id, !wunsch.ichHabeGestimmt))}
          disabled={laeuft}
          aria-pressed={wunsch.ichHabeGestimmt}
          title={wunsch.ichHabeGestimmt ? 'Zustimmung zurücknehmen' : 'Ich will das auch'}
          className={`flex w-14 shrink-0 flex-col items-center rounded-lg border px-2 py-1.5 disabled:opacity-40 ${
            wunsch.ichHabeGestimmt
              ? 'border-lw-line2 bg-lw-card2 text-lw-text'
              : 'border-lw-line text-lw-text3 hover:bg-lw-card2'
          }`}
        >
          <span className="text-sm leading-none">▲</span>
          <span className="tabular mt-0.5 text-base leading-none font-bold">{wunsch.stimmen}</span>
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{wunsch.titel}</h2>
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${stand.cls}`}>{stand.label}</span>
          </div>

          {wunsch.beschreibung && (
            <p className="text-sm whitespace-pre-line text-lw-text2">{wunsch.beschreibung}</p>
          )}

          <p className="text-xs text-lw-text3">
            {wunsch.eingereichtVonName}
            {wunsch.bereich && ` · ${DEPARTMENT_LABEL[wunsch.bereich]}`} ·{' '}
            {new Date(wunsch.eingereichtAm).toLocaleDateString('de-DE')}
          </p>

          {wunsch.antwort && (
            <div className="mt-2 rounded-md border-l-2 border-lw-line2 bg-lw-card2 px-3 py-2">
              <p className="text-sm whitespace-pre-line text-lw-text2">{wunsch.antwort}</p>
              <p className="mt-1 text-xs text-lw-text3">
                {wunsch.beantwortetVonName ?? 'Leitung'}
                {wunsch.beantwortetAm && ` · ${new Date(wunsch.beantwortetAm).toLocaleDateString('de-DE')}`}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {wunsch.meiner && (
              <button
                onClick={() => setBearbeiten(true)}
                className="lw-btn-ghost px-2.5 py-1 text-xs font-medium"
              >
                Bearbeiten
              </button>
            )}
            {darfBeantworten && (
              <button
                onClick={() => setAntwortOffen(true)}
                className="lw-btn-ghost px-2.5 py-1 text-xs font-medium"
              >
                {wunsch.antwort ? 'Antwort ändern' : 'Antworten'}
              </button>
            )}
          </div>
        </div>
      </div>

      {bearbeiten && (
        <WunschDialog
          titelVor={wunsch.titel}
          textVor={wunsch.beschreibung ?? ''}
          onClose={() => setBearbeiten(false)}
          onSpeichern={async (titel, text) => {
            await mit(() => repository.wunschAendern(wunsch.id, titel, text));
          }}
        />
      )}

      {antwortOffen && (
        <AntwortDialog
          wunsch={wunsch}
          onClose={() => setAntwortOffen(false)}
          onSpeichern={async (status, antwort) => {
            await mit(() => repository.wunschBeantworten(wunsch.id, status, antwort));
          }}
        />
      )}
    </div>
  );
}

function WunschDialog({
  titelVor = '',
  textVor = '',
  onClose,
  onSpeichern,
}: {
  titelVor?: string;
  textVor?: string;
  onClose: () => void;
  onSpeichern: (titel: string, text: string) => Promise<void>;
}) {
  const [titel, setTitel] = useState(titelVor);
  const [text, setText] = useState(textVor);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Die Datenbank besteht auf mindestens drei Zeichen. Der Knopf sagt das
  // vorher, statt die Meldung nach dem Absenden zu zeigen.
  const gueltig = titel.trim().length >= 3;

  async function speichern() {
    if (!gueltig) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await onSpeichern(titel, text);
      onClose();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
      setLaeuft(false);
    }
  }

  return (
    <Rahmen onClose={onClose} titel={titelVor ? 'Wunsch bearbeiten' : 'Wunsch einreichen'}>
      <label className="block text-sm font-medium">
        Worum geht es?
        <input
          autoFocus
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          maxLength={120}
          placeholder="z. B. Urlaubsantrag direkt in der App"
          className="lw-input mt-1"
        />
      </label>

      <label className="block text-sm font-medium">
        Erklärung (optional)
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Was soll es können, und was wäre damit einfacher?"
          className="lw-input mt-1"
        />
      </label>

      {fehler && <p className="text-sm text-lw-bad">{fehler}</p>}

      <Knoepfe
        onClose={onClose}
        onSpeichern={speichern}
        gesperrt={!gueltig || laeuft}
        text={laeuft ? 'Wird gespeichert…' : titelVor ? 'Speichern' : 'Einreichen'}
      />
    </Rahmen>
  );
}

function AntwortDialog({
  wunsch,
  onClose,
  onSpeichern,
}: {
  wunsch: Wunsch;
  onClose: () => void;
  onSpeichern: (status: WunschStatus, antwort: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<WunschStatus>(wunsch.status);
  const [antwort, setAntwort] = useState(wunsch.antwort ?? '');
  const [laeuft, setLaeuft] = useState(false);

  // Ein „abgelehnt" ohne Begründung ist die schlechteste Antwort von allen:
  // sie kostet den Einreicher die Lust und sagt ihm nichts.
  const brauchtBegruendung = status === 'abgelehnt';
  const gueltig = !brauchtBegruendung || antwort.trim().length > 0;

  return (
    <Rahmen onClose={onClose} titel="Antworten">
      <p className="text-sm text-lw-text2">{wunsch.titel}</p>

      <fieldset>
        <legend className="text-sm font-medium">Stand</legend>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {(['offen', 'geplant', 'umgesetzt', 'abgelehnt'] as WunschStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded border px-3 py-1.5 text-sm font-medium ${
                status === s ? 'border-lw-line2 lw-btn-primary' : 'border-lw-line'
              }`}
            >
              {STATUS_TEXT[s].label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm font-medium">
        Antwort {brauchtBegruendung && <span className="text-lw-text3">(bei „Abgelehnt" nötig)</span>}
        <textarea
          value={antwort}
          onChange={(e) => setAntwort(e.target.value)}
          rows={3}
          className="lw-input mt-1"
        />
      </label>

      <Knoepfe
        onClose={onClose}
        onSpeichern={async () => {
          setLaeuft(true);
          await onSpeichern(status, antwort);
          onClose();
        }}
        gesperrt={!gueltig || laeuft}
        text={laeuft ? 'Wird gespeichert…' : 'Speichern'}
      />
    </Rahmen>
  );
}

function Rahmen({
  titel,
  onClose,
  children,
}: {
  titel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="lw-card max-h-full w-full max-w-lg space-y-3 overflow-y-auto p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{titel}</h2>
        {children}
      </div>
    </div>
  );
}

function Knoepfe({
  onClose,
  onSpeichern,
  gesperrt,
  text,
}: {
  onClose: () => void;
  onSpeichern: () => void;
  gesperrt: boolean;
  text: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button onClick={onClose} className="rounded px-4 py-2 text-sm font-medium hover:bg-lw-card2">
        Abbrechen
      </button>
      <button
        onClick={onSpeichern}
        disabled={gesperrt}
        className="lw-btn-primary px-4 py-2 text-sm disabled:opacity-40"
      >
        {text}
      </button>
    </div>
  );
}
