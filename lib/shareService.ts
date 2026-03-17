import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { RefObject } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { getRouteBounds, type RoutePoint } from '@/lib/geo';
import { Run } from '@/types/domain';

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
    return `${driver.name} • ${driver.carMake} ${driver.carModel} • Top speed ${topSpeed} km/h`;
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

export function buildRouteThumbnailDataUri(points: RoutePoint[]) {
  if (points.length < 2) {
    return null;
  }

  const bounds = getRouteBounds(points);
  if (!bounds) {
    return null;
  }

  const width = 640;
  const height = 360;
  const padding = 32;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const xScale = usableWidth / lngSpan;
  const yScale = usableHeight / latSpan;
  const scale = Math.min(xScale, yScale);
  const offsetX = (width - lngSpan * scale) / 2;
  const offsetY = (height - latSpan * scale) / 2;

  const path = points
    .map(([lat, lng], index) => {
      const x = offsetX + (lng - bounds.minLng) * scale;
      const y = height - (offsetY + (lat - bounds.minLat) * scale);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="clubrun-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="36" fill="url(#clubrun-bg)" />
      <path d="${path}" fill="none" stroke="#f8fafc" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${offsetX + (points[0][1] - bounds.minLng) * scale}" cy="${height - (offsetY + (points[0][0] - bounds.minLat) * scale)}" r="12" fill="#22c55e" />
      <circle cx="${offsetX + (points[points.length - 1][1] - bounds.minLng) * scale}" cy="${height - (offsetY + (points[points.length - 1][0] - bounds.minLat) * scale)}" r="12" fill="#f97316" />
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function buildSummaryShareData(run: Run): SummaryShareData {
  if (!run.summary) {
    throw new Error('Summary data is required before sharing.');
  }

  return {
    title: run.name,
    subtitle: 'ClubRun convoy recap',
    generatedDate: formatDateLabel(run.summary.generatedAt),
    distanceLabel: `${run.summary.totalDistanceKm.toFixed(1)} km`,
    durationLabel: `${run.summary.totalDriveTimeMinutes} minutes`,
    hazardsLabel: `${run.summary.hazardSummary.total} hazards reported`,
    fuelLines: buildFuelLines(run),
    driverHighlights: buildDriverHighlights(run),
    hazardBreakdown: buildHazardBreakdown(run),
    routeThumbnailUri: buildRouteThumbnailDataUri(run.route?.points ?? []),
  };
}

export function buildSummaryPrintHtml(data: SummaryShareData) {
  const routeSection = data.routeThumbnailUri
    ? `<img src="${data.routeThumbnailUri}" alt="Route preview" style="width:100%;border-radius:24px;display:block;" />`
    : `<div style="padding:24px;border:1px solid #cbd5e1;border-radius:24px;background:#f8fafc;color:#475569;">Route preview unavailable for this run.</div>`;
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
            ${statCard('Hazards', data.hazardsLabel)}
          </div>
          <div class="panel">
            <h2>Fuel totals</h2>
            <ul>${listItems(data.fuelLines, 'No fuel data recorded.')}</ul>
          </div>
          <div class="panel">
            <h2>Driver highlights</h2>
            <ul>${listItems(data.driverHighlights, 'No driver summary data available.')}</ul>
          </div>
          <div class="panel">
            <h2>Hazard breakdown</h2>
            <ul>${listItems(data.hazardBreakdown, 'No hazards were reported.')}</ul>
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
