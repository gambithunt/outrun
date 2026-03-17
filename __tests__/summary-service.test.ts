import { buildHazardSummary, buildRunSummary, calculateFuelUsage, endRun } from '@/lib/summaryService';
import { Run } from '@/types/domain';

describe('summaryService', () => {
  const run: Run = {
    name: 'Sunrise Run',
    joinCode: '123456',
    adminId: 'driver_admin',
    status: 'active',
    createdAt: 0,
    startedAt: 60_000,
    endedAt: null,
    maxDrivers: 15,
    route: {
      points: [
        [-26.2041, 28.0473],
        [-25.7479, 28.2293],
      ],
      distanceMetres: 54_000,
      source: 'drawn',
    },
    drivers: {
      driver_1: {
        profile: {
          name: 'Jamie',
          carMake: 'BMW',
          carModel: 'M3',
          fuelType: 'petrol',
          fuelEfficiency: 28,
        },
        location: {
          lat: -26.2,
          lng: 28,
          heading: 0,
          speed: 25,
          accuracy: 5,
          timestamp: 120_000,
        },
        joinedAt: 60_000,
        leftAt: null,
        stats: {
          topSpeed: 30,
        },
      },
      driver_2: {
        profile: {
          name: 'Ava',
          carMake: 'Tesla',
          carModel: 'Model 3',
          fuelType: 'electric',
          fuelEfficiency: 4,
        },
        joinedAt: 60_000,
        leftAt: null,
      },
    },
    hazards: {
      hazard_1: {
        type: 'pothole',
        reportedBy: 'driver_1',
        reporterName: 'Jamie',
        lat: -26.2,
        lng: 28,
        timestamp: 100_000,
        dismissed: false,
        reportCount: 1,
      },
    },
  };

  it('calculates fuel usage and hazard summary', () => {
    expect(calculateFuelUsage(54, run.drivers!.driver_1)).toEqual(
      expect.objectContaining({
        fuelUsedLitres: expect.any(Number),
      })
    );
    expect(buildHazardSummary(run.hazards)).toEqual({
      total: 1,
      byType: {
        pothole: 1,
      },
    });
  });

  it('builds a run summary', () => {
    const summary = buildRunSummary(run, 3_660_000);

    expect(summary.totalDistanceKm).toBe(54);
    expect(summary.totalDriveTimeMinutes).toBe(60);
    expect(summary.driverStats.driver_1.name).toBe('Jamie');
    expect(summary.collectiveFuel.petrolLitres).toBeGreaterThan(0);
    expect(summary.collectiveFuel.electricKwh).toBeGreaterThan(0);
  });

  it('ends the run and persists summary data', async () => {
    const client = {
      writeSummary: jest.fn(),
      writeStatus: jest.fn(),
      writeEndedAt: jest.fn(),
    };

    const summary = await endRun(client, 'run_1', run, 3_660_000);

    expect(client.writeEndedAt).toHaveBeenCalledWith('run_1', 3_660_000);
    expect(client.writeStatus).toHaveBeenCalledWith('run_1', 'ended');
    expect(client.writeSummary).toHaveBeenCalledWith(
      'run_1',
      expect.objectContaining({
        totalDistanceKm: 54,
      })
    );
    expect(summary.totalDriveTimeMinutes).toBe(60);
  });
});
