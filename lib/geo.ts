export type RoutePoint = [number, number];

const EARTH_RADIUS_METERS = 6_371_000;

export function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(a: RoutePoint, b: RoutePoint) {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const inner =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(inner));
}

export function calculateRouteDistanceMeters(points: RoutePoint[]) {
  if (points.length < 2) {
    return 0;
  }

  return points.slice(1).reduce((total, point, index) => {
    return total + haversineDistanceMeters(points[index], point);
  }, 0);
}

export function getRouteBounds(points: RoutePoint[]) {
  if (points.length === 0) {
    return null;
  }

  return points.reduce(
    (bounds, [lat, lng]) => ({
      minLat: Math.min(bounds.minLat, lat),
      maxLat: Math.max(bounds.maxLat, lat),
      minLng: Math.min(bounds.minLng, lng),
      maxLng: Math.max(bounds.maxLng, lng),
    }),
    {
      minLat: points[0][0],
      maxLat: points[0][0],
      minLng: points[0][1],
      maxLng: points[0][1],
    }
  );
}

export function isValidRoutePoint(point: RoutePoint) {
  const [lat, lng] = point;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
