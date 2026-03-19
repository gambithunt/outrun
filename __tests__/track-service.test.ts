import { buildConvoyRoutePreview, calculateStatsFromTrack } from '@/lib/trackService';
import { DriverLocation } from '@/types/domain';

// Helper to build a minimal DriverLocation.
function pt(lat: number, lng: number, speed: number, timestampMs: number): DriverLocation {
  return { lat, lng, heading: 0, speed, accuracy: 5, timestamp: timestampMs };
}

describe('calculateStatsFromTrack', () => {
  it('returns null when fewer than 2 points are provided', () => {
    expect(calculateStatsFromTrack([])).toBeNull();
    expect(calculateStatsFromTrack([pt(0, 0, 10, 0)])).toBeNull();
  });

  it('identifies the correct top speed across all points', () => {
    const points = [
      pt(0, 0, 10, 0),
      pt(0, 0.001, 35, 2000),
      pt(0, 0.002, 20, 4000),
    ];
    const stats = calculateStatsFromTrack(points);
    expect(stats?.topSpeed).toBe(35);
  });

  it('computes average moving speed ignoring stopped points', () => {
    // speed=0.1 is below 0.5 threshold (stopped), speeds 10 and 20 are moving.
    const points = [
      pt(0, 0, 10, 0),
      pt(0, 0, 0.1, 2000),  // stopped — excluded from avg
      pt(0, 0.001, 20, 4000),
    ];
    const stats = calculateStatsFromTrack(points);
    // avg of [10, 20] = 15
    expect(stats?.avgMovingSpeedMs).toBeCloseTo(15, 5);
  });

  it('returns avgMovingSpeedMs of 0 when all points are below the moving threshold', () => {
    const points = [
      pt(0, 0, 0.1, 0),
      pt(0, 0, 0.2, 2000),
    ];
    const stats = calculateStatsFromTrack(points);
    expect(stats?.avgMovingSpeedMs).toBe(0);
  });

  it('computes total drive time from first to last timestamp (minutes)', () => {
    const points = [
      pt(0, 0, 10, 0),
      pt(0, 0, 10, 60_000),   // 1 minute later
      pt(0, 0, 10, 180_000),  // 3 minutes from start
    ];
    const stats = calculateStatsFromTrack(points);
    expect(stats?.totalDriveTimeMinutes).toBeCloseTo(3, 5);
  });

  it('counts a stop that is long enough', () => {
    // Stopped for 20 seconds (20 000 ms) — above the 15 000 ms threshold.
    const points = [
      pt(0, 0, 10, 0),
      pt(0, 0, 0.1, 2000),    // stop starts at t=2000
      pt(0, 0, 0.1, 12000),
      pt(0, 0, 0.1, 22000),   // stop ends here (20 000 ms of stop)
      pt(0, 0.001, 10, 24000),
    ];
    const stats = calculateStatsFromTrack(points);
    expect(stats?.stopCount).toBe(1);
    // Stop duration = 22000 - 2000 = 20 000 ms → 20 seconds
    expect(stats?.avgStopTimeSec).toBeCloseTo(20, 5);
  });

  it('does NOT count a stop shorter than 15 seconds', () => {
    // Stopped for only 10 seconds — below the threshold.
    const points = [
      pt(0, 0, 10, 0),
      pt(0, 0, 0.1, 2000),
      pt(0, 0, 0.1, 12000),   // 10 000 ms stopped → should not count
      pt(0, 0.001, 10, 14000),
    ];
    const stats = calculateStatsFromTrack(points);
    expect(stats?.stopCount).toBe(0);
    expect(stats?.avgStopTimeSec).toBe(0);
  });

  it('counts a stop that extends to the last point', () => {
    // Vehicle stops and the drive recording ends while stopped.
    const points = [
      pt(0, 0, 10, 0),
      pt(0, 0, 0.1, 2000),
      pt(0, 0, 0.1, 22000),  // still stopped at the last point
    ];
    const stats = calculateStatsFromTrack(points);
    expect(stats?.stopCount).toBe(1);
  });

  it('counts multiple stops correctly', () => {
    const points = [
      pt(0, 0, 10, 0),
      // First stop: 20 s
      pt(0, 0, 0.1, 5000),
      pt(0, 0, 0.1, 25000),
      pt(0, 0.001, 10, 27000),
      // Second stop: 30 s
      pt(0, 0.001, 0.1, 30000),
      pt(0, 0.001, 0.1, 60000),
      pt(0, 0.002, 10, 62000),
    ];
    const stats = calculateStatsFromTrack(points);
    expect(stats?.stopCount).toBe(2);
    // avg = (20 000 + 30 000) / 2 / 1000 = 25 s
    expect(stats?.avgStopTimeSec).toBeCloseTo(25, 5);
  });

  it('sorts points by timestamp before computing stats', () => {
    // Points are provided out of order — result should still be correct.
    const points = [
      pt(0, 0.001, 20, 4000),
      pt(0, 0, 10, 0),
      pt(0, 0, 0.1, 2000),
    ];
    const stats = calculateStatsFromTrack(points);
    // topSpeed across all = 20
    expect(stats?.topSpeed).toBe(20);
    // totalDriveTimeMinutes = (4000 - 0) / 60 000
    expect(stats?.totalDriveTimeMinutes).toBeCloseTo(4 / 60, 5);
  });

  it('computes a positive totalDistanceKm for points that are apart', () => {
    // Two points ~111 km apart (1 degree of latitude ≈ 111 km).
    const points = [
      pt(0, 0, 10, 0),
      pt(1, 0, 10, 60_000),
    ];
    const stats = calculateStatsFromTrack(points);
    expect(stats?.totalDistanceKm).toBeGreaterThan(100);
    expect(stats?.totalDistanceKm).toBeLessThan(120);
  });
});

describe('buildConvoyRoutePreview', () => {
  it('builds a simplified convoy route with per-segment speed buckets', () => {
    const preview = buildConvoyRoutePreview({
      driver_1: [
        pt(-26.2041, 28.0473, 8, 0),
        pt(-26.18, 28.08, 12, 15_000),
        pt(-26.12, 28.14, 18, 30_000),
        pt(-26.05, 28.2, 28, 45_000),
      ],
      driver_2: [
        pt(-26.203, 28.048, 6, 0),
        pt(-26.175, 28.083, 10, 15_000),
        pt(-26.11, 28.145, 16, 30_000),
        pt(-26.045, 28.205, 24, 45_000),
      ],
    });

    expect(preview?.points.length).toBe(4);
    expect(preview?.speedBuckets).toHaveLength(3);
    expect(preview?.speedBuckets.every((bucket) => bucket >= 0 && bucket <= 3)).toBe(true);
    expect(preview?.speedBuckets[preview.speedBuckets.length - 1]).toBe(3);
  });

  it('returns null when there is not enough real movement for a preview', () => {
    const preview = buildConvoyRoutePreview({
      driver_1: [pt(-26.2041, 28.0473, 0, 0), pt(-26.2041, 28.0473, 0, 15_000)],
    });

    expect(preview).toBeNull();
  });
});
