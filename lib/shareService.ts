import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { RefObject } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { type RoutePoint } from '@/lib/geo';
import {
  projectRoutePreviewLayout,
  ROUTE_PREVIEW_COLORS,
} from '@/lib/routePreview';
import { Run, SummaryRoutePreview } from '@/types/domain';

export type SummaryShareData = {
  title: string;
  subtitle: string;
  generatedDate: string;
  distanceLabel: string;
  durationLabel: string;
  hazardsLabel: string;
  fuelLines: string[];
  driverHighlights: string[];
  hazardBreakdown: string[];
  routePreview: SummaryRoutePreview | null;
  routeThumbnailUri: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDateLabel(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toTitleCase(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeFileUri(uri: string) {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

function buildDriverHighlights(run: Run) {
  return Object.values(run.summary?.driverStats ?? {}).map((driver) => {
    const topSpeed = driver.topSpeedKmh?.toFixed(1) ?? 'N/A';
    return `${driver.name} • ${driver.carMake} ${driver.carModel} • Peak speed ${topSpeed} km/h`;
  });
}

function buildHazardBreakdown(run: Run) {
  return Object.entries(run.summary?.hazardSummary.byType ?? {}).map(([type, count]) => {
    return `${toTitleCase(type)}: ${count}`;
  });
}

function buildFuelLines(run: Run) {
  const fuel = run.summary?.collectiveFuel;
  if (!fuel) {
    return [];
  }

  return [
    `Petrol: ${fuel.petrolLitres.toFixed(1)} L`,
    `Diesel: ${fuel.dieselLitres.toFixed(1)} L`,
    `Hybrid: ${fuel.hybridLitres.toFixed(1)} L`,
    `Electric: ${fuel.electricKwh.toFixed(1)} kWh`,
  ];
}

function buildFallbackRoutePreview(points: RoutePoint[]): SummaryRoutePreview | null {
  if (points.length < 2) {
    return null;
  }

  return {
    points,
    speedBuckets: points.slice(1).map(() => 1),
  };
}

function buildSummaryRoutePreview(run: Run): SummaryRoutePreview | null {
  const summaryPreview = run.summary?.routePreview;
  if (summaryPreview && summaryPreview.points.length >= 2) {
    return {
      points: summaryPreview.points,
      speedBuckets:
        summaryPreview.speedBuckets.length === summaryPreview.points.length - 1
          ? summaryPreview.speedBuckets
          : summaryPreview.points.slice(1).map(() => 1),
    };
  }

  return buildFallbackRoutePreview(run.route?.points ?? []);
}

export function buildRouteThumbnailDataUri(routePreview: SummaryRoutePreview | null) {
  const width = 640;
  const height = 360;
  const padding = 32;
  const layout = projectRoutePreviewLayout(routePreview, width, height, padding);
  if (!layout) {
    return null;
  }
  const routeBasePath = layout.projectedPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const contextPaths = layout.contextPaths
    .map(
      (path) =>
        `<path d="${path
          .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
          .join(' ')}" fill="none" stroke="#FFFFFF" stroke-opacity="0.72" stroke-width="6" stroke-linecap="round" />`
    )
    .join('');
  const routeRuns = layout.colorRuns
    .map((run) => {
      const stroke = ROUTE_PREVIEW_COLORS[run.bucket];
      return `<path d="${run.points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(' ')}" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join('');
  const startPoint = layout.projectedPoints[0];
  const endPoint = layout.projectedPoints[layout.projectedPoints.length - 1];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" rx="36" fill="#EEF3F8" />
      <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="28" fill="#E7EEF6" />
      ${contextPaths}
      <path d="${routeBasePath}" fill="none" stroke="#D2DCE8" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
      ${routeRuns}
      <circle cx="${startPoint.x.toFixed(2)}" cy="${startPoint.y.toFixed(2)}" r="8" fill="#FFFFFF" stroke="#6E90B2" stroke-width="3" />
      <circle cx="${endPoint.x.toFixed(2)}" cy="${endPoint.y.toFixed(2)}" r="8" fill="#FFFFFF" stroke="#0F172A" stroke-width="3" />
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function buildSummaryShareData(run: Run): SummaryShareData {
  if (!run.summary) {
    throw new Error('Summary data is required before sharing.');
  }

  const routePreview = buildSummaryRoutePreview(run);

  return {
    title: run.name,
    subtitle: 'ClubRun run recap',
    generatedDate: formatDateLabel(run.summary.generatedAt),
    distanceLabel: `${run.summary.totalDistanceKm.toFixed(1)} km`,
    durationLabel: `${run.summary.totalDriveTimeMinutes} min`,
    hazardsLabel: `${run.summary.hazardSummary.total} logged`,
    fuelLines: buildFuelLines(run),
    driverHighlights: buildDriverHighlights(run),
    hazardBreakdown: buildHazardBreakdown(run),
    routePreview,
    routeThumbnailUri: buildRouteThumbnailDataUri(routePreview),
  };
}

export function buildSummaryPrintHtml(data: SummaryShareData) {
  const routeSection = data.routeThumbnailUri
    ? `<img src="${data.routeThumbnailUri}" alt="Route preview" style="width:100%;border-radius:24px;display:block;" />`
    : `<div class="section empty-route">Route replay unavailable for this run.</div>`;
  const hazardChips = data.hazardBreakdown.length
    ? data.hazardBreakdown
        .slice(0, 4)
        .map(
          (item) =>
            `<span style="display:inline-flex;padding:8px 12px;border-radius:999px;background:#fde8ea;color:#0f172a;font-weight:700;">${escapeHtml(item)}</span>`
        )
        .join('')
    : `<div style="color:#64748b;">No hazards were called out.</div>`;
  const standoutLine = data.driverHighlights[0] ?? 'No convoy spotlight • • No driver spotlight was captured for this run.';
  const [standoutName, standoutVehicle, standoutDetail] = standoutLine.split(' • ');
  const standoutBody = `
    <div class="standout-name">${escapeHtml(standoutName ?? standoutLine)}</div>
    ${standoutVehicle ? `<div class="standout-vehicle">${escapeHtml(standoutVehicle)}</div>` : ''}
    <div class="standout-detail">${escapeHtml(standoutDetail ?? 'No driver spotlight was captured for this run.')}</div>
  `;
  const fuelRows = (data.fuelLines.length > 0 ? data.fuelLines : ['No fuel story recorded.'])
    .map((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) {
        return `<div class="metric-row"><div class="metric-label">${escapeHtml(line)}</div></div>`;
      }

      return `
        <div class="metric-row">
          <div class="metric-label">${escapeHtml(line.slice(0, separatorIndex))}</div>
          <div class="metric-value">${escapeHtml(line.slice(separatorIndex + 1).trim())}</div>
        </div>
      `;
    })
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 24px; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; background: #ffffff; }
          .page { display: flex; flex-direction: column; gap: 18px; }
          .hero { background: #e63946; color: #fff7f8; border-radius: 28px; padding: 28px; }
          .subtitle { opacity: 0.82; margin-top: 6px; }
          .meta { margin-top: 16px; font-size: 14px; opacity: 0.78; }
          .section { border: 1px solid #e2e8f0; border-radius: 24px; padding: 20px; background: #f8fafc; }
          .empty-route { min-height: 180px; display:flex; align-items:center; justify-content:center; color:#475569; background:#f8fafc; }
          .eyebrow { font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; font-weight:700; }
          .distance-label { margin-top: 6px; font-size:14px; color:#0f172a; font-weight:700; }
          .distance-value { margin-top: 8px; font-size:44px; line-height:48px; font-weight:800; color:#0f172a; }
          .divider { height:1px; background:#e2e8f0; margin:16px 0; }
          .metric-row { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
          .metric-label { color:#64748b; font-size:17px; }
          .metric-value { color:#0f172a; font-size:20px; line-height:24px; font-weight:700; text-align:right; }
          .standout-name { margin-top: 4px; font-size:28px; line-height:32px; font-weight:800; color:#0f172a; }
          .standout-vehicle { margin-top: 4px; font-size:18px; font-weight:600; color:#0f172a; }
          .standout-detail { margin-top: 6px; font-size:16px; line-height:22px; color:#64748b; }
          .chips { display: flex; flex-wrap: wrap; gap: 10px; }
          h2 { margin: 0 0 12px; font-size: 18px; }
          ul { margin: 0; padding-left: 18px; color: #334155; }
          li { margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="hero">
            <div style="font-size: 32px; font-weight: 800;">${escapeHtml(data.title)}</div>
            <div class="subtitle">${escapeHtml(data.subtitle)}</div>
            <div class="meta">Generated ${escapeHtml(data.generatedDate)}</div>
          </div>
          ${routeSection}
          <div class="section">
            <div class="eyebrow">Run recap</div>
            <div class="distance-label">Distance</div>
            <div class="distance-value">${escapeHtml(data.distanceLabel)}</div>
            <div class="divider"></div>
            <div class="metric-row">
              <div class="metric-label">Drive time</div>
              <div class="metric-value">${escapeHtml(data.durationLabel)}</div>
            </div>
            <div class="divider"></div>
            <div class="metric-row">
              <div class="metric-label">Hazards called out</div>
              <div class="metric-value">${escapeHtml(data.hazardsLabel)}</div>
            </div>
          </div>
          <div class="section">
            <div class="eyebrow">Convoy spotlight</div>
            ${standoutBody}
          </div>
          <div class="section">
            <div class="eyebrow">Fuel story</div>
            <div style="display:flex; flex-direction:column; gap:12px; margin-top:10px;">
              ${fuelRows}
            </div>
          </div>
          <div class="section">
            <div class="eyebrow" style="margin-bottom:12px;">Hazards called out</div>
            <div class="chips">${hazardChips}</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function shareSummaryAsPdf(
  run: Run,
  dependencies: {
    printModule?: Pick<typeof Print, 'printToFileAsync'>;
    sharingModule?: Pick<typeof Sharing, 'isAvailableAsync' | 'shareAsync'>;
  } = {}
) {
  const printModule = dependencies.printModule ?? Print;
  const sharingModule = dependencies.sharingModule ?? Sharing;

  if (!(await sharingModule.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  const html = buildSummaryPrintHtml(buildSummaryShareData(run));
  const file = await printModule.printToFileAsync({
    html,
  });

  await sharingModule.shareAsync(normalizeFileUri(file.uri), {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `${run.name} summary PDF`,
  });
}

export async function shareSummaryAsImage(
  run: Run,
  targetRef: RefObject<View | null> | { current: unknown },
  dependencies: {
    capture?: typeof captureRef;
    sharingModule?: Pick<typeof Sharing, 'isAvailableAsync' | 'shareAsync'>;
  } = {}
) {
  const capture = dependencies.capture ?? captureRef;
  const sharingModule = dependencies.sharingModule ?? Sharing;

  if (!targetRef.current) {
    throw new Error('Summary share card is not ready yet.');
  }

  if (!(await sharingModule.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  const _shareData = buildSummaryShareData(run);
  const imageUri = await capture(targetRef.current as Parameters<typeof captureRef>[0], {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });

  await sharingModule.shareAsync(normalizeFileUri(imageUri), {
    mimeType: 'image/png',
    UTI: 'public.png',
    dialogTitle: `${run.name} summary image`,
  });
}
