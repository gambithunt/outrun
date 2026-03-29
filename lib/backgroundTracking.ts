import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { child, push, ref, set, type Database } from 'firebase/database';

import { ensureAuthenticatedUserWithFirebase } from '@/lib/auth';
import { getFirebaseDatabase, hasFirebaseConfig } from '@/lib/firebase';
import { mapLocationUpdateToDriverLocation } from '@/lib/locationService';
import { DriverLocation } from '@/types/domain';

export const BACKGROUND_TRACKING_TASK_NAME = 'clubrun-background-location';
const TRACKING_STORAGE_KEY = 'clubrun:background-tracking-session';

type TrackingSession = {
  runId: string;
  driverId: string;
};

type PermissionResult = {
  status: string;
  granted?: boolean;
};

type BackgroundLocationModule = {
  Accuracy: {
    High?: unknown;
    Balanced?: unknown;
  };
  requestForegroundPermissionsAsync: () => Promise<PermissionResult>;
  requestBackgroundPermissionsAsync: () => Promise<PermissionResult>;
  hasStartedLocationUpdatesAsync: (taskName: string) => Promise<boolean>;
  startLocationUpdatesAsync: (
    taskName: string,
    options: {
      accuracy: unknown;
      timeInterval: number;
      distanceInterval: number;
      pausesUpdatesAutomatically: boolean;
      showsBackgroundLocationIndicator: boolean;
      foregroundService: {
        notificationTitle: string;
        notificationBody: string;
      };
    }
  ) => Promise<void>;
  stopLocationUpdatesAsync: (taskName: string) => Promise<void>;
};

type BackgroundTaskPayload = {
  data?: {
    locations?: Array<{
      coords: {
        latitude: number;
        longitude: number;
        heading?: number | null;
        speed?: number | null;
        accuracy?: number | null;
      };
      timestamp?: number | null;
    }>;
  };
  error?: Error | null;
};

type BackgroundTaskManagerModule = {
  defineTask: (
    taskName: string,
    task: (payload: BackgroundTaskPayload) => Promise<void> | void
  ) => void;
  isTaskDefined?: (taskName: string) => boolean;
};

type BackgroundTrackingStorage = {
  save: (session: TrackingSession) => Promise<void>;
  load: () => Promise<TrackingSession | null>;
  clear: () => Promise<void>;
};

type BackgroundTrackingClient = {
  writeDriverLocation: (runId: string, driverId: string, location: DriverLocation) => Promise<void>;
  /** Appends the location as a new immutable track point (append-only, never overwrites). */
  appendTrackPoint: (runId: string, driverId: string, location: DriverLocation) => Promise<void>;
};

type BackgroundTrackingAuthUser = {
  uid: string;
};

type BackgroundTrackingStartResult = {
  enabled: boolean;
  reason: 'granted' | 'permission_denied';
};

export function createBackgroundTrackingStorage(
  storage: Pick<typeof AsyncStorage, 'setItem' | 'getItem' | 'removeItem'>
): BackgroundTrackingStorage {
  return {
    save: async (session) => {
      await storage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(session));
    },
    load: async () => {
      const stored = await storage.getItem(TRACKING_STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored) as Partial<TrackingSession>;
      if (!parsed.runId || !parsed.driverId) {
        return null;
      }

      return {
        runId: parsed.runId,
        driverId: parsed.driverId,
      };
    },
    clear: async () => {
      await storage.removeItem(TRACKING_STORAGE_KEY);
    },
  };
}

export function createBackgroundTrackingClient(database: Database): BackgroundTrackingClient {
  return {
    writeDriverLocation: async (runId, driverId, location) => {
      // Overwrites the single live-position node used by the real-time map.
      await set(child(ref(database), `runs/${runId}/drivers/${driverId}/location`), location);
    },
    appendTrackPoint: async (runId, driverId, location) => {
      // push() generates a unique key — points accumulate and are never overwritten.
      // Firebase rules reject this write unless the run status is 'active'.
      await push(child(ref(database), `tracks/${runId}/${driverId}`), location);
    },
  };
}

export function registerBackgroundTrackingTask(options: {
  client: BackgroundTrackingClient;
  ensureAuthenticatedUser?: () => Promise<BackgroundTrackingAuthUser | null>;
  storage: BackgroundTrackingStorage;
  taskManagerModule: BackgroundTaskManagerModule;
}) {
  if (options.taskManagerModule.isTaskDefined?.(BACKGROUND_TRACKING_TASK_NAME)) {
    return;
  }

  options.taskManagerModule.defineTask(BACKGROUND_TRACKING_TASK_NAME, async ({ data, error }) => {
    if (error) {
      return;
    }

    const session = await options.storage.load();
    if (!session) {
      return;
    }

    const authenticatedUser = await options.ensureAuthenticatedUser?.();
    if (!authenticatedUser?.uid || authenticatedUser.uid !== session.driverId) {
      return;
    }

    for (const update of data?.locations ?? []) {
      const location = mapLocationUpdateToDriverLocation(update);
      await options.client.writeDriverLocation(session.runId, session.driverId, location);
      // Fire-and-forget — a rejection here (e.g. run not yet active) is non-fatal.
      options.client.appendTrackPoint(session.runId, session.driverId, location).catch(() => undefined);
    }
  });
}

export async function startBackgroundTracking(
  storage: BackgroundTrackingStorage,
  locationModule: BackgroundLocationModule,
  options: {
    runId: string;
    driverId: string;
    minIntervalMs?: number;
    distanceIntervalMetres?: number;
  }
): Promise<BackgroundTrackingStartResult> {
  if (!options.runId || !options.driverId) {
    throw new Error('Run id and driver id are required to start background tracking.');
  }

  const foregroundPermission = await locationModule.requestForegroundPermissionsAsync();
  if (foregroundPermission.status !== 'granted' && !foregroundPermission.granted) {
    throw new Error('Foreground location permission is required before enabling background tracking.');
  }

  const backgroundPermission = await locationModule.requestBackgroundPermissionsAsync();
  if (backgroundPermission.status !== 'granted' && !backgroundPermission.granted) {
    await storage.clear();
    return {
      enabled: false,
      reason: 'permission_denied',
    };
  }

  await storage.save({
    runId: options.runId,
    driverId: options.driverId,
  });

  const alreadyStarted = await locationModule.hasStartedLocationUpdatesAsync(
    BACKGROUND_TRACKING_TASK_NAME
  );
  if (!alreadyStarted) {
    await locationModule.startLocationUpdatesAsync(BACKGROUND_TRACKING_TASK_NAME, {
      accuracy: locationModule.Accuracy.Balanced ?? locationModule.Accuracy.High ?? 'high',
      timeInterval: options.minIntervalMs ?? 5000,
      distanceInterval: options.distanceIntervalMetres ?? 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'ClubRun is tracking your drive',
        notificationBody: 'Your club can keep seeing your live convoy position.',
      },
    });
  }

  return {
    enabled: true,
    reason: 'granted',
  };
}

export async function stopBackgroundTracking(
  storage: BackgroundTrackingStorage,
  locationModule: Pick<
    BackgroundLocationModule,
    'hasStartedLocationUpdatesAsync' | 'stopLocationUpdatesAsync'
  >
) {
  const isActive = await locationModule.hasStartedLocationUpdatesAsync(BACKGROUND_TRACKING_TASK_NAME);
  if (isActive) {
    await locationModule.stopLocationUpdatesAsync(BACKGROUND_TRACKING_TASK_NAME);
  }

  await storage.clear();
}

const expoBackgroundTrackingStorage = createBackgroundTrackingStorage(AsyncStorage);

export function ensureBackgroundTrackingTaskRegisteredWithExpo() {
  if (!hasFirebaseConfig()) {
    return;
  }

  const database = getFirebaseDatabase();
  registerBackgroundTrackingTask({
    client: createBackgroundTrackingClient(database),
    ensureAuthenticatedUser: ensureAuthenticatedUserWithFirebase,
    storage: expoBackgroundTrackingStorage,
    taskManagerModule: TaskManager as BackgroundTaskManagerModule,
  });
}

export function startBackgroundTrackingWithExpo(options: {
  runId: string;
  driverId: string;
  minIntervalMs?: number;
  distanceIntervalMetres?: number;
}) {
  return startBackgroundTracking(
    expoBackgroundTrackingStorage,
    Location as unknown as BackgroundLocationModule,
    options
  );
}

export function stopBackgroundTrackingWithExpo() {
  return stopBackgroundTracking(
    expoBackgroundTrackingStorage,
    Location as unknown as Pick<
      BackgroundLocationModule,
      'hasStartedLocationUpdatesAsync' | 'stopLocationUpdatesAsync'
    >
  );
}
