import { requireAuthenticatedUserIdWithFirebase } from '@/lib/auth';
import { child, get, push, ref, set, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { Run, RunStatus } from '@/types/domain';

export type RunDraftInput = {
  name: string;
  description?: string;
  maxDrivers?: number;
};

export type CreatedRun = {
  runId: string;
  joinCode: string;
  adminId: string;
  run: Run;
};

type JoinCodeRecord = {
  runId: string;
  createdAt: number;
};

type RunClient = {
  createRunId: () => string;
  readJoinCode: (code: string) => Promise<JoinCodeRecord | null>;
  writeJoinCode: (code: string, value: JoinCodeRecord) => Promise<void>;
  writeRun: (runId: string, run: Run) => Promise<void>;
};

export function validateRunDraftInput(input: RunDraftInput) {
  const name = input.name.trim();
  const description = input.description?.trim() ?? '';
  const maxDrivers = input.maxDrivers ?? 15;

  if (!name) {
    throw new Error('Run name is required.');
  }

  if (name.length > 60) {
    throw new Error('Run name must be 60 characters or fewer.');
  }

  if (description.length > 250) {
    throw new Error('Description must be 250 characters or fewer.');
  }

  if (!Number.isInteger(maxDrivers) || maxDrivers < 1 || maxDrivers > 50) {
    throw new Error('Max drivers must be between 1 and 50.');
  }

  return {
    name,
    description: description || undefined,
    maxDrivers,
  };
}

export function generateJoinCode(random = Math.random) {
  return Math.floor(random() * 1_000_000)
    .toString()
    .padStart(6, '0');
}

export function createAdminId(random = Math.random) {
  return `driver_${Math.floor(random() * 1_000_000_000)
    .toString(36)
    .padStart(6, '0')}`;
}

export function createRunClient(database: Database): RunClient {
  return {
    createRunId: () => {
      const runRef = push(child(ref(database), 'runs'));
      if (!runRef.key) {
        throw new Error('Unable to allocate a run id.');
      }

      return runRef.key;
    },
    readJoinCode: async (code) => {
      const snapshot = await get(child(ref(database), `joinCodes/${code}`));
      return snapshot.exists() ? (snapshot.val() as JoinCodeRecord) : null;
    },
    writeJoinCode: async (code, value) => {
      await set(child(ref(database), `joinCodes/${code}`), value);
    },
    writeRun: async (runId, run) => {
      await set(child(ref(database), `runs/${runId}`), run);
    },
  };
}

export async function createRun(
  client: RunClient,
  input: RunDraftInput,
  options?: {
    adminId?: string;
    now?: () => number;
    random?: () => number;
    maxAttempts?: number;
    maxDrivers?: number;
    initialStatus?: RunStatus;
  }
): Promise<CreatedRun> {
  const now = options?.now ?? Date.now;
  const random = options?.random ?? Math.random;
  const maxAttempts = options?.maxAttempts ?? 10;
  const status = options?.initialStatus ?? 'draft';

  const validated = validateRunDraftInput(input);
  const maxDrivers = validated.maxDrivers ?? options?.maxDrivers ?? 15;
  const runId = client.createRunId();
  const adminId = options?.adminId ?? createAdminId(random);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const joinCode = generateJoinCode(random);
    const existing = await client.readJoinCode(joinCode);

    if (existing) {
      continue;
    }

    const timestamp = now();
    const run: Run = {
      name: validated.name,
      description: validated.description,
      joinCode,
      adminId,
      status,
      createdAt: timestamp,
      startedAt: null,
      endedAt: null,
      maxDrivers,
    };

    await client.writeRun(runId, run);
    await client.writeJoinCode(joinCode, {
      runId,
      createdAt: timestamp,
    });

    return {
      runId,
      joinCode,
      adminId,
      run,
    };
  }

  throw new Error('Unable to generate a unique join code.');
}

export async function resolveJoinCode(client: RunClient, code: string) {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) {
    throw new Error('Join code must be exactly 6 digits.');
  }

  return client.readJoinCode(normalized);
}

export async function createRunWithFirebase(input: RunDraftInput) {
  const database = getFirebaseDatabase();
  const adminId = await requireAuthenticatedUserIdWithFirebase();
  return createRun(createRunClient(database), input, {
    adminId,
  });
}

export async function resolveJoinCodeWithFirebase(code: string) {
  await requireAuthenticatedUserIdWithFirebase();
  const database = getFirebaseDatabase();
  return resolveJoinCode(createRunClient(database), code);
}
