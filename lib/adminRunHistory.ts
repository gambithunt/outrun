import AsyncStorage from '@react-native-async-storage/async-storage';

import { RunStatus } from '@/types/domain';

const STORAGE_KEY = 'clubrun.admin-run-history';
const MAX_ENTRIES = 5;

export type AdminRunHistoryEntry = {
  runId: string;
  name: string;
  joinCode: string;
  driverId: string;
  status: RunStatus;
  createdAt: number;
};

type StorageLike = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export async function loadAdminRunHistory(
  storage: StorageLike = AsyncStorage
): Promise<AdminRunHistoryEntry[]> {
  const raw = await storage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as AdminRunHistoryEntry[];
  } catch {
    return [];
  }
}

export async function saveAdminRunToHistory(
  entry: AdminRunHistoryEntry,
  storage: StorageLike = AsyncStorage
) {
  const existing = await loadAdminRunHistory(storage);
  const filtered = existing.filter((e) => e.runId !== entry.runId);
  const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
  await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export async function updateAdminRunStatusInHistory(
  runId: string,
  status: RunStatus,
  storage: StorageLike = AsyncStorage
) {
  const existing = await loadAdminRunHistory(storage);
  const updated = existing.map((e) => (e.runId === runId ? { ...e, status } : e));
  await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
