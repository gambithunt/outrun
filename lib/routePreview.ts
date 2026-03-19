import { getRouteBounds } from '@/lib/geo';
import { SummaryRoutePreview } from '@/types/domain';

type ProjectedPoint = {
  x: number;
  y: number;
};

export type RoutePreviewColorRun = {
  bucket: number;
  points: ProjectedPoint[];
};

export type RoutePreviewLayout = {
  projectedPoints: ProjectedPoint[];
  colorRuns: RoutePreviewColorRun[];
  contextPaths: ProjectedPoint[][];
};

export const ROUTE_PREVIEW_COLORS = ['#BDD0E0', '#7DAEDB', '#F2B36B', '#D9574B'] as const;

export const ROUTE_PREVIEW_LEGEND = [
  { label: 'Slow', color: ROUTE_PREVIEW_COLORS[0] },
  { label: 'Steady', color: ROUTE_PREVIEW_COLORS[1] },
  { label: 'Brisk', color: ROUTE_PREVIEW_COLORS[2] },
  { label: 'Fast', color: ROUTE_PREVIEW_COLORS[3] },
] as const;

export function projectRoutePreviewLayout(
  preview: SummaryRoutePreview | null,
  width: number,
  height: number,
  padding: number
): RoutePreviewLayout | null {
  if (!preview || preview.points.length < 2) {
    return null;
  }

  const bounds = getRouteBounds(preview.points);
  if (!bounds) {
    return null;
  }

  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const scale = Math.min(usableWidth / lngSpan, usableHeight / latSpan);
  const offsetX = (width - lngSpan * scale) / 2;
  const offsetY = (height - latSpan * scale) / 2;

  const projectedPoints = preview.points.map(([lat, lng]) => ({
    x: offsetX + (lng - bounds.minLng) * scale,
    y: height - (offsetY + (lat - bounds.minLat) * scale),
  }));

  const smoothedBuckets = smoothSpeedBuckets(
    preview.speedBuckets.length === preview.points.length - 1
      ? preview.speedBuckets
      : preview.points.slice(1).map(() => 1)
  );

  return {
    projectedPoints,
    colorRuns: buildColorRuns(projectedPoints, smoothedBuckets),
    contextPaths: buildContextPaths(projectedPoints, width, height, padding),
  };
}

export function smoothSpeedBuckets(speedBuckets: number[]) {
  if (speedBuckets.length < 3) {
    return speedBuckets.map(clampBucket);
  }

  const result = speedBuckets.map(clampBucket);

  for (let index = 1; index < result.length - 1; index += 1) {
    if (result[index - 1] === result[index + 1] && result[index] !== result[index - 1]) {
      result[index] = result[index - 1];
    }
  }

  const runs = buildBucketRuns(result);
  for (const run of runs) {
    if (run.length > 1) {
      continue;
    }

    const previous = runs[run.index - 1];
    const next = runs[run.index + 1];
    if (!previous && !next) {
      continue;
    }

    if (previous && next) {
      result[run.start] = previous.length >= next.length ? previous.bucket : next.bucket;
      continue;
    }

    result[run.start] = previous?.bucket ?? next?.bucket ?? result[run.start];
  }

  return result;
}

function clampBucket(bucket: number) {
  return Math.max(0, Math.min(ROUTE_PREVIEW_COLORS.length - 1, Math.round(bucket)));
}

function buildColorRuns(projectedPoints: ProjectedPoint[], speedBuckets: number[]) {
  if (projectedPoints.length < 2 || speedBuckets.length === 0) {
    return [];
  }

  const runs: RoutePreviewColorRun[] = [];
  let currentBucket = speedBuckets[0];
  let runStart = 0;

  for (let index = 1; index < speedBuckets.length; index += 1) {
    if (speedBuckets[index] !== currentBucket) {
      runs.push({
        bucket: currentBucket,
        points: projectedPoints.slice(runStart, index + 1),
      });
      currentBucket = speedBuckets[index];
      runStart = index;
    }
  }

  runs.push({
    bucket: currentBucket,
    points: projectedPoints.slice(runStart, projectedPoints.length),
  });

  return runs;
}

function buildBucketRuns(speedBuckets: number[]) {
  const runs: Array<{ bucket: number; start: number; length: number; index: number }> = [];
  let currentBucket = speedBuckets[0];
  let runStart = 0;

  for (let index = 1; index <= speedBuckets.length; index += 1) {
    if (index === speedBuckets.length || speedBuckets[index] !== currentBucket) {
      runs.push({
        bucket: currentBucket,
        start: runStart,
        length: index - runStart,
        index: runs.length,
      });
      currentBucket = speedBuckets[index];
      runStart = index;
    }
  }

  return runs;
}

function buildContextPaths(
  projectedPoints: ProjectedPoint[],
  width: number,
  height: number,
  padding: number
) {
  const paths: ProjectedPoint[][] = [
    [
      { x: padding, y: height * 0.24 },
      { x: width - padding, y: height * 0.2 },
    ],
    [
      { x: padding, y: height * 0.74 },
      { x: width - padding, y: height * 0.7 },
    ],
    [
      { x: width * 0.18, y: padding },
      { x: width * 0.22, y: height - padding },
    ],
    [
      { x: width * 0.72, y: padding },
      { x: width * 0.68, y: height - padding },
    ],
    createShiftedPolyline(projectedPoints, -28, -18),
    createShiftedPolyline(projectedPoints, 24, 16),
  ];

  return paths.filter((path) => path.length >= 2);
}

function createShiftedPolyline(points: ProjectedPoint[], dx: number, dy: number) {
  return points.map((point) => ({
    x: point.x + dx,
    y: point.y + dy,
  }));
}
