import { RefObject } from 'react';
import { View } from 'react-native';

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
    : `<div style="padding:24px;border:1px solid #cbd5e1;border-radius:24px;background:#f8fafc;color:#475569;">Route replay unavailable for this run.</div>`;
  const statCard = (label: string, value: string) => `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:18px;padding:16px;">
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;">${escapeHtml(label)}</div>
      <div style="margin-top:8px;font-size:24px;font-weight:700;color:#0f172a;">${escapeHtml(value)}</div>
    </div>
  `;
  const listItems = (items: string[], emptyLabel: string) =>
    items.length > 0
      ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
      : `<li>${escapeHtml(emptyLabel)}</li>`;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 24px; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; background: #ffffff; }
          .page { display: flex; flex-direction: column; gap: 24px; }
          .hero { background: linear-gradient(135deg, #0f172a, #1d4ed8); color: #f8fafc; border-radius: 28px; padding: 28px; }
          .subtitle { opacity: 0.82; margin-top: 6px; }
          .meta { margin-top: 16px; font-size: 14px; opacity: 0.78; }
          .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
          .panel { border: 1px solid #e2e8f0; border-radius: 24px; padding: 20px; background: #ffffff; }
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
          <div class="stats">
            ${statCard('Distance', data.distanceLabel)}
            ${statCard('Drive Time', data.durationLabel)}
            ${statCard('Hazards Called Out', data.hazardsLabel)}
          </div>
          <div class="panel">
            <h2>Fuel story</h2>
            <ul>${listItems(data.fuelLines, 'No fuel story recorded.')}</ul>
          </div>
          <div class="panel">
            <h2>Convoy spotlight</h2>
            <ul>${listItems(data.driverHighlights, 'No driver spotlight was captured for this run.')}</ul>
          </div>
          <div class="panel">
            <h2>Hazards called out</h2>
            <ul>${listItems(data.hazardBreakdown, 'No hazards were called out.')}</ul>
          </div>
        </div>
      </body>
    </html>
  `;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  if (typeof document === 'undefined') {
    throw new Error('Web sharing is unavailable during server rendering.');
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function shareSummaryAsPdf(run: Run) {
  const html = buildSummaryPrintHtml(buildSummaryShareData(run));
  downloadFile(`${run.name.replaceAll(/\s+/g, '-').toLowerCase()}-summary.html`, html, 'text/html');
}

export async function shareSummaryAsImage(
  run: Run,
  _targetRef: RefObject<View | null> | { current: unknown }
) {
  const data = buildSummaryShareData(run);
  const lines = [
    data.title,
    data.subtitle,
    `Generated ${data.generatedDate}`,
    `Distance: ${data.distanceLabel}`,
    `Drive time: ${data.durationLabel}`,
    `Hazards called out: ${data.hazardsLabel}`,
    '',
    'Convoy spotlight',
    ...(data.driverHighlights.length > 0
      ? data.driverHighlights
      : ['No driver spotlight was captured for this run.']),
  ];

  downloadFile(
    `${run.name.replaceAll(/\s+/g, '-').toLowerCase()}-summary.txt`,
    lines.join('\n'),
    'text/plain'
  );
}
