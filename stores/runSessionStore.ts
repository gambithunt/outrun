import { create } from 'zustand';

import { RouteData, RunStatus } from '@/types/domain';

type SessionRole = 'admin' | 'driver' | null;
export type ConnectivityStatus = 'online' | 'offline' | 'reconnecting';

type RunSessionState = {
  runId: string | null;
  driverId: string | null;
  driverName: string | null;
  joinCode: string | null;
  role: SessionRole;
  runName: string | null;
  status: RunStatus | null;
  route: RouteData | null;
  isRunLoaded: boolean;
  connectivityStatus: ConnectivityStatus;
  setSession: (session: {
    runId: string;
    driverId: string;
    driverName: string;
    joinCode?: string | null;
    role: Exclude<SessionRole, null>;
      status: RunStatus;
  }) => void;
  setRunSnapshot: (run: {
    name?: string;
    status?: RunStatus | null;
    route?: RouteData | null;
  } | null) => void;
  setStatus: (status: RunStatus) => void;
  updateNetworkAvailability: (isOnline: boolean) => void;
  markRealtimeSynced: () => void;
  clearSession: () => void;
};

const initialState = {
  runId: null,
  driverId: null,
  driverName: null,
  joinCode: null,
  role: null,
  runName: null,
  status: null,
  route: null,
  isRunLoaded: false,
  connectivityStatus: 'online' as ConnectivityStatus,
};

export const useRunSessionStore = create<RunSessionState>((set) => ({
  ...initialState,
  setSession: (session) =>
    set({
      runId: session.runId,
      driverId: session.driverId,
      driverName: session.driverName,
      joinCode: session.joinCode ?? null,
      role: session.role,
      status: session.status,
    }),
  setRunSnapshot: (run) =>
    set((state) => ({
      runName: run?.name ?? state.runName,
      status: run?.status ?? state.status,
      route: run?.route ?? null,
      isRunLoaded: true,
    })),
  setStatus: (status) => set({ status }),
  updateNetworkAvailability: (isOnline) =>
    set((state) => ({
      connectivityStatus: isOnline
        ? state.connectivityStatus === 'offline'
          ? 'reconnecting'
          : 'online'
        : 'offline',
    })),
  markRealtimeSynced: () =>
    set((state) => ({
      connectivityStatus:
        state.connectivityStatus === 'reconnecting' ? 'online' : state.connectivityStatus,
    })),
  clearSession: () => set(initialState),
}));
