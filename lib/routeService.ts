import { child, ref, set, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { calculateRouteDistanceMeters, isValidRoutePoint, RoutePoint } from '@/lib/geo';
import { RouteData } from '@/types/domain';

type RouteClient = {
  writeRoute: (runId: string, route: RouteData) => Promise<void>;
  writeStatus: (runId: string, status: 'active') => Promise<void>;
  writeStartedAt: (runId: string, startedAt: number) => Promise<void>;
};

export function validateWaypoints(waypoints: RoutePoint[]) {
  if (waypoints.length < 2) {
    throw new Error('Add at least two waypoints before previewing a route.');
  }

  if (waypoints.length > 25) {
    throw new Error('Route planning supports a maximum of 25 waypoints.');
  }

  if (!waypoints.every(isValidRoutePoint)) {
    throw new Error('Every waypoint must be a valid latitude and longitude pair.');
  }

  return waypoints;
}

export function buildOsrmRouteUrl(waypoints: RoutePoint[]) {
  validateWaypoints(waypoints);
  const coordinates = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  return `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
}

export function decodeOsrmCoordinates(coordinates: [number, number][]) {
  return coordinates.map(([lng, lat]) => [lat, lng] as RoutePoint);
}

export async function fetchRoadRoute(
  waypoints: RoutePoint[],
  fetchImpl: typeof fetch = fetch
): Promise<RouteData> {
  const url = buildOsrmRouteUrl(waypoints);
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error('Unable to fetch a route preview from OSRM.');
  }

  const payload = (await response.json()) as {
    routes?: Array<{
      geometry?: {
        coordinates?: [number, number][];
      };
    }>;
  };
  const coordinates = payload.routes?.[0]?.geometry?.coordinates;

  if (!coordinates || coordinates.length < 2) {
    throw new Error('OSRM returned an invalid route geometry.');
  }

  const points = decodeOsrmCoordinates(coordinates);
  return {
    points,
    distanceMetres: Math.round(calculateRouteDistanceMeters(points)),
    source: 'drawn',
  };
}

export function createRouteClient(database: Database): RouteClient {
  return {
    writeRoute: async (runId, route) => {
      await set(child(ref(database), `runs/${runId}/route`), route);
    },
    writeStatus: async (runId, status) => {
      await set(child(ref(database), `runs/${runId}/status`), status);
    },
    writeStartedAt: async (runId, startedAt) => {
      await set(child(ref(database), `runs/${runId}/startedAt`), startedAt);
    },
  };
}

export async function saveRouteToRun(
  client: RouteClient,
  runId: string,
  route: RouteData,
  now = Date.now()
) {
  if (!runId) {
    throw new Error('Run id is required before saving a route.');
  }

  await client.writeRoute(runId, route);
  await client.writeStartedAt(runId, now);
  await client.writeStatus(runId, 'active');
}

export async function saveRouteToRunWithFirebase(runId: string, route: RouteData) {
  const database = getFirebaseDatabase();
  return saveRouteToRun(createRouteClient(database), runId, route);
}
