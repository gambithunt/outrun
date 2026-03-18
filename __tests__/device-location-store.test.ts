import * as Location from 'expo-location';

import { useDeviceLocationStore } from '@/stores/deviceLocationStore';

describe('deviceLocationStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDeviceLocationStore.setState({
      currentLocation: null,
      status: 'idle',
      bootstrapLocation: useDeviceLocationStore.getState().bootstrapLocation,
      refreshLocation: useDeviceLocationStore.getState().refreshLocation,
    });
  });

  it('prefers a fresh current position over a stale last known position during bootstrap', async () => {
    jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValue({
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
        speed: 0,
        heading: 0,
        accuracy: 5,
      },
      timestamp: 100,
    } as Awaited<ReturnType<typeof Location.getLastKnownPositionAsync>>);

    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
      coords: {
        latitude: -33.9249,
        longitude: 18.4241,
        speed: 0,
        heading: 0,
        accuracy: 5,
      },
      timestamp: 200,
    } as Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>);

    await useDeviceLocationStore.getState().bootstrapLocation();

    expect(useDeviceLocationStore.getState().currentLocation).toEqual([-33.9249, 18.4241]);
    expect(useDeviceLocationStore.getState().status).toBe('ready');
  });

  it('refreshes to a fresh current position even after a location is already ready', async () => {
    useDeviceLocationStore.setState({
      currentLocation: [37.7749, -122.4194],
      status: 'ready',
    });

    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
      coords: {
        latitude: -26.2041,
        longitude: 28.0473,
        speed: 0,
        heading: 0,
        accuracy: 5,
      },
      timestamp: 300,
    } as Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>);

    const nextLocation = await useDeviceLocationStore.getState().refreshLocation();

    expect(nextLocation).toEqual([-26.2041, 28.0473]);
    expect(useDeviceLocationStore.getState().currentLocation).toEqual([-26.2041, 28.0473]);
  });
});
