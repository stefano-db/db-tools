import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { repository } from '../../data';
import { Logo, Mascot } from '../../ui/Mascot';

/**
 * Anmeldung an der Plattform.
 *
 * Die erste Seite, die jemand vom Programm sieht — und für viele im Center die
 * einzige, die sie täglich bewusst bedienen. Sie soll deshalb aussehen wie das
 * Haus und nicht wie ein Formular: dunkler Grund, Gold, das Maskottchen.
 *
 * Angemeldet wird mit Benutzernamen oder E-Mail. Beides steht bewusst in einem
 * Feld: wer sich mit „marko" anmeldet, soll nicht erst entscheiden müssen, in
 * welches von zwei Feldern das gehört.
 */
export function LoginPage() {
  const { signIn } = useAuth();
  const [kennung, setKennung] = useState('');
  const [passwort, setPasswort] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [linkGeschickt, setLinkGeschickt] = useState(false);

  // Ein Zurücksetz-Link kann nur an eine echte Adresse gehen. Wer sich mit
  // Benutzernamen anmeldet, wendet sich an die Leitung — das steht dann da.
  const istAdresse = kennung.includes('@');

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    try {
      await signIn(kennung.trim(), passwort);
      // Wer von einer eigenständigen Seite hierher geschickt wurde — etwa vom
      // Dienstplan —, soll dorthin zurück und nicht auf der Übersicht landen.
      const ziel = zielNachAnmeldung();
      if (ziel) window.location.replace(ziel);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="db-hero grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Logo className="h-12" />
          <Mascot name="winken" size={92} />
          <p className="text-sm text-db-text2">
            Interne Plattform · Anmeldung für Mitarbeiter
          </p>
        </div>

        <form onSubmit={absenden} className="db-card p-6" autoComplete="on">
          <label className="block text-sm font-medium">
            Benutzername oder E-Mail
            <input
              type="text"
              value={kennung}
              onChange={(e) => {
                setKennung(e.target.value);
                setLinkGeschickt(false);
              }}
              autoComplete="username"
              // Auf dem Tablet in der Werkstatt soll nichts großgeschrieben
              // oder verbessert werden — „Marko" ist nicht „marko".
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
              className="db-input mt-1.5"
            />
          </label>

          <label className="mt-4 block text-sm font-medium">
            Passwort
            <input
              type="password"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              autoComplete="current-password"
              required
              className="db-input mt-1.5"
            />
          </label>

          {fehler && (
            <p className="mt-4 rounded-lg border border-db-bad/50 bg-db-bad/10 px-3 py-2 text-sm text-db-bad">
              ■ {fehler}
            </p>
          )}

          <button
            type="submit"
            disabled={laeuft}
            className="db-btn-gold mt-6 w-full py-3 text-base disabled:opacity-40"
          >
            {laeuft ? 'Anmeldung läuft…' : 'Anmelden'}
          </button>

          {linkGeschickt ? (
            <p className="mt-4 rounded-lg border border-db-ok/40 bg-db-ok/10 px-3 py-2 text-sm text-db-ok">
              ● Wenn zu dieser Adresse ein Konto besteht, ist eine E-Mail unterwegs.
            </p>
          ) : istAdresse ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await repository.sendPasswordReset(kennung.trim());
                  setLinkGeschickt(true);
                  setFehler(null);
                } catch (err) {
                  setFehler(err instanceof Error ? err.message : String(err));
                }
              }}
              className="mt-4 w-full text-center text-xs font-medium text-db-text3 hover:text-db-gold"
            >
              Passwort vergessen?
            </button>
          ) : (
            <p className="mt-4 text-center text-xs text-db-text3">
              Passwort vergessen? Deine Bereichsleitung kann dir ein neues geben.
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-xs text-db-text3">Dream Bowl · nur für Mitarbeiter</p>
      </div>
    </div>
  );
}

/**
 * Wohin nach der Anmeldung?
 *
 * Die eigenständigen Seiten schicken abgemeldete Besucher mit `?weiter=` hierher.
 * Übernommen wird ausschließlich ein Pfad im eigenen Haus: alles mit Doppel-
 * Schrägstrich oder Doppelpunkt zeigt nach draußen und wäre eine offene
 * Weiterleitung — damit liesse sich ein Anmeldelink bauen, der auf einer
 * fremden Seite endet.
 */
function zielNachAnmeldung(): string | null {
  const ziel = new URLSearchParams(window.location.search).get('weiter');
  if (!ziel) return null;
  if (!ziel.startsWith('/') || ziel.startsWith('//') || ziel.includes(':')) return null;
  return ziel;
}

/** Angemeldet, aber ohne Recht auf dieses Modul. */
export function NoAccessPage({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  return (
    <div className="db-hero grid min-h-screen place-items-center px-4">
      <div className="db-card w-full max-w-md p-8 text-center">
        <Mascot name="profil" size={72} className="mx-auto mb-4" />
        <h1 className="text-lg font-bold">Kein Zugriff auf dieses Werkzeug</h1>
        <p className="mt-2 text-sm text-db-text2">
          Du bist als <strong className="text-db-text">{name}</strong> angemeldet, hast für diesen
          Bereich aber keine Freigabe. Deine Bereichsleitung oder ein Administrator kann sie
          erteilen.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a href="/" className="db-btn-ghost px-4 py-2 text-sm">
            Zur Übersicht
          </a>
          <button onClick={onSignOut} className="db-btn-ghost px-4 py-2 text-sm">
            Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}
