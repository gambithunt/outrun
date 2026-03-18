import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  signInAnonymously,
  type Auth,
} from 'firebase/auth';

import { getFirebaseApp, hasFirebaseConfig } from '@/lib/firebase';

type EnvMap = Record<string, string | undefined>;
type AuthUser = {
  uid: string;
};
type AuthLike = {
  currentUser: AuthUser | null;
};
type SignInResult = {
  user: AuthUser | null;
};
type SignInFn = (auth: AuthLike) => Promise<SignInResult>;
type ReactNativeAuthModule = {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => unknown;
};

let didConnectAuthEmulator = false;
let pendingAuthentication: Promise<AuthUser | null> | null = null;
let cachedAuth: Auth | null = null;
const runtimeEnv: EnvMap =
  (globalThis as { process?: { env?: EnvMap } }).process?.env ?? {};

function getReactNativePersistenceCompat() {
  const authModule = require('@firebase/auth') as ReactNativeAuthModule;
  return authModule.getReactNativePersistence?.(AsyncStorage);
}

export function getFirebaseAuth(env: EnvMap = runtimeEnv) {
  const app = getFirebaseApp(env);
  if (!cachedAuth) {
    if (Platform.OS === 'web') {
      cachedAuth = getAuth(app);
    } else {
      try {
        const persistence = getReactNativePersistenceCompat();
        cachedAuth = initializeAuth(
          app,
          persistence
            ? {
                persistence: persistence as never,
              }
            : undefined
        );
      } catch {
        cachedAuth = getAuth(app);
      }
    }
  }

  const auth = cachedAuth;

  if (env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true' && !didConnectAuthEmulator) {
    const host = env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1';
    const port = Number(env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT ?? 9099);
    connectAuthEmulator(auth, `http://${host}:${port}`, {
      disableWarnings: true,
    });
    didConnectAuthEmulator = true;
  }

  return auth;
}

export async function ensureAuthenticatedUser(
  auth: AuthLike,
  signIn: SignInFn
): Promise<AuthUser | null> {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (!pendingAuthentication) {
    pendingAuthentication = signIn(auth)
      .then((credential) => credential.user ?? auth.currentUser)
      .finally(() => {
        pendingAuthentication = null;
      });
  }

  return pendingAuthentication;
}

export async function requireAuthenticatedUserId(auth: AuthLike, signIn: SignInFn) {
  const user = await ensureAuthenticatedUser(auth, signIn);

  if (!user?.uid) {
    throw new Error('Firebase authentication is required.');
  }

  return user.uid;
}

export async function ensureAuthenticatedUserWithFirebase(env: EnvMap = runtimeEnv) {
  if (!hasFirebaseConfig(env)) {
    return null;
  }

  const auth = getFirebaseAuth(env);
  return ensureAuthenticatedUser(auth as unknown as AuthLike, async (authLike) => {
    const credential = await signInAnonymously(authLike as unknown as Auth);
    return {
      user: credential.user ? { uid: credential.user.uid } : null,
    };
  });
}

export async function requireAuthenticatedUserIdWithFirebase(env: EnvMap = runtimeEnv) {
  const user = await ensureAuthenticatedUserWithFirebase(env);

  if (!user?.uid) {
    throw new Error('Firebase auth is unavailable. Add EXPO_PUBLIC_FIREBASE_* env vars.');
  }

  return user.uid;
}
