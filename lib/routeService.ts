import { child, get, ref, set, type Database } from 'firebase/database';

import { requireAuthenticatedUserIdWithFirebase } from '@/lib/auth';
import { getFirebaseDatabase } from '@/lib/firebase';
import { buildRouteWaypointsFromStops } from '@/lib/routePlanner';
import { calculateRouteDistanceMeters, isValidRoutePoint, RoutePoint } from '@/lib/geo';
import { RouteData, RouteStopDraft } from '@/types/domain';

type RouteClient = {
  readStartedAt: (runId: string) => Promise<number | null>;
  writeRoute: (runId: string, route: RouteData) => Promise<void>;
  writeStatus: (runId: string, status: 'draft' | 'ready' | 'active') => Promise<void>;
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
      duration?: number;
      geometry?: {
        coordinates?: [number, number][];
      };
    }>;
  };
  const duration = payload.routes?.[0]?.duration;
  const coordinates = payload.routes?.[0]?.geometry?.coordinates;

  if (!coordinates || coordinates.length < 2) {
    throw new Error('OSRM returned an invalid route geometry.');
  }

  const points = decodeOsrmCoordinates(coordinates);
  return {
    points,
    distanceMetres: Math.round(calculateRouteDistanceMeters(points)),
    durationSeconds: typeof duration === 'number' ? Math.round(duration) : undefined,
    source: 'drawn',
  };
}

export async function fetchRoadRouteFromStops(
  stops: RouteStopDraft[],
  fetchImpl: typeof fetch = fetch
): Promise<RouteData> {
  const route = await fetchRoadRoute(buildRouteWaypointsFromStops(stops), fetchImpl);
  return {
    ...route,
    stops: stops.filter((stop) => typeof stop.lat === 'number' && typeof stop.lng === 'number'),
  };
}

export function createRouteClient(database: Database): RouteClient {
  return {
    readStartedAt: async (runId) => {
      const snapshot = await get(child(ref(database), `runs/${runId}/startedAt`));
      return snapshot.exists() ? (snapshot.val() as number) : null;
    },
    writeRoute: async (runId, route) => {
      await set(child(ref(database), `runs/${runId}/route`), sanitizeRouteData(route));
    },
    writeStatus: async (runId, status) => {
      await set(child(ref(database), `runs/${runId}/status`), status);
    },
    writeStartedAt: async (runId, startedAt) => {
      await set(child(ref(database), `runs/${runId}/startedAt`), startedAt);
    },
  };
}

export function sanitizeRouteData(route: RouteData): RouteData {
  return removeUndefinedDeep(route) as RouteData;
}

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    const cleanedEntries = Object.entries(value).flatMap(([key, entryValue]) => {
      if (typeof entryValue === 'undefined') {
        return [];
      }

      return [[key, removeUndefinedDeep(entryValue)]];
    });

    return Object.fromEntries(cleanedEntries) as T;
  }

  return value;
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
  await client.writeStatus(runId, 'ready');
}

export async function saveRouteDraftToRun(
  client: RouteClient,
  runId: string,
  route: RouteData,
  _now = Date.now()
) {
  if (!runId) {
    throw new Error('Run id is required before saving a route.');
  }

  await client.writeRoute(runId, route);
}

export async function startRunWithSavedRoute(
  client: RouteClient,
  runId: string,
  now = Date.now()
) {
  if (!runId) {
    throw new Error('Run id is required before starting a run.');
  }

  const startedAt = await client.readStartedAt(runId);
  if (startedAt === null) {
    await client.writeStartedAt(runId, now);
  }
  await client.writeStatus(runId, 'ready');
}

export async function reopenRoutePlannerFromLobby(client: RouteClient, runId: string) {
  if (!runId) {
    throw new Error('Run id is required before reopening route planning.');
  }

  await client.writeStatus(runId, 'draft');
}

export async function saveRouteToRunWithFirebase(runId: string, route: RouteData) {
  await requireAuthenticatedUserIdWithFirebase();
  const database = getFirebaseDatabase();
  return saveRouteToRun(createRouteClient(database), runId, route);
}

export async function saveRouteDraftToRunWithFirebase(runId: string, route: RouteData) {
  await requireAuthenticatedUserIdWithFirebase();
  const database = getFirebaseDatabase();
  return saveRouteDraftToRun(createRouteClient(database), runId, route);
}

export async function startRunWithSavedRouteWithFirebase(runId: string) {
  await requireAuthenticatedUserIdWithFirebase();
  const database = getFirebaseDatabase();
  return startRunWithSavedRoute(createRouteClient(database), runId);
}

export async function reopenRoutePlannerFromLobbyWithFirebase(runId: string) {
  await requireAuthenticatedUserIdWithFirebase();
  const database = getFirebaseDatabase();
  return reopenRoutePlannerFromLobby(createRouteClient(database), runId);
}
