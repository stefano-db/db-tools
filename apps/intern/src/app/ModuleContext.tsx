import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { repository, type Department, type ModuleInfo } from '../data';

/**
 * Die freigeschalteten Werkzeuge, einmal geladen.
 *
 * Vorher holte sie jede Seite für sich. Das kostete bei jedem Wechsel eine
 * Abfrage und — schlimmer — konnte auseinanderlaufen: Die Seitenleiste zeigte
 * etwas anderes als die Startseite, weil die eine schon geladen hatte und die
 * andere noch nicht. Jetzt gibt es eine Antwort für die ganze Sitzung.
 */
interface Stand {
  /** null heißt: wird noch geladen. */
  module: ModuleInfo[] | null;
  /** Welches Werkzeug welchem Bereich gehört — nur für die Anzeige. */
  zuordnung: Record<string, Department[]>;
  fehler: string | null;
}

const LEER: Stand = { module: null, zuordnung: {}, fehler: null };

const Zusammenhang = createContext<Stand>(LEER);

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [stand, setStand] = useState<Stand>(LEER);

  useEffect(() => {
    let laeuft = true;
    // Beides zusammen: die Zuordnung ohne die Werkzeuge waere nutzlos, und die
    // Werkzeuge ohne sie erst farbig, wenn die zweite Antwort eintrifft — ein
    // Aufblitzen, das nach Fehler aussieht.
    Promise.all([repository.listModules(), repository.modulZuordnung().catch(() => ({}))])
      .then(([m, z]) => laeuft && setStand({ module: m, zuordnung: z, fehler: null }))
      .catch(
        (e) =>
          laeuft &&
          setStand({
            module: [],
            zuordnung: {},
            fehler: e instanceof Error ? e.message : String(e),
          }),
      );
    return () => {
      laeuft = false;
    };
  }, []);

  return <Zusammenhang.Provider value={stand}>{children}</Zusammenhang.Provider>;
}

export function useModule(): Stand {
  return useContext(Zusammenhang);
}
