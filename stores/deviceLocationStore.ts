import * as Location from 'expo-location';
import { create } from 'zustand';

import { RoutePoint } from '@/lib/geo';

type DeviceLocationStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error';

type DeviceLocationState = {
  currentLocation: RoutePoint | null;
  status: DeviceLocationStatus;
  bootstrapLocation: () => Promise<void>;
};

export const useDeviceLocationStore = create<DeviceLocationState>((set, get) => ({
  currentLocation: null,
  status: 'idle',
  bootstrapLocation: async () => {
    const state = get();
    if (state.status === 'loading' || state.status === 'ready') {
      return;
    }

    set({ status: 'loading' });

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        set({ status: 'denied' });
        return;
      }

      const knownPosition = await Location.getLastKnownPositionAsync?.();
      if (knownPosition?.coords) {
        set({
          currentLocation: [knownPosition.coords.latitude, knownPosition.coords.longitude],
          status: 'ready',
        });
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({});
      set({
        currentLocation: [currentPosition.coords.latitude, currentPosition.coords.longitude],
        status: 'ready',
      });
    } catch {
      set({ status: 'error' });
    }
  },
}));
