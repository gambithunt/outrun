import AsyncStorage from '@react-native-async-storage/async-storage';
import { child, get, ref, runTransaction, type Database } from 'firebase/database';

import { requireAuthenticatedUserIdWithFirebase } from '@/lib/auth';
import { getFirebaseDatabase } from '@/lib/firebase';
import { DriverProfile, DriverRecord, FuelType, Run } from '@/types/domain';

export const DRIVER_PROFILE_STORAGE_KEY = 'clubrun.driver-profile.draft';
const FUEL_UNITS_BY_TYPE: Record<FuelType, 'mpg' | 'mi_per_kwh'> = {
  petrol: 'mpg',
  diesel: 'mpg',
  hybrid: 'mpg',
  electric: 'mi_per_kwh',
};

type DriverProfileInput = {
  name: string;
  carMake: string;
  carModel: string;
  engineSize?: string;
  engineUnit?: 'cc' | 'litres';
  fuelType: FuelType;
  fuelEfficiency?: string;
};

type JoinClaimResult = {
  joined: boolean;
  reason?: 'full' | 'ended' | 'missing' | 'exists';
};

type DriverClient = {
  readRun: (runId: string) => Promise<Run | null>;
  claimDriverSlot: (runId: string, driverId: string, driver: DriverRecord) => Promise<JoinClaimResult>;
  inspectRunForJoin?: (runId: string) => Promise<'exists' | 'missing' | 'ended' | 'forbidden'>;
};

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function createDriverId(random = Math.random) {
  return `driver_${Math.floor(random() * 1_000_000_000)
    .toString(36)
    .padStart(6, '0')}`;
}

export function validateDriverProfileInput(input: DriverProfileInput): DriverProfile {
  const name = input.name.trim();
  const carMake = input.carMake.trim();
  const carModel = input.carModel.trim();

  if (!name) {
    throw new Error('Display name is required.');
  }

  if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
    throw new Error('Display name can only include letters, numbers, and spaces.');
  }

  if (name.length > 30) {
    throw new Error('Display name must be 30 characters or fewer.');
  }

  if (!carMake) {
    throw new Error('Car make is required.');
  }

  if (carMake.length > 30) {
    throw new Error('Car make must be 30 characters or fewer.');
  }

  if (!carModel) {
    throw new Error('Car model is required.');
  }

  if (carModel.length > 40) {
    throw new Error('Car model must be 40 characters or fewer.');
  }

  let engineSize: string | undefined;
  let engineUnit: 'cc' | 'litres' | undefined;
  if (input.engineSize?.trim()) {
    const parsed = Number(input.engineSize);
    engineUnit = input.engineUnit ?? 'litres';
    const isValid =
      engineUnit === 'litres'
        ? parsed >= 0.1 && parsed <= 10
        : parsed >= 50 && parsed <= 10_000;
    if (!Number.isFinite(parsed) || !isValid) {
      throw new Error(
        engineUnit === 'litres'
          ? 'Engine size in litres must be between 0.1 and 10.0.'
          : 'Engine size in cc must be between 50 and 10000.'
      );
    }
    engineSize = input.engineSize.trim();
  }

  let fuelEfficiency: number | undefined;
  if (input.fuelEfficiency?.trim()) {
    const parsed = Number(input.fuelEfficiency);
    const max = input.fuelType === 'electric' ? 10 : 150;
    const min = 1;
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new Error(
        input.fuelType === 'electric'
          ? 'Electric efficiency must be between 1.0 and 10.0 mi/kWh.'
          : 'Fuel efficiency must be between 1 and 150 MPG.'
      );
    }
    fuelEfficiency = parsed;
  }

  return {
    name,
    carMake,
    carModel,
    engineSize,
    engineUnit,
    fuelType: input.fuelType,
    fuelEfficiency,
    fuelUnit: fuelEfficiency ? FUEL_UNITS_BY_TYPE[input.fuelType] : undefined,
  };
}

export async function loadDriverProfileDraft(storage: StorageLike = AsyncStorage) {
  const raw = await storage.getItem(DRIVER_PROFILE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as DriverProfile;
}

export async function saveDriverProfileDraft(
  profile: DriverProfile,
  storage: StorageLike = AsyncStorage
) {
  await storage.setItem(DRIVER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function createDriverClient(database: Database): DriverClient {
  return {
    readRun: async (runId) => {
      const snapshot = await get(child(ref(database), `runs/${runId}`));
      return snapshot.exists() ? (snapshot.val() as Run) : null;
    },
    claimDriverSlot: async (runId, driverId, driver) => {
      try {
        const result = await runTransaction(
          child(ref(database), `runs/${runId}/drivers/${driverId}`),
          (currentDriver) => {
            if (currentDriver) {
              return currentDriver;
            }

            return driver;
          }
        );

        if (result.committed) {
          return {
            joined: true,
          };
        }

        return {
          joined: false,
          reason: 'exists',
        };
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          return {
            joined: false,
            reason: 'missing',
          };
        }

        throw error;
      }
    },
    inspectRunForJoin: async (runId) => {
      try {
        const snapshot = await get(child(ref(database), `runs/${runId}`));
        if (!snapshot.exists()) {
          return 'missing';
        }

        const run = snapshot.val() as Partial<Run>;
        if (run.status === 'ended') {
          return 'ended';
        }

        return 'exists';
      } catch (error) {
        if (isPermissionDeniedError(error)) {
          return 'forbidden';
        }

        throw error;
      }
    },
  };
}

export async function saveDriverProfile(
  client: DriverClient,
  runId: string,
  input: DriverProfileInput,
  options?: {
    driverId?: string;
    now?: () => number;
    random?: () => number;
  }
) {
  if (!runId) {
    throw new Error('Run id is required before saving a driver profile.');
  }

  const now = options?.now ?? Date.now;
  const random = options?.random ?? Math.random;
  const profile = validateDriverProfileInput(input);
  const driverId = options?.driverId ?? createDriverId(random);
  const driver: DriverRecord = {
    profile,
    joinedAt: now(),
    leftAt: null,
    stats: {},
  };
  const run = await client.readRun(runId);

  if (!run) {
    throw new Error('This run is no longer available.');
  }

  if (run.status === 'ended') {
    throw new Error('This run has already ended.');
  }

  const currentDrivers = run.drivers ?? {};
  if (!currentDrivers[driverId] && Object.keys(currentDrivers).length >= run.maxDrivers) {
    throw new Error('This run is full.');
  }

  const joinResult = await client.claimDriverSlot(runId, driverId, driver);
  if (!joinResult.joined) {
    if (joinResult.reason === 'exists') {
      return {
        driverId,
        profile,
        driver,
      };
    }

    if (joinResult.reason === 'missing') {
      const runState = await client.inspectRunForJoin?.(runId);
      if (runState === 'ended') {
        throw new Error('This run has already ended.');
      }

      if (runState === 'forbidden') {
        throw new Error(
          'Join permissions are blocked. Deploy the latest Firebase Realtime Database rules and try again.'
        );
      }

      if (runState === 'exists') {
        throw new Error('Unable to join this run right now. Refresh and try again.');
      }

      throw new Error('This run is no longer available.');
    }

    if (joinResult.reason === 'ended') {
      throw new Error('This run has already ended.');
    }

    throw new Error('This run is full.');
  }

  return {
    driverId,
    profile,
    driver,
  };
}

function isPermissionDeniedError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('permission_denied') || message.includes('permission denied');
}

export async function saveDriverProfileWithFirebase(runId: string, input: DriverProfileInput) {
  const database = getFirebaseDatabase();
  const driverId = await requireAuthenticatedUserIdWithFirebase();
  return saveDriverProfile(createDriverClient(database), runId, input, {
    driverId,
  });
}
