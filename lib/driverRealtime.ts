import { child, onValue, ref, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { DriverRecord } from '@/types/domain';

type RealtimeSnapshot = {
  exists: () => boolean;
  val: () => unknown;
};

export type LiveDriver = {
  id: string;
  name: string;
  location: DriverRecord['location'] | null;
};

export type DriverPresenceStatus = 'active' | 'stale' | 'awaiting_gps';

export function normalizeDriversSnapshot(value: unknown): LiveDriver[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, DriverRecord>).map(([id, record]) => ({
    id,
    name: record.profile?.name ?? 'Unknown driver',
    location: record.location ?? null,
  }));
}

export function getDriverPresenceStatus(driver: LiveDriver, now = Date.now()): DriverPresenceStatus {
  if (!driver.location) {
    return 'awaiting_gps';
  }

  return now - driver.location.timestamp > 60_000 ? 'stale' : 'active';
}

export function createRealtimeDriversClient(database: Database) {
  return {
    subscribeToDrivers: (
      runId: string,
      onData: (drivers: LiveDriver[]) => void,
      onError?: (error: Error) => void
    ) => {
      if (!runId) {
        throw new Error('Run id is required for realtime driver subscription.');
      }

      return onValue(
        child(ref(database), `runs/${runId}/drivers`),
        (snapshot: RealtimeSnapshot) => {
          onData(snapshot.exists() ? normalizeDriversSnapshot(snapshot.val()) : []);
        },
        (error) => {
          onError?.(error as Error);
        }
      );
    },
  };
}

export function subscribeToDriversWithFirebase(
  runId: string,
  onData: (drivers: LiveDriver[]) => void,
  onError?: (error: Error) => void
) {
  const database = getFirebaseDatabase();
  return createRealtimeDriversClient(database).subscribeToDrivers(runId, onData, onError);
}
