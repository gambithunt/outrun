import { RoutePoint } from '@/lib/geo';
import { RouteStopDraft, RouteStopKind } from '@/types/domain';

type Direction = 'up' | 'down';

let stopCounter = 0;

export function createRouteStop(
  kind: RouteStopKind,
  overrides: Partial<RouteStopDraft> = {}
): RouteStopDraft {
  stopCounter += 1;
  return {
    id: overrides.id ?? `${kind}-${stopCounter}`,
    kind,
    label:
      overrides.label ??
      (kind === 'start' ? 'Start' : kind === 'destination' ? 'Destination' : `Stop ${stopCounter}`),
    lat: overrides.lat ?? null,
    lng: overrides.lng ?? null,
    source: overrides.source ?? 'coordinates',
    placeId: overrides.placeId,
  };
}

export function parseCoordinateInput(input: string) {
  const match = input
    .trim()
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);

  if (!match) {
    return null;
  }

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}

export function isRouteStopComplete(stop: RouteStopDraft) {
  return typeof stop.lat === 'number' && typeof stop.lng === 'number';
}

export function buildRouteWaypointsFromStops(stops: RouteStopDraft[]): RoutePoint[] {
  return stops
    .filter(isRouteStopComplete)
    .map((stop) => [stop.lat as number, stop.lng as number] as RoutePoint);
}

export function getRoutePlannerStage(stops: RouteStopDraft[]) {
  const start = stops.find((stop) => stop.kind === 'start');
  if (!start || !isRouteStopComplete(start)) {
    return 'start' as const;
  }

  const destination = stops.find((stop) => stop.kind === 'destination');
  if (!destination || !isRouteStopComplete(destination)) {
    return 'destination' as const;
  }

  return 'stops' as const;
}

export function moveWaypointStop(
  stops: RouteStopDraft[],
  stopId: string,
  direction: Direction
): RouteStopDraft[] {
  const index = stops.findIndex((stop) => stop.id === stopId);

  if (index < 0 || stops[index]?.kind !== 'waypoint') {
    return stops;
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;

  if (targetIndex <= 0 || targetIndex >= stops.length - 1) {
    return stops;
  }

  const next = [...stops];
  const [item] = next.splice(index, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

export function reorderWaypointStopBefore(
  stops: RouteStopDraft[],
  draggedStopId: string,
  targetStopId: string
) {
  const draggedIndex = stops.findIndex((stop) => stop.id === draggedStopId);
  const targetIndex = stops.findIndex((stop) => stop.id === targetStopId);

  if (
    draggedIndex < 0 ||
    targetIndex < 0 ||
    stops[draggedIndex]?.kind !== 'waypoint' ||
    stops[targetIndex]?.kind !== 'waypoint' ||
    draggedStopId === targetStopId
  ) {
    return stops;
  }

  const next = [...stops];
  const [dragged] = next.splice(draggedIndex, 1);
  const nextTargetIndex = next.findIndex((stop) => stop.id === targetStopId);
  next.splice(nextTargetIndex, 0, dragged);
  return next;
}

export function reorderWaypointStopToEnd(stops: RouteStopDraft[], draggedStopId: string) {
  const draggedIndex = stops.findIndex((stop) => stop.id === draggedStopId);

  if (draggedIndex < 0 || stops[draggedIndex]?.kind !== 'waypoint') {
    return stops;
  }

  const destinationIndex = stops.findIndex((stop) => stop.kind === 'destination');
  if (destinationIndex < 0) {
    return stops;
  }

  const next = [...stops];
  const [dragged] = next.splice(draggedIndex, 1);
  const nextDestinationIndex = next.findIndex((stop) => stop.kind === 'destination');
  next.splice(nextDestinationIndex, 0, dragged);
  return next;
}

export function reorderWaypointStopToIndex(
  stops: RouteStopDraft[],
  draggedStopId: string,
  targetWaypointIndex: number
) {
  const waypointStops = stops.filter((stop) => stop.kind === 'waypoint');
  const draggedWaypointIndex = waypointStops.findIndex((stop) => stop.id === draggedStopId);

  if (draggedWaypointIndex < 0 || !Number.isInteger(targetWaypointIndex)) {
    return stops;
  }

  const clampedTargetIndex = Math.max(0, Math.min(targetWaypointIndex, waypointStops.length - 1));
  if (clampedTargetIndex === draggedWaypointIndex) {
    return stops;
  }

  const nextWaypointStops = [...waypointStops];
  const [draggedStop] = nextWaypointStops.splice(draggedWaypointIndex, 1);
  nextWaypointStops.splice(clampedTargetIndex, 0, draggedStop);

  const start = stops.find((stop) => stop.kind === 'start');
  const destination = stops.find((stop) => stop.kind === 'destination');

  return [start, ...nextWaypointStops, destination].filter(Boolean) as RouteStopDraft[];
}

export function swapStartAndDestinationStops(stops: RouteStopDraft[]) {
  const start = stops.find((stop) => stop.kind === 'start');
  const destination = stops.find((stop) => stop.kind === 'destination');

  if (!start || !destination) {
    return stops;
  }

  return stops.map((stop) => {
    if (stop.id === start.id) {
      return {
        ...stop,
        label: destination.label,
        lat: destination.lat,
        lng: destination.lng,
        source: destination.source,
        placeId: destination.placeId,
      };
    }

    if (stop.id === destination.id) {
      return {
        ...stop,
        label: start.label,
        lat: start.lat,
        lng: start.lng,
        source: start.source,
        placeId: start.placeId,
      };
    }

    return stop;
  });
}

export function removeWaypointStop(stops: RouteStopDraft[], stopId: string) {
  return stops.filter((stop) => stop.id !== stopId || stop.kind !== 'waypoint');
}

export function formatStopCoordinateLabel(lat: number, lng: number) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function countWaypointStops(stops: RouteStopDraft[]) {
  return stops.filter((stop) => stop.kind === 'waypoint').length;
}
