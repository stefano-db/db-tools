import { useEffect, useRef, useState } from 'react';
import { verkleinern } from './bildVerkleinern';

/** Mehr sagt selten mehr; die Grenze haelt Speicher und Ladezeit im Rahmen. */
export const MAX_FOTOS = 5;

/** Vor dem Verkleinern. Alles darueber ist kein Handyfoto, sondern ein Versehen. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Fotos aussuchen, verkleinern und wieder wegnehmen.
 *
 * Ohne `capture`-Angabe am Feld: mit ihr bietet iOS nur die Kamera an, und der
 * haeufigste Fall ist ein Bild, das schon in der Mediathek liegt. Ohne sie
 * fragt das Geraet, und beides bleibt moeglich.
 */
export function Fotoauswahl({
  fotos,
  onChange,
  disabled,
}: {
  fotos: File[];
  onChange: (fotos: File[]) => void;
  disabled?: boolean;
}) {
  const feld = useRef<HTMLInputElement>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);

  async function aufnehmen(liste: FileList | null) {
    if (!liste?.length) return;
    setHinweis(null);
    const platz = MAX_FOTOS - fotos.length;
    const gewaehlt = Array.from(liste);
    const zuGross = gewaehlt.filter((f) => f.size > MAX_BYTES);
    const passend = gewaehlt.filter((f) => f.size <= MAX_BYTES).slice(0, platz);

    const meldungen: string[] = [];
    if (zuGross.length) meldungen.push(`${zuGross.length} Datei(en) zu groß (über 25 MB)`);
    if (gewaehlt.length - zuGross.length > platz) {
      meldungen.push(`höchstens ${MAX_FOTOS} Fotos je Meldung`);
    }
    if (meldungen.length) setHinweis(meldungen.join(' · '));

    if (passend.length) {
      setArbeitet(true);
      try {
        onChange([...fotos, ...(await Promise.all(passend.map((f) => verkleinern(f))))]);
      } finally {
        setArbeitet(false);
      }
    }
    // Zuruecksetzen, sonst loest dieselbe Datei beim zweiten Mal nichts aus.
    if (feld.current) feld.current.value = '';
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Fotos (optional)</span>
        <span className="text-xs text-lw-text3">
          {fotos.length}/{MAX_FOTOS}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-2">
        {fotos.map((foto, i) => (
          <Vorschau
            key={`${foto.name}-${i}`}
            datei={foto}
            onEntfernen={() => onChange(fotos.filter((_, j) => j !== i))}
            disabled={disabled}
          />
        ))}

        {fotos.length < MAX_FOTOS && (
          <button
            type="button"
            onClick={() => feld.current?.click()}
            disabled={disabled || arbeitet}
            className="grid h-20 w-20 shrink-0 place-items-center rounded border border-dashed border-lw-line text-xs text-lw-text3 hover:bg-lw-card2 disabled:opacity-40"
          >
            {arbeitet ? '…' : '+ Foto'}
          </button>
        )}
      </div>

      <input
        ref={feld}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void aufnehmen(e.target.files)}
      />

      {hinweis && <p className="mt-1 text-xs text-lw-warn">{hinweis}</p>}
    </div>
  );
}

function Vorschau({
  datei,
  onEntfernen,
  disabled,
}: {
  datei: File;
  onEntfernen: () => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  // Die Adresse haelt den Speicher der Datei fest, bis sie freigegeben wird.
  // Ohne das Aufraeumen sammelt sich bei jedem Wechsel ein Foto im Speicher an.
  useEffect(() => {
    const adresse = URL.createObjectURL(datei);
    setUrl(adresse);
    return () => URL.revokeObjectURL(adresse);
  }, [datei]);

  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded border border-lw-line">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      <button
        type="button"
        onClick={onEntfernen}
        disabled={disabled}
        aria-label="Foto entfernen"
        className="absolute top-0.5 right-0.5 grid h-5 w-5 place-items-center rounded bg-black/60 text-xs leading-none text-white hover:bg-black/80"
      >
        ×
      </button>
    </div>
  );
}
