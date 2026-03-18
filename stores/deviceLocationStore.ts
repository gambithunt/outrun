import * as Location from 'expo-location';
import { create } from 'zustand';

import { RoutePoint } from '@/lib/geo';

type DeviceLocationStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error';

type DeviceLocationState = {
  currentLocation: RoutePoint | null;
  status: DeviceLocationStatus;
  bootstrapLocation: () => Promise<void>;
  refreshLocation: () => Promise<RoutePoint | null>;
};

export const useDeviceLocationStore = create<DeviceLocationState>((set, get) => ({
  currentLocation: null,
  status: 'idle',
  bootstrapLocation: async () => {
    const state = get();
    if (state.status === 'loading' || state.status === 'ready') {
      return;
    }

    await loadDeviceLocation(set);
  },
  refreshLocation: async () => loadDeviceLocation(set, { forceFresh: true }),
}));

async function loadDeviceLocation(
  set: (partial: Partial<DeviceLocationState>) => void,
  options?: { forceFresh?: boolean }
) {
  set({ status: 'loading' });

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      set({ status: 'denied' });
      return null;
    }

    const accuracy =
      Location.Accuracy?.Balanced ?? Location.Accuracy?.High ?? undefined;

    if (!options?.forceFresh) {
      const knownPosition = await Location.getLastKnownPositionAsync?.();
      if (knownPosition?.coords) {
        set({
          currentLocation: [knownPosition.coords.latitude, knownPosition.coords.longitude],
          status: 'ready',
        });
      }
    }

    const currentPosition = await Location.getCurrentPositionAsync(
      accuracy ? { accuracy } : {}
    );
    const nextLocation: RoutePoint = [
      currentPosition.coords.latitude,
      currentPosition.coords.longitude,
    ];

    set({
      currentLocation: nextLocation,
      status: 'ready',
    });
    return nextLocation;
  } catch {
    if (!options?.forceFresh) {
      try {
        const knownPosition = await Location.getLastKnownPositionAsync?.();
        if (knownPosition?.coords) {
          const fallbackLocation: RoutePoint = [
            knownPosition.coords.latitude,
            knownPosition.coords.longitude,
          ];
          set({
            currentLocation: fallbackLocation,
            status: 'ready',
          });
          return fallbackLocation;
        }
      } catch {
        // Ignore the fallback failure and surface the original location failure.
      }
    }

    set({ status: 'error' });
    return null;
  }
}
