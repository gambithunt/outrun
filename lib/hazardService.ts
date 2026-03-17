import { child, push, ref, set, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { haversineDistanceMeters, RoutePoint } from '@/lib/geo';
import { LiveHazard } from '@/lib/hazardRealtime';
import { Hazard, HazardType } from '@/types/domain';

export const HAZARD_LABELS: Record<HazardType, string> = {
  pothole: 'Pothole',
  roadworks: 'Roadworks',
  police: 'Police',
  debris: 'Debris',
  animal: 'Animal',
  broken_down_car: 'Broken Down Car',
};

type HazardClient = {
  createHazardId: () => string;
  writeHazard: (runId: string, hazardId: string, hazard: Hazard) => Promise<void>;
};

export function isVisibleHazard(hazard: LiveHazard, now = Date.now()) {
  return !hazard.dismissed && now - hazard.timestamp <= 30 * 60 * 1000;
}

export function findDuplicateHazard(
  hazards: LiveHazard[],
  type: HazardType,
  point: RoutePoint,
  now = Date.now()
) {
  return hazards.find((hazard) => {
    if (hazard.type !== type || hazard.dismissed) {
      return false;
    }

    if (now - hazard.timestamp > 60 * 1000) {
      return false;
    }

    return haversineDistanceMeters([hazard.lat, hazard.lng], point) <= 100;
  });
}

export function createHazardClient(database: Database): HazardClient {
  return {
    createHazardId: () => {
      const hazardRef = push(child(ref(database), 'hazards'));
      if (!hazardRef.key) {
        throw new Error('Unable to allocate a hazard id.');
      }

      return hazardRef.key;
    },
    writeHazard: async (runId, hazardId, hazard) => {
      await set(child(ref(database), `runs/${runId}/hazards/${hazardId}`), hazard);
    },
  };
}

export function buildHazardToastMessage(
  previousHazards: LiveHazard[],
  nextHazards: LiveHazard[],
  currentDriverId: string | null
) {
  const previousById = new Map(previousHazards.map((hazard) => [hazard.id, hazard]));
  const latestEvent = [...nextHazards]
    .filter((hazard) => !hazard.dismissed)
    .sort((a, b) => b.timestamp - a.timestamp)
    .find((hazard) => {
      const previous = previousById.get(hazard.id);
      if (!previous) {
        return true;
      }

      return hazard.reportCount > previous.reportCount;
    });

  if (!latestEvent || latestEvent.reportedBy === currentDriverId) {
    return null;
  }

  return `${latestEvent.reporterName} reported ${HAZARD_LABELS[latestEvent.type].toLowerCase()} ahead.`;
}

export async function dismissHazard(
  client: Pick<HazardClient, 'writeHazard'>,
  input: {
    runId: string;
    hazard: LiveHazard;
  }
) {
  if (!input.runId || !input.hazard.id) {
    throw new Error('Run id and hazard id are required to dismiss a hazard.');
  }

  await client.writeHazard(input.runId, input.hazard.id, {
    type: input.hazard.type,
    reportedBy: input.hazard.reportedBy,
    reporterName: input.hazard.reporterName,
    lat: input.hazard.lat,
    lng: input.hazard.lng,
    timestamp: input.hazard.timestamp,
    dismissed: true,
    reportCount: input.hazard.reportCount,
  });
}

export async function reportHazard(
  client: HazardClient,
  input: {
    runId: string;
    reportedBy: string;
    reporterName: string;
    type: HazardType;
    point: RoutePoint;
    existingHazards: LiveHazard[];
  },
  options?: {
    now?: () => number;
  }
) {
  if (!input.runId || !input.reportedBy || !input.reporterName) {
    throw new Error('Run id, driver id, and driver name are required to report a hazard.');
  }

  const now = options?.now ?? Date.now;
  const timestamp = now();
  const duplicate = findDuplicateHazard(input.existingHazards, input.type, input.point, timestamp);

  if (duplicate) {
    const merged: Hazard = {
      type: duplicate.type,
      reportedBy: duplicate.reportedBy,
      reporterName: duplicate.reporterName,
      lat: duplicate.lat,
      lng: duplicate.lng,
      timestamp: duplicate.timestamp,
      dismissed: false,
      reportCount: duplicate.reportCount + 1,
    };
    await client.writeHazard(input.runId, duplicate.id, merged);
    return {
      hazardId: duplicate.id,
      hazard: merged,
      deduped: true,
    };
  }

  const hazardId = client.createHazardId();
  const hazard: Hazard = {
    type: input.type,
    reportedBy: input.reportedBy,
    reporterName: input.reporterName,
    lat: input.point[0],
    lng: input.point[1],
    timestamp,
    dismissed: false,
    reportCount: 1,
  };

  await client.writeHazard(input.runId, hazardId, hazard);
  return {
    hazardId,
    hazard,
    deduped: false,
  };
}

export async function reportHazardWithFirebase(input: {
  runId: string;
  reportedBy: string;
  reporterName: string;
  type: HazardType;
  point: RoutePoint;
  existingHazards: LiveHazard[];
}) {
  const database = getFirebaseDatabase();
  return reportHazard(createHazardClient(database), input);
}

export async function dismissHazardWithFirebase(runId: string, hazard: LiveHazard) {
  const database = getFirebaseDatabase();
  return dismissHazard(createHazardClient(database), {
    runId,
    hazard,
  });
}
