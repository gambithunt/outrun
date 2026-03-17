import { mapLocationUpdateToDriverLocation, shouldWriteLocation } from '@/lib/locationService';

describe('locationService', () => {
  it('maps a location update into driver location shape', () => {
    const mapped = mapLocationUpdateToDriverLocation({
      coords: {
        latitude: -26.2041,
        longitude: 28.0473,
        speed: 20,
        heading: 45,
        accuracy: 5,
      },
      timestamp: 1234,
    });

    expect(mapped).toEqual({
      lat: -26.2041,
      lng: 28.0473,
      speed: 20,
      heading: 45,
      accuracy: 5,
      timestamp: 1234,
    });
  });

  it('throttles writes by timestamp interval', () => {
    expect(
      shouldWriteLocation(
        {
          lat: 0,
          lng: 0,
          heading: 0,
          speed: 0,
          accuracy: 0,
          timestamp: 1000,
        },
        {
          lat: 0,
          lng: 0,
          heading: 0,
          speed: 0,
          accuracy: 0,
          timestamp: 2500,
        }
      )
    ).toBe(false);

    expect(
      shouldWriteLocation(
        {
          lat: 0,
          lng: 0,
          heading: 0,
          speed: 0,
          accuracy: 0,
          timestamp: 1000,
        },
        {
          lat: 0,
          lng: 0,
          heading: 0,
          speed: 0,
          accuracy: 0,
          timestamp: 3200,
        }
      )
    ).toBe(true);
  });
});
