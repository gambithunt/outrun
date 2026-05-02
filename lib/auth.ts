import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  createUserWithEmailAndPassword,
  connectAuthEmulator,
  EmailAuthProvider,
  getAuth,
  initializeAuth,
  linkWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  type Auth,
} from 'firebase/auth';

import { getFirebaseApp, hasFirebaseConfig } from '@/lib/firebase';

type EnvMap = Record<string, string | undefined>;
type AuthUser = {
  uid: string;
  isAnonymous?: boolean;
  email?: string | null;
};
type AuthLike = {
  currentUser: AuthUser | null;
};
type SignInResult = {
  user: AuthUser | null;
};
type SignInFn = (auth: AuthLike) => Promise<SignInResult>;
type SignOutFn = (auth: AuthLike) => Promise<void>;
type LinkAccountFn = (
  user: AuthUser,
  credentials: { email: string; password: string }
) => Promise<SignInResult>;
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

export async function linkAnonymousAccount(
  auth: AuthLike,
  credentials: {
    email: string;
    password: string;
  },
  linkAccount: LinkAccountFn
) {
  if (!auth.currentUser?.uid || auth.currentUser.isAnonymous === false) {
    throw new Error('An anonymous Firebase session is required before linking an account.');
  }

  const result = await linkAccount(auth.currentUser, credentials);
  return result.user ?? auth.currentUser;
}

export async function signOutToGuestOrSignedOutState(
  auth: AuthLike,
  signOutFn: SignOutFn,
  signIn: SignInFn
) {
  await signOutFn(auth);
  (auth as { currentUser: AuthUser | null }).currentUser = null;
  return ensureAuthenticatedUser(auth, signIn);
}

export async function ensureAuthenticatedUserWithFirebase(env: EnvMap = runtimeEnv) {
  if (!hasFirebaseConfig(env)) {
    return null;
  }

  const auth = getFirebaseAuth(env);
  return ensureAuthenticatedUser(auth as unknown as AuthLike, async (authLike) => {
    const credential = await signInAnonymously(authLike as unknown as Auth);
    return {
      user: credential.user
        ? {
            uid: credential.user.uid,
            isAnonymous: credential.user.isAnonymous,
            email: credential.user.email,
          }
        : null,
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

export async function signUpWithEmailPassword(email: string, password: string, env: EnvMap = runtimeEnv) {
  const auth = getFirebaseAuth(env);
  const currentUser = auth.currentUser;

  if (currentUser?.isAnonymous) {
    return linkAnonymousAccount(
      auth as unknown as AuthLike,
      { email, password },
      async (user, nextCredentials) => {
        const credential = EmailAuthProvider.credential(
          nextCredentials.email,
          nextCredentials.password
        );
        const result = await linkWithCredential(user as never, credential);
        return {
          user: result.user
            ? {
                uid: result.user.uid,
                isAnonymous: result.user.isAnonymous,
                email: result.user.email,
              }
            : null,
        };
      }
    );
  }

  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user
    ? {
        uid: result.user.uid,
        isAnonymous: result.user.isAnonymous,
        email: result.user.email,
      }
    : null;
}

export async function signInWithEmailPassword(email: string, password: string, env: EnvMap = runtimeEnv) {
  const auth = getFirebaseAuth(env);
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user
    ? {
        uid: result.user.uid,
        isAnonymous: result.user.isAnonymous,
        email: result.user.email,
      }
    : null;
}

export async function sendPasswordResetEmailWithFirebase(email: string, env: EnvMap = runtimeEnv) {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    throw new Error('Enter your email to reset your password.');
  }

  const auth = getFirebaseAuth(env);
  await sendPasswordResetEmail(auth, trimmedEmail);
}

export async function linkAnonymousAccountWithFirebase(
  email: string,
  password: string,
  env: EnvMap = runtimeEnv
) {
  const auth = getFirebaseAuth(env);
  return linkAnonymousAccount(
    auth as unknown as AuthLike,
    { email, password },
    async (user, nextCredentials) => {
      const credential = EmailAuthProvider.credential(
        nextCredentials.email,
        nextCredentials.password
      );
      const result = await linkWithCredential(user as never, credential);
      return {
        user: result.user
          ? {
              uid: result.user.uid,
              isAnonymous: result.user.isAnonymous,
              email: result.user.email,
            }
          : null,
      };
    }
  );
}

export async function signOutToGuestOrSignedOutStateWithFirebase(env: EnvMap = runtimeEnv) {
  const auth = getFirebaseAuth(env);
  return signOutToGuestOrSignedOutState(
    auth as unknown as AuthLike,
    async () => {
      await signOut(auth);
    },
    async () => ensureAuthenticatedUserWithFirebase(env).then((user) => ({ user }))
  );
}
