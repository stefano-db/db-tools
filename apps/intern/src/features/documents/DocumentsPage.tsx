import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '../../app/Header';
import { useAuth } from '../../app/AuthContext';
import { formatDateDe } from '../../core';
import { repository, type DocumentRow } from '../../data';

/**
 * Druckvorlagen für den Counter.
 *
 * Der Zweck ist nicht das Ablegen von Dateien, sondern das wiederholte
 * Ausdrucken derselben Unterlagen. Deshalb steht „Drucken" an erster Stelle,
 * und die Liste merkt sich, was zuletzt gebraucht wurde.
 */
export function DocumentsPage() {
  const { session } = useAuth();
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const canWrite = session?.isAdmin === true || session?.department !== 'mechanik';

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

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (docs ?? []).filter(
      (d) =>
        !term ||
        d.title.toLowerCase().includes(term) ||
        (d.description ?? '').toLowerCase().includes(term) ||
        (d.category ?? '').toLowerCase().includes(term),
    );
    const map = new Map<string, DocumentRow[]>();
    for (const d of filtered) {
      const key = d.category?.trim() || 'Ohne Kategorie';
      (map.get(key) ?? map.set(key, []).get(key)!).push(d);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'de'));
  }, [docs, search]);

  const recent = useMemo(
    () =>
      (docs ?? [])
        .filter((d) => d.lastPrintedAt)
        .sort((a, b) => (a.lastPrintedAt! < b.lastPrintedAt! ? 1 : -1))
        .slice(0, 4),
    [docs],
  );

  return (
    <div className="min-h-screen">
      <Header moduleName="Dokumente" busy={docs === null} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dokumente</h1>
            <p className="text-sm text-slate-600">
              Unterlagen zum Ausdrucken — Formulare, Preislisten, Aushänge.
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => setShowUpload(true)}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              + Datei hochladen
            </button>
          )}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen…"
          className="mt-4 w-full rounded border border-slate-300 px-3 py-2"
        />

        {error && (
          <p className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">
            ■ {error}
          </p>
        )}

        {recent.length > 0 && !search && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
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
          <p className="mt-6 rounded border border-slate-300 bg-white px-4 py-6 text-slate-700">
            Noch keine Dokumente abgelegt.
            {canWrite && ' Lade die erste Datei hoch — JPG, PDF, Word oder Excel.'}
          </p>
        )}

        {groups.map(([category, list]) => (
          <section key={category} className="mt-6">
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
              {category}
            </h2>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {list.map((d) => (
                <DocumentRowView
                  key={d.id}
                  doc={d}
                  canWrite={canWrite}
                  onChanged={reload}
                  onError={setError}
                />
              ))}
            </div>
          </section>
        ))}

        <p className="mt-6 text-xs text-slate-500">
          PDF und Bilder öffnen sich direkt zum Drucken. Word- und Excel-Dateien kann der Browser
          nicht anzeigen — sie werden heruntergeladen und im jeweiligen Programm gedruckt. Wenn
          etwas immer gleich aussehen soll, ist eine PDF-Datei die verlässlichere Wahl.
        </p>
      </main>

      {showUpload && (
        <UploadDialog
          knownCategories={[...new Set((docs ?? []).map((d) => d.category).filter(Boolean) as string[])]}
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
      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:border-slate-500"
    >
      🖨 {doc.title}
    </button>
  );
}

function DocumentRowView({
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

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="text-2xl" aria-hidden="true">
        {icon(doc.mimeType)}
      </span>
      <div className="min-w-48 flex-1">
        <div className="font-medium">{doc.title}</div>
        <div className="text-xs text-slate-500">
          {doc.fileName} · {formatSize(doc.sizeBytes)}
          {doc.lastPrintedAt && (
            <> · zuletzt gedruckt {formatDateDe(doc.lastPrintedAt.slice(0, 10))}</>
          )}
          {doc.printCount > 0 && <> · {doc.printCount}×</>}
        </div>
        {doc.description && <div className="mt-0.5 text-sm text-slate-600">{doc.description}</div>}
      </div>

      <button
        disabled={busy}
        onClick={() => run(() => openForPrint(doc))}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
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
        className="rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
      >
        Herunterladen
      </button>
      {canWrite && (
        <button
          disabled={busy}
          onClick={() => {
            if (confirm(`„${doc.title}" aus der Liste nehmen?`)) {
              void run(() => repository.archiveDocument(doc.id));
            }
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Entfernen
        </button>
      )}
    </div>
  );
}

function UploadDialog({
  knownCategories,
  onClose,
  onDone,
}: {
  knownCategories: string[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
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
      await repository.uploadDocument({ file, title, description, category });
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Datei hochladen</h2>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0] ?? null);
          }}
          onClick={() => inputRef.current?.click()}
          className="mt-4 cursor-pointer rounded border-2 border-dashed border-slate-300 px-4 py-8 text-center hover:border-slate-400"
        >
          {file ? (
            <>
              <div className="text-2xl">{icon(file.type)}</div>
              <div className="mt-1 font-medium">{file.name}</div>
              <div className="text-xs text-slate-500">{formatSize(file.size)}</div>
            </>
          ) : (
            <div className="text-sm text-slate-600">
              Datei hierher ziehen oder klicken
              <div className="mt-1 text-xs text-slate-500">JPG, PNG, PDF, Word, Excel · max. 25 MB</div>
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
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          Kategorie
          <input
            list="kategorien"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="z. B. Preislisten"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
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
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        {error && (
          <p className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            ■ {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm font-medium">
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={busy || !file}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
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
