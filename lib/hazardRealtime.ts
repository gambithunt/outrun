import { child, onValue, ref, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { Hazard, HazardType } from '@/types/domain';

export type LiveHazard = Hazard & {
  id: string;
};

type RealtimeSnapshot = {
  exists: () => boolean;
  val: () => unknown;
};

export function normalizeHazardsSnapshot(value: unknown): LiveHazard[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, Hazard>).map(([id, hazard]) => ({
    id,
    ...hazard,
  }));
}

export function createRealtimeHazardsClient(database: Database) {
  return {
    subscribeToHazards: (
      runId: string,
      onData: (hazards: LiveHazard[]) => void,
      onError?: (error: Error) => void
    ) => {
      if (!runId) {
        throw new Error('Run id is required for realtime hazard subscription.');
      }

      return onValue(
        child(ref(database), `runs/${runId}/hazards`),
        (snapshot: RealtimeSnapshot) => {
          onData(snapshot.exists() ? normalizeHazardsSnapshot(snapshot.val()) : []);
        },
        (error) => {
          onError?.(error as Error);
        }
      );
    },
  };
}

export function subscribeToHazardsWithFirebase(
  runId: string,
  onData: (hazards: LiveHazard[]) => void,
  onError?: (error: Error) => void
) {
  const database = getFirebaseDatabase();
  return createRealtimeHazardsClient(database).subscribeToHazards(runId, onData, onError);
}

export function formatHazardLabel(type: HazardType) {
  switch (type) {
    case 'broken_down_car':
      return 'Broken Down Car';
    case 'roadworks':
      return 'Roadworks';
    case 'pothole':
      return 'Pothole';
    case 'police':
      return 'Police';
    case 'debris':
      return 'Debris';
    case 'animal':
      return 'Animal';
  }
}
