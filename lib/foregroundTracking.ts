import * as Location from 'expo-location';
import { child, ref, set, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { mapLocationUpdateToDriverLocation, shouldWriteLocation } from '@/lib/locationService';
import { DriverLocation } from '@/types/domain';

type ForegroundTrackingClient = {
  writeDriverLocation: (runId: string, driverId: string, location: DriverLocation) => Promise<void>;
};

type LocationPermissionResult = {
  status: string;
  granted?: boolean;
};

type ForegroundLocationModule = {
  Accuracy: {
    High: unknown;
  };
  requestForegroundPermissionsAsync: () => Promise<LocationPermissionResult>;
  watchPositionAsync: (
    options: {
      accuracy: unknown;
      timeInterval: number;
      distanceInterval: number;
    },
    callback: (location: {
      coords: {
        latitude: number;
        longitude: number;
        heading?: number | null;
        speed?: number | null;
        accuracy?: number | null;
      };
      timestamp?: number | null;
    }) => void
  ) => Promise<{ remove: () => void }>;
};

export function createForegroundTrackingClient(database: Database): ForegroundTrackingClient {
  return {
    writeDriverLocation: async (runId, driverId, location) => {
      await set(child(ref(database), `runs/${runId}/drivers/${driverId}/location`), location);
    },
  };
}

export async function startForegroundTracking(
  client: ForegroundTrackingClient,
  locationModule: ForegroundLocationModule,
  options: {
    runId: string;
    driverId: string;
    minIntervalMs?: number;
    onLocation?: (location: DriverLocation) => void;
  }
) {
  if (!options.runId || !options.driverId) {
    throw new Error('Run id and driver id are required to start foreground tracking.');
  }

  const permission = await locationModule.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted' && !permission.granted) {
    throw new Error('Foreground location permission is required.');
  }

  let previousLocation: DriverLocation | null = null;
  const subscription = await locationModule.watchPositionAsync(
    {
      accuracy: locationModule.Accuracy.High,
      timeInterval: options.minIntervalMs ?? 2000,
      distanceInterval: 0,
    },
    async (update) => {
      const nextLocation = mapLocationUpdateToDriverLocation(update);
      if (!shouldWriteLocation(previousLocation, nextLocation, options.minIntervalMs ?? 2000)) {
        return;
      }

      previousLocation = nextLocation;
      await client.writeDriverLocation(options.runId, options.driverId, nextLocation);
      options.onLocation?.(nextLocation);
    }
  );

  return () => {
    subscription.remove();
  };
}

export async function startForegroundTrackingWithExpo(options: {
  runId: string;
  driverId: string;
  minIntervalMs?: number;
  onLocation?: (location: DriverLocation) => void;
}) {
  const database = getFirebaseDatabase();
  return startForegroundTracking(
    createForegroundTrackingClient(database),
    Location as unknown as ForegroundLocationModule,
    options
  );
}
