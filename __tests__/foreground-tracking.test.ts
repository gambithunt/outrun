import { startForegroundTracking } from '@/lib/foregroundTracking';

describe('foregroundTracking', () => {
  it('rejects when permission is denied', async () => {
    const locationModule = {
      Accuracy: { High: 'high' },
      requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied', granted: false })),
      watchPositionAsync: jest.fn(),
    };

    await expect(
      startForegroundTracking(
        { writeDriverLocation: jest.fn(), appendTrackPoint: jest.fn() },
        locationModule,
        { runId: 'run_1', driverId: 'driver_1' }
      )
    ).rejects.toThrow('Foreground location permission is required.');
  });

  it('writes the first location and throttles subsequent rapid updates', async () => {
    const writeDriverLocation = jest.fn();
    const appendTrackPoint = jest.fn(async () => undefined);
    const remove = jest.fn();
    const locationModule = {
      Accuracy: { High: 'high' },
      requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
      watchPositionAsync: jest.fn(async (_options, callback) => {
        await callback({
          coords: {
            latitude: -26.2041,
            longitude: 28.0473,
            speed: 0,
            heading: 0,
            accuracy: 5,
          },
          timestamp: 1000,
        });
        await callback({
          coords: {
            latitude: -26.204,
            longitude: 28.0474,
            speed: 0,
            heading: 0,
            accuracy: 5,
          },
          timestamp: 2500,
        });
        await callback({
          coords: {
            latitude: -26.203,
            longitude: 28.0475,
            speed: 0,
            heading: 0,
            accuracy: 5,
          },
          timestamp: 4000,
        });
        return { remove };
      }),
    };

    const stop = await startForegroundTracking(
      { writeDriverLocation, appendTrackPoint },
      locationModule,
      { runId: 'run_1', driverId: 'driver_1' }
    );

    expect(writeDriverLocation).toHaveBeenCalledTimes(2);
    expect(writeDriverLocation).toHaveBeenCalledWith(
      'run_1',
      'driver_1',
      expect.objectContaining({
        lat: -26.2041,
        lng: 28.0473,
      })
    );

    // appendTrackPoint must be called for every accepted location update.
    expect(appendTrackPoint).toHaveBeenCalledTimes(2);
    expect(appendTrackPoint).toHaveBeenCalledWith(
      'run_1',
      'driver_1',
      expect.objectContaining({
        lat: -26.2041,
        lng: 28.0473,
      })
    );

    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
