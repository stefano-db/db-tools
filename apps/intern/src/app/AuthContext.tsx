import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { repository, type SessionInfo } from '../data';

interface AuthContextValue {
  session: SessionInfo | null;
  loading: boolean;
  requiresLogin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Sitzung neu einlesen, z. B. nach Änderung des Anzeigenamens. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSession(await repository.getSession());
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.body.classList.add('db');
    void refresh();
    // Reagiert auch auf abgelaufene Sitzungen — der Mechaniker soll dann eine
    // Anmeldemaske sehen und keine leeren Listen.
    return repository.onAuthChange(() => void refresh());
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await repository.signIn(email, password);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await repository.signOut();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, loading, requiresLogin: repository.requiresLogin, signIn, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.');
  return ctx;
}
