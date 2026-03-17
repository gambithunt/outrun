import { DriverLocation } from '@/types/domain';

type LocationCoords = {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
};

type LocationUpdateInput = {
  coords: LocationCoords;
  timestamp?: number | null;
};

export function mapLocationUpdateToDriverLocation(update: LocationUpdateInput): DriverLocation {
  return {
    lat: update.coords.latitude,
    lng: update.coords.longitude,
    heading: update.coords.heading ?? 0,
    speed: update.coords.speed ?? 0,
    accuracy: update.coords.accuracy ?? 0,
    timestamp: update.timestamp ?? Date.now(),
  };
}

export function shouldWriteLocation(
  previous: DriverLocation | null,
  next: DriverLocation,
  minIntervalMs = 2000
) {
  if (!previous) {
    return true;
  }

  return next.timestamp - previous.timestamp >= minIntervalMs;
}
