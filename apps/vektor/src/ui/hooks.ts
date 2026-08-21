import { useEffect, useReducer } from 'react';

/** Re-rendert die Komponente, wenn die abonnierte Quelle sich meldet. */
export function useRerenderOn(subscribe: (listener: () => void) => () => void): void {
  const [, force] = useReducer((c: number) => c + 1, 0);
  useEffect(() => subscribe(() => force()), [subscribe]);
}
