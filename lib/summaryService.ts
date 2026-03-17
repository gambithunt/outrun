import { child, ref, set, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { calculateRouteDistanceMeters } from '@/lib/geo';
import {
  CollectiveFuelSummary,
  DriverRecord,
  Hazard,
  HazardSummary,
  Run,
  RunSummary,
  SummaryDriverStat,
} from '@/types/domain';

function kilometersToMiles(value: number) {
  return value * 0.621371;
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

export function calculateFuelUsage(distanceKm: number, driver: DriverRecord) {
  const efficiency = driver.profile.fuelEfficiency;
  if (!efficiency) {
    return {};
  }

  const distanceMiles = kilometersToMiles(distanceKm);
  if (driver.profile.fuelType === 'electric') {
    return {
      fuelUsedKwh: roundToSingleDecimal(distanceMiles / efficiency),
    };
  }

  return {
    fuelUsedLitres: roundToSingleDecimal((distanceMiles / efficiency) * 3.78541),
  };
}

export function buildHazardSummary(hazards: Record<string, Hazard> | undefined): HazardSummary {
  return Object.values(hazards ?? {}).reduce<HazardSummary>(
    (summary, hazard) => {
      summary.total += 1;
      summary.byType[hazard.type] = (summary.byType[hazard.type] ?? 0) + 1;
      return summary;
    },
    { total: 0, byType: {} }
  );
}

export function buildCollectiveFuelSummary(
  driverStats: Record<string, SummaryDriverStat>
): CollectiveFuelSummary {
  return Object.values(driverStats).reduce<CollectiveFuelSummary>(
    (totals, driver) => {
      if (driver.fuelType === 'electric') {
        totals.electricKwh += driver.fuelUsedKwh ?? 0;
      }

      if (driver.fuelType === 'petrol') {
        totals.petrolLitres += driver.fuelUsedLitres ?? 0;
      }

      if (driver.fuelType === 'diesel') {
        totals.dieselLitres += driver.fuelUsedLitres ?? 0;
      }

      if (driver.fuelType === 'hybrid') {
        totals.hybridLitres += driver.fuelUsedLitres ?? 0;
      }

      return totals;
    },
    {
      petrolLitres: 0,
      dieselLitres: 0,
      hybridLitres: 0,
      electricKwh: 0,
    }
  );
}

function inferTopSpeedKmh(driver: DriverRecord) {
  const speed = driver.stats?.topSpeed ?? driver.location?.speed;
  if (typeof speed !== 'number') {
    return null;
  }

  return roundToSingleDecimal(speed * 3.6);
}

export function buildRunSummary(run: Run, now = Date.now()): RunSummary {
  const routeDistanceMetres = run.route?.distanceMetres ?? calculateRouteDistanceMeters(run.route?.points ?? []);
  const totalDistanceKm = roundToSingleDecimal(routeDistanceMetres / 1000);
  const totalDriveTimeMinutes =
    run.startedAt && now >= run.startedAt ? Math.round((now - run.startedAt) / 60000) : 0;

  const driverStats = Object.entries(run.drivers ?? {}).reduce<Record<string, SummaryDriverStat>>(
    (summary, [driverId, driver]) => {
      if (!driver.profile?.name || !driver.profile?.carMake || !driver.profile?.carModel) {
        return summary;
      }

      summary[driverId] = {
        name: driver.profile.name,
        carMake: driver.profile.carMake,
        carModel: driver.profile.carModel,
        topSpeedKmh: inferTopSpeedKmh(driver),
        fuelType: driver.profile.fuelType,
        ...calculateFuelUsage(totalDistanceKm, driver),
      };
      return summary;
    },
    {}
  );

  return {
    totalDistanceKm,
    totalDriveTimeMinutes,
    driverStats,
    collectiveFuel: buildCollectiveFuelSummary(driverStats),
    hazardSummary: buildHazardSummary(run.hazards),
    generatedAt: now,
  };
}

type SummaryClient = {
  writeSummary: (runId: string, summary: RunSummary) => Promise<void>;
  writeStatus: (runId: string, status: 'ended') => Promise<void>;
  writeEndedAt: (runId: string, endedAt: number) => Promise<void>;
};

export function createSummaryClient(database: Database): SummaryClient {
  return {
    writeSummary: async (runId, summary) => {
      await set(child(ref(database), `runs/${runId}/summary`), summary);
    },
    writeStatus: async (runId, status) => {
      await set(child(ref(database), `runs/${runId}/status`), status);
    },
    writeEndedAt: async (runId, endedAt) => {
      await set(child(ref(database), `runs/${runId}/endedAt`), endedAt);
    },
  };
}

export async function endRun(client: SummaryClient, runId: string, run: Run, now = Date.now()) {
  if (!runId) {
    throw new Error('Run id is required to end the run.');
  }

  const summary = buildRunSummary(
    {
      ...run,
      endedAt: now,
      status: 'ended',
    },
    now
  );

  await client.writeEndedAt(runId, now);
  await client.writeStatus(runId, 'ended');
  await client.writeSummary(runId, summary);

  return summary;
}

export async function endRunWithFirebase(runId: string, run: Run) {
  const database = getFirebaseDatabase();
  return endRun(createSummaryClient(database), runId, run);
}
