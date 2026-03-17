import { child, ref, remove, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';

type DriverManagementClient = {
  removeDriver: (runId: string, driverId: string) => Promise<void>;
};

export function createDriverManagementClient(database: Database): DriverManagementClient {
  return {
    removeDriver: async (runId, driverId) => {
      await remove(child(ref(database), `runs/${runId}/drivers/${driverId}`));
    },
  };
}

export async function removeDriver(
  client: DriverManagementClient,
  runId: string,
  driverId: string
) {
  if (!runId || !driverId) {
    throw new Error('Run id and driver id are required to remove a driver.');
  }

  await client.removeDriver(runId, driverId);
}

export async function removeDriverWithFirebase(runId: string, driverId: string) {
  const database = getFirebaseDatabase();
  return removeDriver(createDriverManagementClient(database), runId, driverId);
}
