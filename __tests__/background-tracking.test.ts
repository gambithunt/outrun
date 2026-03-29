import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BACKGROUND_TRACKING_TASK_NAME,
  createBackgroundTrackingStorage,
  registerBackgroundTrackingTask,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '@/lib/backgroundTracking';

describe('backgroundTracking', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('persists tracking context and starts background updates when permission is granted', async () => {
    const storage = createBackgroundTrackingStorage(AsyncStorage);
    const locationModule = {
      Accuracy: {
        High: 'high',
        Balanced: 'balanced',
      },
      requestForegroundPermissionsAsync: jest.fn(async () => ({
        status: 'granted',
        granted: true,
      })),
      requestBackgroundPermissionsAsync: jest.fn(async () => ({
        status: 'granted',
        granted: true,
      })),
      hasStartedLocationUpdatesAsync: jest.fn(async () => false),
      startLocationUpdatesAsync: jest.fn(async () => undefined),
      stopLocationUpdatesAsync: jest.fn(async () => undefined),
    };

    const result = await startBackgroundTracking(storage, locationModule, {
      runId: 'run_1',
      driverId: 'driver_1',
    });

    expect(result).toEqual({
      enabled: true,
      reason: 'granted',
    });
    expect(locationModule.startLocationUpdatesAsync).toHaveBeenCalledWith(
      BACKGROUND_TRACKING_TASK_NAME,
      expect.objectContaining({
        accuracy: 'balanced',
        timeInterval: 5000,
        foregroundService: expect.objectContaining({
          notificationTitle: 'ClubRun is tracking your drive',
        }),
      })
    );
    await expect(storage.load()).resolves.toEqual({
      runId: 'run_1',
      driverId: 'driver_1',
    });
  });

  it('falls back cleanly when background permission is denied', async () => {
    const storage = createBackgroundTrackingStorage(AsyncStorage);
    const locationModule = {
      Accuracy: {
        High: 'high',
        Balanced: 'balanced',
      },
      requestForegroundPermissionsAsync: jest.fn(async () => ({
        status: 'granted',
        granted: true,
      })),
      requestBackgroundPermissionsAsync: jest.fn(async () => ({
        status: 'denied',
        granted: false,
      })),
      hasStartedLocationUpdatesAsync: jest.fn(async () => false),
      startLocationUpdatesAsync: jest.fn(async () => undefined),
      stopLocationUpdatesAsync: jest.fn(async () => undefined),
    };

    const result = await startBackgroundTracking(storage, locationModule, {
      runId: 'run_2',
      driverId: 'driver_2',
    });

    expect(result).toEqual({
      enabled: false,
      reason: 'permission_denied',
    });
    expect(locationModule.startLocationUpdatesAsync).not.toHaveBeenCalled();
    await expect(storage.load()).resolves.toBeNull();
  });

  it('writes background task updates using the persisted run session', async () => {
    const storage = createBackgroundTrackingStorage(AsyncStorage);
    await storage.save({
      runId: 'run_3',
      driverId: 'driver_3',
    });

    const defineTask = jest.fn();
    const writeDriverLocation = jest.fn(async () => undefined);
    const appendTrackPoint = jest.fn(async () => undefined);
    const ensureAuthenticatedUser = jest.fn(async () => ({
      uid: 'driver_3',
    }));
    registerBackgroundTrackingTask({
      client: {
        writeDriverLocation,
        appendTrackPoint,
      },
      ensureAuthenticatedUser,
      storage,
      taskManagerModule: {
        defineTask,
        isTaskDefined: jest.fn(() => false),
      },
    });

    const taskHandler = defineTask.mock.calls[0]?.[1] as ((payload: unknown) => Promise<void>) | undefined;

    expect(taskHandler).toBeDefined();

    await taskHandler?.({
      data: {
        locations: [
          {
            coords: {
              latitude: -26.2041,
              longitude: 28.0473,
              speed: 10,
              heading: 45,
              accuracy: 5,
            },
            timestamp: 1200,
          },
        ],
      },
    });

    expect(defineTask).toHaveBeenCalledWith(BACKGROUND_TRACKING_TASK_NAME, expect.any(Function));
    expect(ensureAuthenticatedUser).toHaveBeenCalledTimes(1);
    expect(writeDriverLocation).toHaveBeenCalledWith(
      'run_3',
      'driver_3',
      expect.objectContaining({
        lat: -26.2041,
        lng: 28.0473,
        speed: 10,
      })
    );

    // appendTrackPoint must be called with the same location for every update.
    expect(appendTrackPoint).toHaveBeenCalledWith(
      'run_3',
      'driver_3',
      expect.objectContaining({
        lat: -26.2041,
        lng: 28.0473,
        speed: 10,
      })
    );
  });

  it('skips background writes when Firebase auth is unavailable in the task runtime', async () => {
    const storage = createBackgroundTrackingStorage(AsyncStorage);
    await storage.save({
      runId: 'run_5',
      driverId: 'driver_5',
    });

    const defineTask = jest.fn();
    const writeDriverLocation = jest.fn(async () => undefined);
    const appendTrackPoint = jest.fn(async () => undefined);
    const ensureAuthenticatedUser = jest.fn(async () => null);

    registerBackgroundTrackingTask({
      client: {
        writeDriverLocation,
        appendTrackPoint,
      },
      ensureAuthenticatedUser,
      storage,
      taskManagerModule: {
        defineTask,
        isTaskDefined: jest.fn(() => false),
      },
    });

    const taskHandler = defineTask.mock.calls[0]?.[1] as ((payload: unknown) => Promise<void>) | undefined;

    await taskHandler?.({
      data: {
        locations: [
          {
            coords: {
              latitude: -26.2041,
              longitude: 28.0473,
            },
            timestamp: 2200,
          },
        ],
      },
    });

    expect(ensureAuthenticatedUser).toHaveBeenCalledTimes(1);
    expect(writeDriverLocation).not.toHaveBeenCalled();
    expect(appendTrackPoint).not.toHaveBeenCalled();
  });

  it('does not redefine the task when it already exists', () => {
    const defineTask = jest.fn();
    registerBackgroundTrackingTask({
      client: {
        writeDriverLocation: jest.fn(async () => undefined),
        appendTrackPoint: jest.fn(async () => undefined),
      },
      storage: createBackgroundTrackingStorage(AsyncStorage),
      taskManagerModule: {
        defineTask,
        isTaskDefined: jest.fn(() => true),
      },
    });

    expect(defineTask).not.toHaveBeenCalled();
  });

  it('stops updates and clears persisted session data', async () => {
    const storage = createBackgroundTrackingStorage(AsyncStorage);
    await storage.save({
      runId: 'run_4',
      driverId: 'driver_4',
    });

    const locationModule = {
      hasStartedLocationUpdatesAsync: jest.fn(async () => true),
      stopLocationUpdatesAsync: jest.fn(async () => undefined),
    };

    await stopBackgroundTracking(storage, locationModule);

    expect(locationModule.stopLocationUpdatesAsync).toHaveBeenCalledWith(
      BACKGROUND_TRACKING_TASK_NAME
    );
    await expect(storage.load()).resolves.toBeNull();
  });
});
