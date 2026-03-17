import { calculateRouteDistanceMeters, getRouteBounds, haversineDistanceMeters } from '@/lib/geo';

describe('geo utilities', () => {
  it('calculates haversine distance between two points', () => {
    const distance = haversineDistanceMeters([-26.2041, 28.0473], [-25.7479, 28.2293]);
    expect(Math.round(distance)).toBeGreaterThan(50_000);
    expect(Math.round(distance)).toBeLessThan(55_000);
  });

  it('sums route distances and computes bounds', () => {
    const points: [number, number][] = [
      [-26.2041, 28.0473],
      [-26.0, 28.1],
      [-25.7479, 28.2293],
    ];

    expect(calculateRouteDistanceMeters(points)).toBeGreaterThan(0);
    expect(getRouteBounds(points)).toEqual({
      minLat: -26.2041,
      maxLat: -25.7479,
      minLng: 28.0473,
      maxLng: 28.2293,
    });
  });
});
