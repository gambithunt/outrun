import { onValue } from 'firebase/database';

import {
  createRealtimeDriversClient,
  getDriverPresenceStatus,
  normalizeDriversSnapshot,
} from '@/lib/driverRealtime';

describe('driverRealtime', () => {
  it('normalizes driver snapshots', () => {
    const drivers = normalizeDriversSnapshot({
      driver_1: {
        profile: { name: 'Jamie', carMake: 'BMW', carModel: 'M3', fuelType: 'petrol' },
        location: { lat: -26.2, lng: 28.0, speed: 0, heading: 0, accuracy: 0, timestamp: 1 },
        joinedAt: 1,
        leftAt: null,
      },
    });

    expect(drivers).toEqual([
      expect.objectContaining({
        id: 'driver_1',
        name: 'Jamie',
      }),
    ]);
  });

  it('subscribes to realtime driver updates', () => {
    const unsubscribe = jest.fn();
    (onValue as jest.Mock).mockImplementationOnce((_path, onData) => {
      onData({
        exists: () => true,
        val: () => ({
          driver_1: {
            profile: { name: 'Jamie', carMake: 'BMW', carModel: 'M3', fuelType: 'petrol' },
            location: { lat: -26.2, lng: 28.0, speed: 0, heading: 0, accuracy: 0, timestamp: 1 },
            joinedAt: 1,
            leftAt: null,
          },
        }),
      });

      return unsubscribe;
    });

    const client = createRealtimeDriversClient({} as never);
    const handleData = jest.fn();
    const result = client.subscribeToDrivers('run_123', handleData);

    expect(handleData).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'driver_1',
        name: 'Jamie',
      }),
    ]);
    expect(result).toBe(unsubscribe);
  });

  it('derives active, stale, and awaiting-gps presence states', () => {
    expect(
      getDriverPresenceStatus(
        {
          id: 'driver_1',
          name: 'Jamie',
          location: {
            lat: -26.2,
            lng: 28.0,
            speed: 0,
            heading: 0,
            accuracy: 0,
            timestamp: 10_000,
          },
        },
        40_000
      )
    ).toBe('active');

    expect(
      getDriverPresenceStatus(
        {
          id: 'driver_1',
          name: 'Jamie',
          location: {
            lat: -26.2,
            lng: 28.0,
            speed: 0,
            heading: 0,
            accuracy: 0,
            timestamp: 10_000,
          },
        },
        90_000
      )
    ).toBe('stale');

    expect(
      getDriverPresenceStatus({
        id: 'driver_1',
        name: 'Jamie',
        location: null,
      })
    ).toBe('awaiting_gps');
  });
});
