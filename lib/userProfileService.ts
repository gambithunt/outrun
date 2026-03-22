import { child, get, push, ref, set, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { FuelType, GarageCar, UserProfile, UserStats } from '@/types/domain';

type UserProfileInput = {
  displayName: string;
  homeClub?: string;
};

type GarageCarInput = {
  nickname: string;
  make: string;
  model: string;
  fuelType: FuelType;
};

type CompletedRunStatsInput = {
  userId: string;
  totalDistanceKm?: number | null;
  hazardsReported?: number | null;
  mostUsedCarId?: string | null;
};

type UserProfileClient = {
  writeUserProfile: (userId: string, profile: UserProfile) => Promise<void>;
  readUserProfile?: (userId: string) => Promise<UserProfile | null>;
  writeGarageCar: (userId: string, carId: string, car: GarageCar) => Promise<void>;
  listGarageCars?: (userId: string) => Promise<GarageCar[]>;
};

export function createEmptyUserStats(): UserStats {
  return {
    totalRuns: 0,
    totalDistanceKm: 0,
    hazardsReported: 0,
    mostUsedCarId: null,
  };
}

export function validateUserProfileInput(input: UserProfileInput) {
  const displayName = input.displayName.trim();
  const homeClub = input.homeClub?.trim();

  if (!displayName) {
    throw new Error('Display name is required.');
  }

  if (displayName.length > 30) {
    throw new Error('Display name must be 30 characters or fewer.');
  }

  if (homeClub && homeClub.length > 50) {
    throw new Error('Home club must be 50 characters or fewer.');
  }

  return {
    displayName,
    ...(homeClub ? { homeClub } : {}),
  };
}

export function validateGarageCarInput(input: GarageCarInput) {
  const nickname = input.nickname.trim();
  const make = input.make.trim();
  const model = input.model.trim();

  if (!nickname) {
    throw new Error('Car nickname is required.');
  }

  if (!make) {
    throw new Error('Car make is required.');
  }

  if (!model) {
    throw new Error('Car model is required.');
  }

  return {
    nickname,
    make,
    model,
    fuelType: input.fuelType,
  };
}

export function createGarageCarId(random = Math.random) {
  return `car_${Math.floor(random() * 1_000_000_000)
    .toString(36)
    .padStart(6, '0')}`;
}

export function applyCompletedRunStats(
  profile: UserProfile,
  input: CompletedRunStatsInput,
  updatedAt: number
) {
  const currentStats = profile.stats ?? createEmptyUserStats();
  const totalDistanceKm = input.totalDistanceKm ?? 0;
  const hazardsReported = input.hazardsReported ?? 0;

  return {
    ...profile,
    updatedAt,
    stats: {
      totalRuns: currentStats.totalRuns + 1,
      totalDistanceKm: roundToSingleDecimal(currentStats.totalDistanceKm + totalDistanceKm),
      hazardsReported: currentStats.hazardsReported + hazardsReported,
      mostUsedCarId: input.mostUsedCarId ?? currentStats.mostUsedCarId ?? null,
    },
  };
}

export async function saveUserProfile(
  client: Pick<UserProfileClient, 'writeUserProfile' | 'readUserProfile'>,
  userId: string,
  input: UserProfileInput,
  options?: {
    now?: () => number;
  }
) {
  if (!userId) {
    throw new Error('User id is required before saving a profile.');
  }

  const now = options?.now ?? Date.now;
  const timestamp = now();
  const validated = validateUserProfileInput(input);
  const existingProfile = (await client.readUserProfile?.(userId)) ?? null;
  const profile: UserProfile = {
    ...validated,
    createdAt: existingProfile?.createdAt ?? timestamp,
    updatedAt: timestamp,
    stats: existingProfile?.stats ?? createEmptyUserStats(),
  };

  await client.writeUserProfile(userId, profile);
  return profile;
}

export async function saveGarageCar(
  client: Pick<UserProfileClient, 'writeGarageCar'>,
  userId: string,
  input: GarageCarInput,
  options?: {
    now?: () => number;
    random?: () => number;
  }
) {
  if (!userId) {
    throw new Error('User id is required before saving a garage car.');
  }

  const now = options?.now ?? Date.now;
  const random = options?.random ?? Math.random;
  const validated = validateGarageCarInput(input);
  const timestamp = now();
  const id = createGarageCarId(random);
  const car: GarageCar = {
    id,
    ...validated,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await client.writeGarageCar(userId, id, car);
  return car;
}

export async function updateUserStatsForCompletedRun(
  client: Pick<UserProfileClient, 'readUserProfile' | 'writeUserProfile'>,
  userId: string,
  input: CompletedRunStatsInput,
  options?: {
    now?: () => number;
  }
) {
  if (!userId) {
    throw new Error('User id is required before updating persistent stats.');
  }

  const now = options?.now ?? Date.now;
  const timestamp = now();
  const currentProfile = (await client.readUserProfile?.(userId)) ?? {
    displayName: 'ClubRun Driver',
    createdAt: timestamp,
    updatedAt: timestamp,
    stats: createEmptyUserStats(),
  };
  const nextProfile = applyCompletedRunStats(currentProfile, input, timestamp);

  await client.writeUserProfile(userId, nextProfile);
  return nextProfile;
}

export function createUserProfileClient(database: Database): UserProfileClient {
  return {
    writeUserProfile: async (userId, profile) => {
      await set(child(ref(database), `users/${userId}`), profile);
    },
    readUserProfile: async (userId) => {
      const snapshot = await get(child(ref(database), `users/${userId}`));
      return snapshot.exists() ? (snapshot.val() as UserProfile) : null;
    },
    writeGarageCar: async (userId, carId, car) => {
      await set(child(ref(database), `garage/${userId}/${carId}`), car);
    },
    listGarageCars: async (userId) => {
      const snapshot = await get(child(ref(database), `garage/${userId}`));
      if (!snapshot.exists()) {
        return [];
      }

      return Object.values(snapshot.val() as Record<string, GarageCar>);
    },
  };
}

export async function saveUserProfileWithFirebase(userId: string, input: UserProfileInput) {
  const database = getFirebaseDatabase();
  return saveUserProfile(createUserProfileClient(database), userId, input);
}

export async function loadUserProfileWithFirebase(userId: string) {
  const database = getFirebaseDatabase();
  return createUserProfileClient(database).readUserProfile?.(userId) ?? null;
}

export async function saveGarageCarWithFirebase(userId: string, input: GarageCarInput) {
  const database = getFirebaseDatabase();
  return saveGarageCar(createUserProfileClient(database), userId, input);
}

export async function listGarageCarsWithFirebase(userId: string) {
  const database = getFirebaseDatabase();
  return createUserProfileClient(database).listGarageCars?.(userId) ?? [];
}

export async function updateUserStatsForCompletedRunWithFirebase(
  userId: string,
  input: CompletedRunStatsInput
) {
  const database = getFirebaseDatabase();
  return updateUserStatsForCompletedRun(createUserProfileClient(database), userId, input);
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
