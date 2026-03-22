import { child, get, ref, set, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { RecentCrewContact, Run } from '@/types/domain';

type RecentCrewClient = {
  listContacts: (userId: string) => Promise<RecentCrewContact[]>;
  writeContact: (userId: string, contactId: string, contact: RecentCrewContact) => Promise<void>;
};

export function createRecentCrewClient(database: Database): RecentCrewClient {
  return {
    listContacts: async (userId) => {
      const snapshot = await get(child(ref(database), `contacts/${userId}`));
      if (!snapshot.exists()) {
        return [];
      }

      return Object.values(snapshot.val() as Record<string, RecentCrewContact>).sort(
        (left, right) => right.lastSeenAt - left.lastSeenAt
      );
    },
    writeContact: async (userId, contactId, contact) => {
      await set(child(ref(database), `contacts/${userId}/${contactId}`), contact);
    },
  };
}

export function deriveRecentCrewContacts(run: Run, currentUserId: string, now = Date.now()) {
  return Object.entries(run.drivers ?? {})
    .filter(([driverId, driver]) => driverId !== currentUserId && driver.profile?.name)
    .map(([driverId, driver]) => ({
      userId: driverId,
      displayName: driver.profile.name,
      ...(run.createdBy && run.createdBy !== driverId ? { lastRunName: run.name } : { lastRunName: run.name }),
      ...(driver.profile.name ? {} : {}),
      lastSeenAt: now,
    }));
}

export async function syncRecentCrewContactsForRun(
  client: RecentCrewClient,
  currentUserId: string,
  run: Run,
  now = Date.now()
) {
  const contacts = deriveRecentCrewContacts(run, currentUserId, now);
  await Promise.all(
    contacts.map((contact) => client.writeContact(currentUserId, contact.userId, contact))
  );
  return contacts;
}

export async function listRecentCrewWithFirebase(userId: string) {
  const database = getFirebaseDatabase();
  return createRecentCrewClient(database).listContacts(userId);
}

export async function syncRecentCrewContactsForRunWithFirebase(currentUserId: string, run: Run) {
  const database = getFirebaseDatabase();
  return syncRecentCrewContactsForRun(createRecentCrewClient(database), currentUserId, run);
}
