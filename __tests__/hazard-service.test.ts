import {
  buildHazardToastMessage,
  dismissHazard,
  findDuplicateHazard,
  isVisibleHazard,
  reportHazard,
} from '@/lib/hazardService';

describe('hazardService', () => {
  const existing = [
    {
      id: 'hazard_1',
      type: 'pothole' as const,
      reportedBy: 'driver_1',
      reporterName: 'Jamie',
      lat: -26.2041,
      lng: 28.0473,
      timestamp: 1_000,
      dismissed: false,
      reportCount: 1,
    },
  ];

  it('filters visibility by dismissal and age', () => {
    expect(isVisibleHazard(existing[0], 1_000 + 10 * 60 * 1000)).toBe(true);
    expect(isVisibleHazard(existing[0], 1_000 + 31 * 60 * 1000)).toBe(false);
    expect(isVisibleHazard({ ...existing[0], dismissed: true }, 1_000 + 1_000)).toBe(false);
  });

  it('detects nearby duplicate hazards', () => {
    const duplicate = findDuplicateHazard(existing, 'pothole', [-26.20415, 28.04731], 30_000);
    expect(duplicate?.id).toBe('hazard_1');
    expect(findDuplicateHazard(existing, 'police', [-26.20415, 28.04731], 30_000)).toBeUndefined();
  });

  it('creates a new hazard when no duplicate exists', async () => {
    const client = {
      createHazardId: jest.fn(() => 'hazard_new'),
      writeHazard: jest.fn(),
    };

    const result = await reportHazard(
      client,
      {
        runId: 'run_1',
        reportedBy: 'driver_2',
        reporterName: 'Ava',
        type: 'police',
        point: [-26.205, 28.05],
        existingHazards: [],
      },
      { now: () => 5000 }
    );

    expect(result.deduped).toBe(false);
    expect(client.writeHazard).toHaveBeenCalledWith(
      'run_1',
      'hazard_new',
      expect.objectContaining({
        type: 'police',
        reportCount: 1,
      })
    );
  });

  it('increments report count for duplicate hazards', async () => {
    const client = {
      createHazardId: jest.fn(),
      writeHazard: jest.fn(),
    };

    const result = await reportHazard(
      client,
      {
        runId: 'run_1',
        reportedBy: 'driver_2',
        reporterName: 'Ava',
        type: 'pothole',
        point: [-26.20415, 28.04731],
        existingHazards: existing,
      },
      { now: () => 30_000 }
    );

    expect(result.deduped).toBe(true);
    expect(client.writeHazard).toHaveBeenCalledWith(
      'run_1',
      'hazard_1',
      expect.objectContaining({
        reportCount: 2,
      })
    );
  });

  it('builds a toast message for newly arrived hazards from other drivers', () => {
    const message = buildHazardToastMessage([], [
      {
        id: 'hazard_2',
        type: 'police',
        reportedBy: 'driver_2',
        reporterName: 'Ava',
        lat: -26.2041,
        lng: 28.0473,
        timestamp: 2_000,
        dismissed: false,
        reportCount: 1,
      },
    ], 'driver_1');

    expect(message).toBe('Ava reported police ahead.');
  });

  it('suppresses toast messages for the reporting driver and dismissed hazards', () => {
    expect(
      buildHazardToastMessage([], [
        {
          id: 'hazard_2',
          type: 'police',
          reportedBy: 'driver_1',
          reporterName: 'Jamie',
          lat: -26.2041,
          lng: 28.0473,
          timestamp: 2_000,
          dismissed: false,
          reportCount: 1,
        },
      ], 'driver_1')
    ).toBeNull();

    expect(
      buildHazardToastMessage([], [
        {
          id: 'hazard_2',
          type: 'police',
          reportedBy: 'driver_2',
          reporterName: 'Ava',
          lat: -26.2041,
          lng: 28.0473,
          timestamp: 2_000,
          dismissed: true,
          reportCount: 1,
        },
      ], 'driver_1')
    ).toBeNull();
  });

  it('dismisses a hazard for admins by writing a dismissed copy', async () => {
    const client = {
      writeHazard: jest.fn(),
    };

    await dismissHazard(client, {
      runId: 'run_1',
      hazard: existing[0],
    });

    expect(client.writeHazard).toHaveBeenCalledWith(
      'run_1',
      'hazard_1',
      expect.objectContaining({
        dismissed: true,
        reportCount: 1,
      })
    );
  });
});
