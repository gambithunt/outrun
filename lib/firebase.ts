import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';

type EnvMap = Record<string, string | undefined>;
type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};
export type FirebaseRuntimeMode = 'unconfigured' | 'emulator' | 'production';
export type FirebaseRuntimeSummary = {
  configured: boolean;
  mode: FirebaseRuntimeMode;
  projectId: string | null;
  databaseTarget: string;
};

let didConnectEmulator = false;
const runtimeEnv: EnvMap =
  (globalThis as { process?: { env?: EnvMap } }).process?.env ?? {};

export function getFirebaseConfig(env: EnvMap = runtimeEnv): FirebaseConfig {
  return {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    databaseURL: env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? '',
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  };
}

export function hasFirebaseConfig(env: EnvMap = runtimeEnv) {
  return Object.values(getFirebaseConfig(env)).every(Boolean);
}

export function getFirebaseRuntimeSummary(env: EnvMap = runtimeEnv): FirebaseRuntimeSummary {
  const config = getFirebaseConfig(env);
  const configured = Object.values(config).every(Boolean);

  if (!configured) {
    return {
      configured: false,
      mode: 'unconfigured',
      projectId: config.projectId || null,
      databaseTarget: 'Not configured',
    };
  }

  return {
    configured: true,
    mode: env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true' ? 'emulator' : 'production',
    projectId: config.projectId,
    databaseTarget: config.databaseURL,
  };
}

export function getFirebaseApp(env: EnvMap = runtimeEnv): FirebaseApp {
  const config = getFirebaseConfig(env);
  if (!Object.values(config).every(Boolean)) {
    throw new Error('Firebase config is incomplete. Add EXPO_PUBLIC_FIREBASE_* env vars.');
  }

  return getApps().length > 0 ? getApp() : initializeApp(config);
}

export function getFirebaseDatabase(env: EnvMap = runtimeEnv) {
  const app = getFirebaseApp(env);
  const database = getDatabase(app);

  if (env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true' && !didConnectEmulator) {
    const host = env.EXPO_PUBLIC_FIREBASE_DATABASE_EMULATOR_HOST ?? '127.0.0.1';
    const port = Number(env.EXPO_PUBLIC_FIREBASE_DATABASE_EMULATOR_PORT ?? 9000);
    connectDatabaseEmulator(database, host, port);
    didConnectEmulator = true;
  }

  return database;
}
