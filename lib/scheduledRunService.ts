import { child, get, push, ref, set, type Database } from 'firebase/database';

import { requireAuthenticatedUserIdWithFirebase } from '@/lib/auth';
import { getFirebaseDatabase } from '@/lib/firebase';
import { generateJoinCode, validateRunDraftInput } from '@/lib/runService';
import { AdminRunHistoryEntry, loadAdminRunHistory } from '@/lib/adminRunHistory';
import { Run, RunInvite, RunVisibility } from '@/types/domain';

type ScheduledRunInput = {
  name: string;
  description?: string;
  maxDrivers?: number;
  scheduledFor: number;
  visibility?: RunVisibility;
  invitedUserIds?: string[];
};

type DashboardSections = {
  hero: Run | AdminRunHistoryEntry | null;
  upcoming: Run[];
  invites: Run[];
  recent: AdminRunHistoryEntry[];
};

type ScheduledRunClient = {
  createRunId: () => string;
  writeRun: (runId: string, run: Run) => Promise<void>;
  writeUserRun: (userId: string, runId: string, value: { scheduledFor: number; name: string }) => Promise<void>;
  writeInvite: (userId: string, runId: string, invite: RunInvite) => Promise<void>;
  writeJoinCode?: (code: string, value: { runId: string; createdAt: number }) => Promise<void>;
  listUserRunIds?: (userId: string) => Promise<string[]>;
  listInvitedRunIds?: (userId: string) => Promise<string[]>;
  readRun?: (runId: string) => Promise<Run | null>;
};

export function validateScheduledRunInput(input: ScheduledRunInput, now = Date.now()) {
  const validated = validateRunDraftInput(input);
  const visibility = input.visibility ?? 'private';

  if (!Number.isFinite(input.scheduledFor) || input.scheduledFor <= now) {
    throw new Error('Scheduled time must be in the future.');
  }

  return {
    ...validated,
    scheduledFor: input.scheduledFor,
    visibility,
    invitedUserIds: [...new Set(input.invitedUserIds ?? [])],
  };
}

export async function createScheduledRun(
  client: ScheduledRunClient,
  userId: string,
  input: ScheduledRunInput,
  options?: {
    now?: () => number;
    random?: () => number;
  }
) {
  if (!userId) {
    throw new Error('User id is required before scheduling a run.');
  }

  const now = options?.now ?? Date.now;
  const random = options?.random ?? Math.random;
  const validated = validateScheduledRunInput(input, now());
  const timestamp = now();
  const runId = client.createRunId();
  const joinCode = generateJoinCode(random);
  const run: Run = {
    name: validated.name,
    ...(validated.description ? { description: validated.description } : {}),
    joinCode,
    adminId: userId,
    status: 'draft',
    createdAt: timestamp,
    startedAt: null,
    endedAt: null,
    maxDrivers: validated.maxDrivers,
    scheduledFor: validated.scheduledFor,
    createdBy: userId,
    visibility: validated.visibility,
    inviteSummary: {
      totalInvites: validated.invitedUserIds.length,
      acceptedInvites: 0,
      lastUpdatedAt: timestamp,
    },
  };

  await client.writeRun(runId, run);
  await client.writeUserRun(userId, runId, {
    scheduledFor: validated.scheduledFor,
    name: validated.name,
  });
  if (client.writeJoinCode) {
    await client.writeJoinCode(joinCode, {
      runId,
      createdAt: timestamp,
    });
  }

  await Promise.all(
    validated.invitedUserIds.map((invitedUserId) =>
      client.writeInvite(invitedUserId, runId, {
        runId,
        invitedBy: userId,
        invitedAt: timestamp,
        status: 'pending',
      })
    )
  );

  return {
    runId,
    run,
  };
}

export function buildRunsDashboardSections(input: {
  runs: Run[];
  invitedRuns?: Run[];
  history: AdminRunHistoryEntry[];
  now?: number;
}): DashboardSections {
  const now = input.now ?? Date.now();
  const invitedRuns = input.invitedRuns ?? [];
  const activeRun =
    input.runs.find((run) => run.status === 'active') ??
    input.runs.find((run) => run.status === 'ready');
  const upcoming = input.runs
    .filter((run) => typeof run.scheduledFor === 'number' && run.scheduledFor > now)
    .sort((left, right) => (left.scheduledFor ?? 0) - (right.scheduledFor ?? 0));
  const recent = [...input.history].sort((left, right) => right.createdAt - left.createdAt);
  const hero =
    activeRun ??
    upcoming[0] ??
    recent.find((entry) => entry.status === 'draft' || entry.status === 'ready') ??
    recent[0] ??
    null;

  return {
    hero,
    upcoming,
    invites: invitedRuns
      .filter((run) => run.status !== 'ended')
      .sort((left, right) => (left.scheduledFor ?? left.createdAt) - (right.scheduledFor ?? right.createdAt)),
    recent,
  };
}

export function createScheduledRunClient(database: Database): ScheduledRunClient {
  return {
    createRunId: () => {
      const runRef = push(child(ref(database), 'runs'));
      if (!runRef.key) {
        throw new Error('Unable to allocate a run id.');
      }

      return runRef.key;
    },
    writeRun: async (runId, run) => {
      await set(child(ref(database), `runs/${runId}`), run);
    },
    writeUserRun: async (userId, runId, value) => {
      await set(child(ref(database), `userRuns/${userId}/${runId}`), value);
    },
    writeInvite: async (userId, runId, invite) => {
      await set(child(ref(database), `runInvites/${userId}/${runId}`), invite);
    },
    writeJoinCode: async (code, value) => {
      await set(child(ref(database), `joinCodes/${code}`), value);
    },
    listUserRunIds: async (userId) => {
      const snapshot = await get(child(ref(database), `userRuns/${userId}`));
      if (!snapshot.exists()) {
        return [];
      }

      return Object.keys(snapshot.val() as Record<string, unknown>);
    },
    listInvitedRunIds: async (userId) => {
      const snapshot = await get(child(ref(database), `runInvites/${userId}`));
      if (!snapshot.exists()) {
        return [];
      }

      return Object.keys(snapshot.val() as Record<string, unknown>);
    },
    readRun: async (runId) => {
      const snapshot = await get(child(ref(database), `runs/${runId}`));
      return snapshot.exists() ? (snapshot.val() as Run) : null;
    },
  };
}

export async function createScheduledRunWithFirebase(input: ScheduledRunInput) {
  const database = getFirebaseDatabase();
  const userId = await requireAuthenticatedUserIdWithFirebase();
  return createScheduledRun(createScheduledRunClient(database), userId, input);
}

export async function loadScheduledRunsForUserWithFirebase(userId: string) {
  if (!userId) {
    return [];
  }

  const database = getFirebaseDatabase();
  const client = createScheduledRunClient(database);
  const runIds = (await client.listUserRunIds?.(userId)) ?? [];
  const runs = await Promise.all(
    runIds.map(async (runId) => client.readRun?.(runId) ?? null)
  );

  return runs.filter((run): run is Run => Boolean(run));
}

export async function loadInvitedRunsForUserWithFirebase(userId: string) {
  if (!userId) {
    return [];
  }

  const database = getFirebaseDatabase();
  const client = createScheduledRunClient(database);
  const runIds = (await client.listInvitedRunIds?.(userId)) ?? [];
  const runs = await Promise.all(
    runIds.map(async (runId) => client.readRun?.(runId) ?? null)
  );

  return runs.filter((run): run is Run => Boolean(run));
}

export async function loadRunsDashboardSections(runs: Run[]) {
  const history = await loadAdminRunHistory();
  return buildRunsDashboardSections({
    runs,
    history,
  });
}
