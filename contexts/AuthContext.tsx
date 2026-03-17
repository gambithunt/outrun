import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { ensureAuthenticatedUserWithFirebase } from '@/lib/auth';
import { hasFirebaseConfig } from '@/lib/firebase';

type AuthStatus = 'loading' | 'ready' | 'error';

type AuthContextValue = {
  status: AuthStatus;
  userId: string | null;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [value, setValue] = useState<AuthContextValue>(() =>
    hasFirebaseConfig()
      ? {
          status: 'loading',
          userId: null,
          error: null,
        }
      : {
          status: 'ready',
          userId: null,
          error: null,
        }
  );

  useEffect(() => {
    if (!hasFirebaseConfig()) {
      return;
    }

    let isMounted = true;

    ensureAuthenticatedUserWithFirebase()
      .then((user) => {
        if (!isMounted) {
          return;
        }

        setValue({
          status: 'ready',
          userId: user?.uid ?? null,
          error: null,
        });
      })
      .catch((nextError) => {
        if (!isMounted) {
          return;
        }

        setValue({
          status: 'error',
          userId: null,
          error: nextError instanceof Error ? nextError.message : 'Unable to authenticate ClubRun.',
        });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const contextValue = useMemo(() => value, [value]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthSession must be used within an AuthProvider.');
  }

  return context;
}
