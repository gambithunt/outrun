import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { ensureAuthenticatedUserWithFirebase } from '@/lib/auth';
import { hasFirebaseConfig } from '@/lib/firebase';

type AuthStatus = 'loading' | 'ready' | 'error';

type AuthState = {
  status: AuthStatus;
  userId: string | null;
  isAnonymous: boolean;
  email: string | null;
  error: string | null;
};

type AuthContextValue = AuthState & {
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [value, setValue] = useState<AuthState>(() =>
    hasFirebaseConfig()
      ? {
          status: 'loading',
          userId: null,
          isAnonymous: true,
          email: null,
          error: null,
        }
      : {
          status: 'ready',
          userId: null,
          isAnonymous: true,
          email: null,
          error: null,
        }
  );

  async function refreshSession() {
    if (!hasFirebaseConfig()) {
      setValue({
        status: 'ready',
        userId: null,
        isAnonymous: true,
        email: null,
        error: null,
      });
      return;
    }

    setValue((current) => ({
      ...current,
      status: 'loading',
      error: null,
    }));

    await ensureAuthenticatedUserWithFirebase()
      .then((user) => {
        setValue({
          status: 'ready',
          userId: user?.uid ?? null,
          isAnonymous: user?.isAnonymous ?? true,
          email: user?.email ?? null,
          error: null,
        });
      })
      .catch((nextError) => {
        setValue({
          status: 'error',
          userId: null,
          isAnonymous: true,
          email: null,
          error: nextError instanceof Error ? nextError.message : 'Unable to authenticate ClubRun.',
        });
      });
  }

  useEffect(() => {
    let isMounted = true;

    void ensureAuthenticatedUserWithFirebase()
      .then((user) => {
        if (!isMounted) {
          return;
        }

        setValue({
          status: 'ready',
          userId: user?.uid ?? null,
          isAnonymous: user?.isAnonymous ?? true,
          email: user?.email ?? null,
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
          isAnonymous: true,
          email: null,
          error: nextError instanceof Error ? nextError.message : 'Unable to authenticate ClubRun.',
        });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      ...value,
      refreshSession,
    }),
    [value]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthSession must be used within an AuthProvider.');
  }

  return context;
}
