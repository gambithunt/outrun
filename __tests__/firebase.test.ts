jest.mock('firebase/app', () => ({
  getApp: jest.fn(),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: 'mock-app' })),
}));

jest.mock('firebase/database', () => ({
  connectDatabaseEmulator: jest.fn(),
  getDatabase: jest.fn(() => ({ name: 'mock-db' })),
}));

import {
  getFirebaseConfig,
  getFirebaseRuntimeSummary,
  hasFirebaseConfig,
} from '@/lib/firebase';

describe('firebase config helpers', () => {
  it('detects when config is incomplete', () => {
    expect(hasFirebaseConfig({})).toBe(false);
  });

  it('returns config values from Expo public env vars', () => {
    const config = getFirebaseConfig({
      EXPO_PUBLIC_FIREBASE_API_KEY: 'key',
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'auth',
      EXPO_PUBLIC_FIREBASE_DATABASE_URL: 'db',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'project',
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'bucket',
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'sender',
      EXPO_PUBLIC_FIREBASE_APP_ID: 'app',
    });

    expect(config.projectId).toBe('project');
    expect(config.databaseURL).toBe('db');
  });

  it('reports emulator mode when firebase is configured for local emulators', () => {
    const summary = getFirebaseRuntimeSummary({
      EXPO_PUBLIC_FIREBASE_API_KEY: 'key',
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'auth',
      EXPO_PUBLIC_FIREBASE_DATABASE_URL: 'http://127.0.0.1:9000?ns=demo-clubrun',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-clubrun',
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'bucket',
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'sender',
      EXPO_PUBLIC_FIREBASE_APP_ID: 'app',
      EXPO_PUBLIC_USE_FIREBASE_EMULATOR: 'true',
    });

    expect(summary.mode).toBe('emulator');
    expect(summary.projectId).toBe('demo-clubrun');
    expect(summary.databaseTarget).toContain('127.0.0.1');
  });

  it('reports unconfigured mode when firebase env vars are missing', () => {
    const summary = getFirebaseRuntimeSummary({});

    expect(summary.mode).toBe('unconfigured');
    expect(summary.projectId).toBe(null);
    expect(summary.databaseTarget).toBe('Not configured');
  });
});
