import { child, onValue, ref, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { Run } from '@/types/domain';

type RealtimeSnapshot = {
  exists: () => boolean;
  val: () => unknown;
};

type RealtimeRunClient = {
  subscribeToRun: (
    runId: string,
    onData: (run: Run | null) => void,
    onError?: (error: Error) => void
  ) => () => void;
};

export function normalizeRunSnapshot(value: unknown): Run | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as Run;
}

export function createRealtimeRunClient(database: Database): RealtimeRunClient {
  return {
    subscribeToRun: (runId, onData, onError) => {
      if (!runId) {
        throw new Error('Run id is required for realtime subscription.');
      }

      return onValue(
        child(ref(database), `runs/${runId}`),
        (snapshot: RealtimeSnapshot) => {
          onData(snapshot.exists() ? normalizeRunSnapshot(snapshot.val()) : null);
        },
        (error) => {
          onError?.(error as Error);
        }
      );
    },
  };
}

export function subscribeToRunWithFirebase(
  runId: string,
  onData: (run: Run | null) => void,
  onError?: (error: Error) => void
) {
  const database = getFirebaseDatabase();
  return createRealtimeRunClient(database).subscribeToRun(runId, onData, onError);
}
