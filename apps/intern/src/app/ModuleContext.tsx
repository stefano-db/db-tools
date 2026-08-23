import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { repository, type ModuleInfo } from '../data';

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
  fehler: string | null;
}

const Zusammenhang = createContext<Stand>({ module: null, fehler: null });

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [stand, setStand] = useState<Stand>({ module: null, fehler: null });

  useEffect(() => {
    let laeuft = true;
    repository
      .listModules()
      .then((m) => laeuft && setStand({ module: m, fehler: null }))
      .catch(
        (e) =>
          laeuft &&
          setStand({ module: [], fehler: e instanceof Error ? e.message : String(e) }),
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
