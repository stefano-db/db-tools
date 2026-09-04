import { useRef, useState } from 'react';
import { useData } from '../../app/DataContext';
import type { IssuePhoto, IssueRow } from '../../data/types';
import { verkleinern } from './bildVerkleinern';
import { MAX_FOTOS } from './Fotoauswahl';

/**
 * Fotos einer Defektmeldung ansehen und nachreichen.
 *
 * Geholt werden die Bilder erst beim Aufklappen: ihre Adressen sind zeitlich
 * begrenzt und muessen einzeln unterschrieben werden. Fuer zwoelf Meldungen auf
 * Vorrat zu unterschreiben, waere Arbeit fuer Bilder, die meist niemand oeffnet.
 */
export function IssueFotos({ issue }: { issue: IssueRow }) {
  const { repo, reload, canWrite } = useData();
  const feld = useRef<HTMLInputElement>(null);
  const [offen, setOffen] = useState(false);
  const [fotos, setFotos] = useState<IssuePhoto[] | null>(null);
  const [gross, setGross] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function aufklappen() {
    if (offen) {
      setOffen(false);
      return;
    }
    setOffen(true);
    if (fotos) return;
    setLaedt(true);
    setFehler(null);
    try {
      setFotos(await repo.issuePhotos(issue.id));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Fotos konnten nicht geladen werden.');
    } finally {
      setLaedt(false);
    }
  }

  async function hinzufuegen(liste: FileList | null) {
    if (!liste?.length) return;
    setLaedt(true);
    setFehler(null);
    try {
      const platz = MAX_FOTOS - issue.photoCount;
      const gewaehlt = Array.from(liste).slice(0, Math.max(0, platz));
      if (gewaehlt.length === 0) {
        setFehler(`Höchstens ${MAX_FOTOS} Fotos je Meldung.`);
        return;
      }
      await repo.addIssuePhotos(issue.id, await Promise.all(gewaehlt.map((f) => verkleinern(f))));
      // Neu holen statt anhaengen: die Anzahl in der Meldung kommt aus dem
      // Bestand, und was dort steht, weiss nur die Datenbank.
      setFotos(await repo.issuePhotos(issue.id));
      setOffen(true);
      await reload();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Hochladen fehlgeschlagen.');
    } finally {
      setLaedt(false);
      if (feld.current) feld.current.value = '';
    }
  }

  return (
    <>
      <div className="flex w-full flex-wrap items-center gap-2">
        {issue.photoCount > 0 && (
          <button
            onClick={() => void aufklappen()}
            className="rounded border border-lw-line px-2 py-1 text-xs font-medium text-lw-text2 hover:bg-lw-card2"
            aria-expanded={offen}
          >
            📷 {issue.photoCount} {issue.photoCount === 1 ? 'Foto' : 'Fotos'}
          </button>
        )}

        {canWrite && issue.photoCount < MAX_FOTOS && (
          <button
            onClick={() => feld.current?.click()}
            disabled={laedt}
            className="rounded border border-lw-line px-2 py-1 text-xs font-medium text-lw-text3 hover:bg-lw-card2 disabled:opacity-40"
          >
            {laedt ? '…' : issue.photoCount > 0 ? '+ Foto' : '+ Foto hinzufügen'}
          </button>
        )}

        <input
          ref={feld}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void hinzufuegen(e.target.files)}
        />
      </div>

      {fehler && <p className="w-full text-xs text-lw-bad">{fehler}</p>}

      {offen && (
        <div className="w-full">
          {laedt && !fotos ? (
            <p className="text-xs text-lw-text3">Fotos werden geladen…</p>
          ) : fotos && fotos.length === 0 ? (
            <p className="text-xs text-lw-text3">Keine Fotos hinterlegt.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fotos?.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setGross(f.url)}
                  className="h-20 w-20 overflow-hidden rounded border border-lw-line"
                  aria-label="Foto vergrößern"
                >
                  <img src={f.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {gross && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
          onClick={() => setGross(null)}
        >
          <img src={gross} alt="" className="max-h-full max-w-full object-contain" />
          <button
            onClick={() => setGross(null)}
            className="absolute top-4 right-4 rounded bg-black/60 px-3 py-1.5 text-sm font-medium text-white"
          >
            Schließen
          </button>
        </div>
      )}
    </>
  );
}
