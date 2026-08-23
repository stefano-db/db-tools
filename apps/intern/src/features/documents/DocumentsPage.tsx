import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { formatDateDe } from '../../core';
import { useModule } from '../../app/ModuleContext';
import { DEPARTMENT_LABEL, repository, type Department, type DocumentRow } from '../../data';

/**
 * Unterlagen zum Ausdrucken — je Bereich getrennt.
 *
 * Der Zweck ist nicht das Ablegen von Dateien, sondern das wiederholte
 * Ausdrucken derselben Unterlagen. Deshalb steht „Drucken" an erster Stelle,
 * und die Liste merkt sich, was zuletzt gebraucht wurde.
 *
 * Jeder Bereich hat seinen eigenen Ablageort. Getrennt heisst dabei wirklich
 * getrennt: Was hier nicht steht, ist nicht bloss ausgeblendet — die Datenbank
 * gibt es gar nicht erst heraus. Diese Seite ordnet nur, was ohnehin ankommt.
 */
export function DocumentsPage() {
  const { session } = useAuth();
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  // Was jemand darf, steht in der Modulliste und nicht in einer Regel, die hier
  // den Bereich errät. Vorher hiess es „alle ausser der Mechanik" — das stimmte
  // genau so lange, bis die Mechanik ihren eigenen Ablageort bekam.
  const { module } = useModule();
  const canWrite = module?.find((m) => m.key === 'dokumente')?.canWrite === true;
  const eigener = session?.department ?? null;

  const reload = useCallback(async () => {
    try {
      setDocs(await repository.listDocuments());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * Erst nach Bereich, darin nach Kategorie.
   *
   * Die Reihenfolge ist nicht alphabetisch, sondern nach Naehe: der eigene
   * Bereich zuerst, dann was alle angeht, dann der Rest — den sieht ohnehin nur
   * die Geschaeftsfuehrung.
   */
  const bereiche = useMemo(() => {
    const term = search.trim().toLowerCase();
    const passend = (docs ?? []).filter(
      (d) =>
        !term ||
        d.title.toLowerCase().includes(term) ||
        (d.description ?? '').toLowerCase().includes(term) ||
        (d.category ?? '').toLowerCase().includes(term),
    );

    const nachBereich = new Map<string, DocumentRow[]>();
    for (const d of passend) {
      const schluessel = d.bereich ?? 'alle';
      (nachBereich.get(schluessel) ?? nachBereich.set(schluessel, []).get(schluessel)!).push(d);
    }

    const rang = (schluessel: string) =>
      schluessel === eigener ? 0 : schluessel === 'alle' ? 1 : 2;

    return [...nachBereich.entries()]
      .sort(([a], [b]) => rang(a) - rang(b) || a.localeCompare(b, 'de'))
      .map(([schluessel, liste]) => {
        const kategorien = new Map<string, DocumentRow[]>();
        for (const d of liste) {
          const key = d.category?.trim() || 'Ohne Kategorie';
          (kategorien.get(key) ?? kategorien.set(key, []).get(key)!).push(d);
        }
        return {
          schluessel,
          titel:
            schluessel === 'alle'
              ? 'Geht alle an'
              : DEPARTMENT_LABEL[schluessel as Department] ?? schluessel,
          hinweis:
            schluessel === 'alle'
              ? 'Aushänge und Unterlagen des ganzen Hauses.'
              : schluessel === eigener
                ? 'Dein Bereich.'
                : 'Anderer Bereich — sichtbar, weil du Administrator bist.',
          kategorien: [...kategorien.entries()].sort(([a], [b]) => a.localeCompare(b, 'de')),
        };
      });
  }, [docs, search, eigener]);

  const recent = useMemo(
    () =>
      (docs ?? [])
        .filter((d) => d.lastPrintedAt)
        .sort((a, b) => (a.lastPrintedAt! < b.lastPrintedAt! ? 1 : -1))
        .slice(0, 4),
    [docs],
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold">Dokumente</h1>
            <p className="text-sm text-db-text2">
              Unterlagen zum Ausdrucken — Formulare, Preislisten, Aushänge.{' '}
              {session?.isAdmin
                ? 'Als Administrator siehst du alle Bereiche.'
                : eigener
                  ? `Dein Bereich: ${DEPARTMENT_LABEL[eigener]}.`
                  : 'Dir ist noch kein Bereich zugeordnet.'}
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => setShowUpload(true)}
              className="db-btn-gold px-4 py-2.5 text-sm"
            >
              + Datei hochladen
            </button>
          )}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen…"
          className="db-input mt-4"
        />

        {error && (
          <p className="mt-4 db-card border-db-bad px-4 py-3 text-db-bad">
            ■ {error}
          </p>
        )}

        {recent.length > 0 && !search && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-db-text3 uppercase">
              Zuletzt gedruckt
            </h2>
            <div className="flex flex-wrap gap-2">
              {recent.map((d) => (
                <QuickPrint key={d.id} doc={d} onDone={reload} onError={setError} />
              ))}
            </div>
          </section>
        )}

        {docs !== null && docs.length === 0 && (
          <p className="mt-6 db-card px-4 py-6 text-db-text2">
            Noch keine Dokumente abgelegt.
            {canWrite && ' Lade die erste Datei hoch — JPG, PDF, Word oder Excel.'}
          </p>
        )}

        {bereiche.map((b) => (
          <section key={b.schluessel} className="mt-8">
            <div className="mb-3 border-b border-db-line pb-2">
              <h2 className="text-lg font-bold">{b.titel}</h2>
              <p className="text-xs text-db-text3">{b.hinweis}</p>
            </div>

            {b.kategorien.map(([category, list]) => (
              <div key={category} className="mt-4">
                <h3 className="mb-2 text-sm font-semibold tracking-wide text-db-text3 uppercase">
                  {category}
                </h3>
                {/* Dicht genug, dass man eine Liste sieht und nicht einen Stapel.
                    Am schmalsten Handy zwei nebeneinander — bei drei bliebe je
                    Kachel gut ein Daumen Breite, und Titel wie Knoepfe waeren
                    nicht mehr zu treffen. Ab Tablet drei, am Rechner vier bis
                    fuenf. */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {list.map((d) => (
                    <DocumentCard
                      key={d.id}
                      doc={d}
                      canWrite={canWrite && (session?.isAdmin === true || d.bereich === eigener)}
                      onChanged={reload}
                      onError={setError}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}

        <p className="mt-6 text-xs text-db-text3">
          PDF und Bilder öffnen sich direkt zum Drucken. Word- und Excel-Dateien kann der Browser
          nicht anzeigen — sie werden heruntergeladen und im jeweiligen Programm gedruckt. Wenn
          etwas immer gleich aussehen soll, ist eine PDF-Datei die verlässlichere Wahl.
        </p>
      </div>

      {showUpload && (
        <UploadDialog
          knownCategories={[...new Set((docs ?? []).map((d) => d.category).filter(Boolean) as string[])]}
          eigener={eigener}
          istAdmin={session?.isAdmin === true}
          onClose={() => setShowUpload(false)}
          onDone={async () => {
            setShowUpload(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

/** PDF und Bilder in neuem Tab öffnen, Office-Dateien herunterladen. */
async function openForPrint(doc: DocumentRow) {
  const viewable = doc.mimeType === 'application/pdf' || doc.mimeType.startsWith('image/');
  const url = await repository.documentUrl(doc.id, !viewable);
  window.open(url, '_blank', 'noopener,noreferrer');
  await repository.markDocumentPrinted(doc.id);
}

function QuickPrint({
  doc,
  onDone,
  onError,
}: {
  doc: DocumentRow;
  onDone: () => Promise<void>;
  onError: (m: string) => void;
}) {
  return (
    <button
      onClick={async () => {
        try {
          await openForPrint(doc);
          await onDone();
        } catch (e) {
          onError(e instanceof Error ? e.message : String(e));
        }
      }}
      className="db-btn-ghost rounded-full px-4 py-2 text-sm"
    >
      🖨 {doc.title}
    </button>
  );
}

/**
 * Kachel mit Vorschau.
 *
 * Bilder werden direkt angezeigt, PDF über die eingebaute Anzeige des Browsers —
 * das spart eine Bibliothek von rund einem Megabyte und zeigt trotzdem die echte
 * erste Seite. Geladen wird erst, wenn die Kachel sichtbar ist; bei vierzig
 * Vorlagen würde sonst alles auf einmal gezogen.
 */
function DocumentCard({
  doc,
  canWrite,
  onChanged,
  onError,
}: {
  doc: DocumentRow;
  canWrite: boolean;
  onChanged: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setVisible(true),
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const isImage = doc.mimeType.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';

  return (
    <div className="flex flex-col overflow-hidden db-card">
      <div
        ref={ref}
        onClick={() => run(() => openForPrint(doc))}
        title="Öffnen und drucken"
        className="relative grid h-28 cursor-pointer place-items-center overflow-hidden bg-db-card2 sm:h-32"
      >
        {visible && doc.previewUrl && isImage && (
          <img
            src={doc.previewUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain"
          />
        )}
        {visible && doc.previewUrl && isPdf && (
          <>
            <embed
              src={`${doc.previewUrl}#toolbar=0&navpanes=0&view=FitH`}
              type="application/pdf"
              className="h-full w-full"
            />
            {/* Deckt die eingebettete Anzeige ab, damit der Klick die Kachel
                trifft und nicht im PDF-Betrachter versandet. */}
            <span className="absolute inset-0" />
          </>
        )}
        {(!visible || (!isImage && !isPdf)) && (
          <div className="text-center">
            <div className="text-4xl">{icon(doc.mimeType)}</div>
            {!isImage && !isPdf && (
              <div className="mt-1 text-xs text-db-text3">keine Vorschau möglich</div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <div className="text-sm font-medium">{doc.title}</div>
        <div className="truncate text-xs text-db-text3" title={doc.fileName}>
          {doc.fileName} · {formatSize(doc.sizeBytes)}
        </div>
        {doc.description && <div className="mt-1 text-xs text-db-text2">{doc.description}</div>}
        <div className="mt-1 text-xs text-db-text3">
          {doc.lastPrintedAt ? (
            <>
              zuletzt gedruckt {formatDateDe(doc.lastPrintedAt.slice(0, 10))} · {doc.printCount}×
            </>
          ) : (
            'noch nie gedruckt'
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            disabled={busy}
            onClick={() => run(() => openForPrint(doc))}
            className="flex-1 db-btn-gold px-2 py-1.5 text-xs whitespace-nowrap disabled:opacity-40"
          >
            🖨 Drucken
          </button>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const url = await repository.documentUrl(doc.id, true);
                window.open(url, '_blank', 'noopener,noreferrer');
              })
            }
            className="db-btn-ghost px-2 py-1.5 text-xs"
            title="Herunterladen"
          >
            ⭳
          </button>
          {canWrite && (
            <button
              disabled={busy}
              onClick={() => {
                if (confirm(`„${doc.title}" aus der Liste nehmen?`)) {
                  void run(() => repository.archiveDocument(doc.id));
                }
              }}
              className="db-btn-ghost px-2 py-1.5 text-xs"
              title="Entfernen"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadDialog({
  knownCategories,
  eigener,
  istAdmin,
  onClose,
  onDone,
}: {
  knownCategories: string[];
  eigener: Department | null;
  istAdmin: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  // Vorbelegt mit dem eigenen Bereich: das ist in neun von zehn Faellen richtig,
  // und wer es anders will, sieht die Wahl unmittelbar daneben.
  const [bereich, setBereich] = useState<Department | 'alle'>(eigener ?? 'alle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    setFile(f);
    // Dateiname als Titelvorschlag, ohne Endung — der lässt sich überschreiben.
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await repository.uploadDocument({
        file,
        title,
        description,
        category,
        bereich: bereich === 'alle' ? null : bereich,
      });
      await onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        message.toLowerCase().includes('mime')
          ? 'Dieser Dateityp ist nicht vorgesehen. Erlaubt sind JPG, PNG, PDF, Word und Excel.'
          : message.toLowerCase().includes('size')
            ? 'Die Datei ist größer als 25 MB.'
            : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <form onSubmit={submit} className="db-card w-full max-w-md p-5">
        <h2 className="text-lg font-semibold">Datei hochladen</h2>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0] ?? null);
          }}
          onClick={() => inputRef.current?.click()}
          className="mt-4 cursor-pointer rounded-xl border-2 border-dashed border-db-line px-4 py-8 text-center hover:border-db-gold-dim"
        >
          {file ? (
            <>
              <div className="text-2xl">{icon(file.type)}</div>
              <div className="mt-1 font-medium">{file.name}</div>
              <div className="text-xs text-db-text3">{formatSize(file.size)}</div>
            </>
          ) : (
            <div className="text-sm text-db-text2">
              Datei hierher ziehen oder klicken
              <div className="mt-1 text-xs text-db-text3">JPG, PNG, PDF, Word, Excel · max. 25 MB</div>
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx,.odt,.ods"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />

        <label className="mt-4 block text-sm font-medium">
          Bezeichnung
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Preisliste Bahnen"
            className="db-input mt-1"
          />
        </label>

        {/* Wohin die Unterlage gehoert. Wer keinen zweiten Bereich waehlen darf,
            bekommt keine Auswahl vorgesetzt, sondern die Auskunft, wo sie
            landet — eine Liste mit einem einzigen Eintrag ist eine Zumutung. */}
        <label className="mt-4 block text-sm font-medium">
          Bereich
          {istAdmin ? (
            <select
              value={bereich}
              onChange={(e) => setBereich(e.target.value as Department | 'alle')}
              className="db-input mt-1"
            >
              {(Object.keys(DEPARTMENT_LABEL) as Department[]).map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABEL[d]}
                </option>
              ))}
              <option value="alle">Geht alle an</option>
            </select>
          ) : (
            <p className="mt-1 text-sm font-normal text-db-text2">
              {eigener
                ? `${DEPARTMENT_LABEL[eigener]} — nur dein Bereich sieht diese Unterlage.`
                : 'Dir ist kein Bereich zugeordnet; die Datei lässt sich nicht ablegen.'}
            </p>
          )}
        </label>

        <label className="mt-4 block text-sm font-medium">
          Kategorie
          <input
            list="kategorien"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="z. B. Preislisten"
            className="db-input mt-1"
          />
          <datalist id="kategorien">
            {knownCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className="mt-4 block text-sm font-medium">
          Notiz (optional)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="z. B. immer beidseitig drucken"
            className="db-input mt-1"
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg border border-db-bad px-3 py-2 text-sm text-db-bad">
            ■ {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="db-btn-ghost px-4 py-2 text-sm">
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={busy || !file}
            className="db-btn-gold px-4 py-2.5 text-sm disabled:opacity-40"
          >
            {busy ? 'Wird hochgeladen…' : 'Hochladen'}
          </button>
        </div>
      </form>
    </div>
  );
}

function icon(mime: string): string {
  if (mime === 'application/pdf') return '📕';
  if (mime.startsWith('image/')) return '🖼';
  if (mime.includes('word') || mime.includes('opendocument.text')) return '📘';
  if (mime.includes('sheet') || mime.includes('excel')) return '📗';
  return '📄';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
