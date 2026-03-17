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
        fuelUsedLitres: 12.5,
        fuelType: 'petrol',
      },
      driver_2: {
        name: 'Ava',
        carMake: 'Toyota',
        carModel: 'GR86',
        topSpeedKmh: 101,
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
    expect(shareData.routeThumbnailUri).toContain('data:image/svg+xml;utf8,');
    expect(shareData.driverHighlights).toContain('Jamie • BMW M3 • Top speed 108.0 km/h');
    expect(shareData.hazardBreakdown).toEqual(['Pothole: 1', 'Debris: 1']);
  });

  it('falls back when a route thumbnail cannot be generated', () => {
    expect(buildRouteThumbnailDataUri([])).toBeNull();
    expect(buildSummaryShareData({ ...runFixture, route: undefined }).routeThumbnailUri).toBeNull();
  });

  it('builds printable HTML for PDF export', () => {
    const html = buildSummaryPrintHtml(buildSummaryShareData(runFixture));

    expect(html).toContain('Sunrise Run');
    expect(html).toContain('Distance');
    expect(html).toContain('Jamie');
    expect(html).toContain('Pothole: 1');
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
