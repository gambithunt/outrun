import AsyncStorage from '@react-native-async-storage/async-storage';

import { RouteStopDraft } from '@/types/domain';

export type RoutePlannerSheetState = 'main' | 'minimized' | 'reorder' | 'hidden';

export type RoutePlannerDraft = {
  stops: RouteStopDraft[];
  selectedStopId: string;
  sheetState: RoutePlannerSheetState;
  isRouteSaved: boolean;
};

type StorageLike = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

const ROUTE_PLANNER_STORAGE_PREFIX = 'clubrun.route-planner.draft';

export function getRoutePlannerDraftStorageKey(runId: string) {
  return `${ROUTE_PLANNER_STORAGE_PREFIX}.${runId}`;
}

export async function loadRoutePlannerDraft(
  runId: string,
  storage: StorageLike = AsyncStorage
): Promise<RoutePlannerDraft | null> {
  if (!runId) {
    return null;
  }

  const raw = await storage.getItem(getRoutePlannerDraftStorageKey(runId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RoutePlannerDraft;
  } catch {
    await storage.removeItem(getRoutePlannerDraftStorageKey(runId));
    return null;
  }
}

export async function saveRoutePlannerDraft(
  runId: string,
  draft: RoutePlannerDraft,
  storage: StorageLike = AsyncStorage
) {
  if (!runId) {
    return;
  }

  await storage.setItem(getRoutePlannerDraftStorageKey(runId), JSON.stringify(draft));
}

export async function clearRoutePlannerDraft(
  runId: string,
  storage: StorageLike = AsyncStorage
) {
  if (!runId) {
    return;
  }

  await storage.removeItem(getRoutePlannerDraftStorageKey(runId));
}
