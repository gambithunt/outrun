import { child, get, push, ref, type Database } from 'firebase/database';

import { getFirebaseDatabase } from '@/lib/firebase';
import { haversineDistanceMeters } from '@/lib/geo';
import { DriverLocation, DriverStats } from '@/types/domain';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Speed below which a driver is considered stopped (m/s ≈ 1.8 km/h). */
const MOVING_THRESHOLD_MS = 0.5;

/** Minimum stop duration to count as a stop event (ms). */
const MIN_STOP_DURATION_MS = 15_000;

// ─── Pure stats calculation ───────────────────────────────────────────────────

/**
 * Compute DriverStats from a list of GPS track points.
 * Returns null when fewer than 2 points are provided (not enough data).
 *
 * All speed values in the returned object are in m/s to match DriverLocation.
 */
export function calculateStatsFromTrack(points: DriverLocation[]): DriverStats | null {
  if (points.length < 2) {
    return null;
  }

  // Sort ascending by timestamp so consecutive-distance calculations are correct.
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);

  // Top speed: highest GPS speed value across all points (m/s).
  let topSpeed = 0;
  for (const p of sorted) {
    if (p.speed > topSpeed) topSpeed = p.speed;
  }

  // Average moving speed: mean speed only for points where the vehicle is moving.
  const movingPoints = sorted.filter((p) => p.speed >= MOVING_THRESHOLD_MS);
  const avgMovingSpeedMs =
    movingPoints.length > 0
      ? movingPoints.reduce((sum, p) => sum + p.speed, 0) / movingPoints.length
      : 0;

  // Total driven distance: haversine sum of consecutive GPS point pairs (km).
  let totalDistanceKm = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    totalDistanceKm += haversineDistanceMeters([a.lat, a.lng], [b.lat, b.lng]) / 1000;
  }

  // Total drive time: duration from the first GPS point to the last (minutes).
  const totalDriveTimeMinutes =
    (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / 60_000;

  // Stop detection: count consecutive low-speed sequences lasting ≥ MIN_STOP_DURATION_MS.
  let stopCount = 0;
  let totalStopTimeMs = 0;
  let inStop = false;
  let stopStartTime = 0;

  for (let i = 0; i < sorted.length; i++) {
    const isStopped = sorted[i].speed < MOVING_THRESHOLD_MS;

    if (isStopped && !inStop) {
      // Entered a stopped state.
      inStop = true;
      stopStartTime = sorted[i].timestamp;
    } else if (!isStopped && inStop) {
      // Exited a stopped state — check if it was long enough to count.
      const durationMs = sorted[i - 1].timestamp - stopStartTime;
      if (durationMs >= MIN_STOP_DURATION_MS) {
        stopCount += 1;
        totalStopTimeMs += durationMs;
      }
      inStop = false;
    }
  }

  // Handle a stop that extends all the way to the last recorded point.
  if (inStop) {
    const durationMs = sorted[sorted.length - 1].timestamp - stopStartTime;
    if (durationMs >= MIN_STOP_DURATION_MS) {
      stopCount += 1;
      totalStopTimeMs += durationMs;
    }
  }

  const avgStopTimeSec = stopCount > 0 ? totalStopTimeMs / stopCount / 1000 : 0;

  return {
    topSpeed,
    avgMovingSpeedMs,
    totalDistanceKm,
    totalDriveTimeMinutes,
    stopCount,
    avgStopTimeSec,
  };
}

// ─── Firebase client ──────────────────────────────────────────────────────────

type TrackClient = {
  appendPoint: (runId: string, driverId: string, point: DriverLocation) => Promise<void>;
  loadPoints: (runId: string, driverId: string) => Promise<DriverLocation[]>;
};

export function createTrackClient(database: Database): TrackClient {
  return {
    appendPoint: async (runId, driverId, point) => {
      // push() creates a unique child key — track points are append-only.
      await push(child(ref(database), `tracks/${runId}/${driverId}`), point);
    },
    loadPoints: async (runId, driverId) => {
      const snapshot = await get(child(ref(database), `tracks/${runId}/${driverId}`));
      if (!snapshot.exists()) {
        return [];
      }
      return Object.values(snapshot.val() as Record<string, DriverLocation>);
    },
  };
}

// ─── Testable service functions ───────────────────────────────────────────────

export async function appendTrackPoint(
  client: TrackClient,
  runId: string,
  driverId: string,
  point: DriverLocation
) {
  await client.appendPoint(runId, driverId, point);
}

export async function loadDriverTrack(
  client: TrackClient,
  runId: string,
  driverId: string
): Promise<DriverLocation[]> {
  return client.loadPoints(runId, driverId);
}

// ─── Firebase-wired convenience functions ─────────────────────────────────────

export async function appendTrackPointWithFirebase(
  runId: string,
  driverId: string,
  point: DriverLocation
) {
  const database = getFirebaseDatabase();
  return appendTrackPoint(createTrackClient(database), runId, driverId, point);
}

export async function loadDriverTrackWithFirebase(
  runId: string,
  driverId: string
): Promise<DriverLocation[]> {
  const database = getFirebaseDatabase();
  return loadDriverTrack(createTrackClient(database), runId, driverId);
}
