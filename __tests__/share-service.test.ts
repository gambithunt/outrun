import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import {
  buildSummaryPrintHtml,
  buildSummaryShareData,
  buildRouteThumbnailDataUri,
  shareSummaryAsImage,
  shareSummaryAsPdf,
} from '@/lib/shareService';
import { Run } from '@/types/domain';

const runFixture: Run = {
  name: 'Sunrise Run',
  joinCode: '123456',
  adminId: 'admin_1',
  status: 'ended',
  createdAt: 100,
  startedAt: 200,
  endedAt: 300,
  maxDrivers: 25,
  route: {
    points: [
      [-26.2041, 28.0473],
      [-26.1, 28.15],
      [-25.7479, 28.2293],
    ],
    distanceMetres: 54000,
    source: 'drawn',
  },
  summary: {
    totalDistanceKm: 54,
    totalDriveTimeMinutes: 60,
    driverStats: {
      driver_1: {
        name: 'Jamie',
        carMake: 'BMW',
        carModel: 'M3',
        topSpeedKmh: 108,
        avgMovingSpeedKmh: 84,
        totalDistanceKm: 54,
        totalDriveTimeMinutes: 60,
        stopCount: 2,
        avgStopTimeSec: 45,
        fuelUsedLitres: 12.5,
        fuelType: 'petrol',
      },
      driver_2: {
        name: 'Ava',
        carMake: 'Toyota',
        carModel: 'GR86',
        topSpeedKmh: 101,
        avgMovingSpeedKmh: 78,
        totalDistanceKm: 54,
        totalDriveTimeMinutes: 60,
        stopCount: 2,
        avgStopTimeSec: 52,
        fuelUsedLitres: 10.2,
        fuelType: 'petrol',
      },
    },
    collectiveFuel: {
      petrolLitres: 22.7,
      dieselLitres: 0,
      hybridLitres: 0,
      electricKwh: 0,
    },
    hazardSummary: {
      total: 2,
      byType: {
        pothole: 1,
        debris: 1,
      },
    },
    routePreview: {
      points: [
        [-26.2041, 28.0473],
        [-26.15, 28.1],
        [-26.0, 28.17],
        [-25.7479, 28.2293],
      ],
      speedBuckets: [0, 2, 3],
    },
    generatedAt: Date.UTC(2026, 2, 17, 8, 30, 0),
  },
};

describe('shareService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds share data including a route thumbnail and driver highlights', () => {
    const shareData = buildSummaryShareData(runFixture);

    expect(shareData.title).toBe('Sunrise Run');
    expect(shareData.routePreview).toEqual(runFixture.summary?.routePreview);
    expect(shareData.routeThumbnailUri).toContain('data:image/svg+xml;utf8,');
    expect(shareData.driverHighlights).toContain('Jamie • BMW M3 • Peak speed 108.0 km/h');
    expect(shareData.subtitle).toBe('ClubRun run recap');
    expect(shareData.durationLabel).toBe('60 min');
    expect(shareData.hazardsLabel).toBe('2 logged');
    expect(shareData.hazardBreakdown).toEqual(['Pothole: 1', 'Debris: 1']);
  });

  it('falls back when a route thumbnail cannot be generated', () => {
    expect(buildRouteThumbnailDataUri(null)).toBeNull();
    expect(
      buildSummaryShareData({
        ...runFixture,
        route: undefined,
        summary: {
          ...runFixture.summary!,
          routePreview: undefined,
        },
      }).routeThumbnailUri
    ).toBeNull();
  });

  it('builds printable HTML for PDF export', () => {
    const html = buildSummaryPrintHtml(buildSummaryShareData(runFixture));

    expect(html).toContain('Sunrise Run');
    expect(html).toContain('Distance');
    expect(html).toContain('Jamie');
    expect(html).toContain('Pothole: 1');
    expect(html).toContain('Convoy spotlight');
    expect(html).toContain('Fuel story');
    expect(html).toContain('Hazards called out');
    expect(html).not.toContain('panel-grid');
    expect(html).not.toContain('repeat(2, 1fr)');
  });

  it('shares a PDF generated from the summary HTML', async () => {
    await shareSummaryAsPdf(runFixture);

    expect(Print.printToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Sunrise Run'),
      })
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///tmp/clubrun-summary.pdf',
      expect.objectContaining({
        mimeType: 'application/pdf',
      })
    );
  });

  it('captures and shares a PNG image from the share card ref', async () => {
    const target = { current: { node: 'share-card' } };

    await shareSummaryAsImage(runFixture, target);

    expect(captureRef).toHaveBeenCalledWith(
      target.current,
      expect.objectContaining({
        format: 'png',
        result: 'tmpfile',
      })
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///tmp/clubrun-summary.png',
      expect.objectContaining({
        mimeType: 'image/png',
      })
    );
  });
});
