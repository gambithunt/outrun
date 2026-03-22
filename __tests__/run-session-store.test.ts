import { useRunSessionStore } from '@/stores/runSessionStore';

describe('runSessionStore', () => {
  beforeEach(() => {
    useRunSessionStore.getState().clearSession();
  });

  it('stores and clears the current session', () => {
    useRunSessionStore.getState().setSession({
      runId: 'run_123',
      driverId: 'driver_123',
      driverName: 'Jamie',
      joinCode: '654321',
      role: 'driver',
      status: 'draft',
    });

    expect(useRunSessionStore.getState()).toEqual(
      expect.objectContaining({
        runId: 'run_123',
        driverId: 'driver_123',
        driverName: 'Jamie',
        joinCode: '654321',
        role: 'driver',
        status: 'draft',
      })
    );

    useRunSessionStore.getState().setStatus('active');
    expect(useRunSessionStore.getState().status).toBe('active');
    useRunSessionStore.getState().setRunSnapshot({
      name: 'Sunrise Run',
      status: 'active',
      route: {
        points: [
          [-26.2041, 28.0473],
          [-25.7479, 28.2293],
        ],
        distanceMetres: 54000,
        source: 'drawn',
      },
    });
    expect(useRunSessionStore.getState().runName).toBe('Sunrise Run');
    expect(useRunSessionStore.getState().route?.points.length).toBe(2);
    expect(useRunSessionStore.getState().isRunLoaded).toBe(true);
    expect(useRunSessionStore.getState().connectivityStatus).toBe('online');

    useRunSessionStore.getState().setCurrentTab('drive');
    expect(useRunSessionStore.getState().currentTab).toBe('drive');

    useRunSessionStore.getState().setSignedInAccount({
      userId: 'uid_account',
      isAnonymous: false,
      email: 'jamie@example.com',
    });
    expect(useRunSessionStore.getState().account).toEqual({
      userId: 'uid_account',
      isAnonymous: false,
      email: 'jamie@example.com',
    });

    useRunSessionStore.getState().setScheduledRunHero({
      runId: 'run_future',
      name: 'Night Cruise',
      scheduledFor: 123456,
      visibility: 'club',
    });
    expect(useRunSessionStore.getState().scheduledRunHero).toEqual({
      runId: 'run_future',
      name: 'Night Cruise',
      scheduledFor: 123456,
      visibility: 'club',
    });

    useRunSessionStore.getState().updateNetworkAvailability(false);
    expect(useRunSessionStore.getState().connectivityStatus).toBe('offline');

    useRunSessionStore.getState().updateNetworkAvailability(true);
    expect(useRunSessionStore.getState().connectivityStatus).toBe('reconnecting');

    useRunSessionStore.getState().markRealtimeSynced();
    expect(useRunSessionStore.getState().connectivityStatus).toBe('online');

    useRunSessionStore.getState().clearSession();
    expect(useRunSessionStore.getState().runId).toBeNull();
    expect(useRunSessionStore.getState().driverId).toBeNull();
    expect(useRunSessionStore.getState().route).toBeNull();
    expect(useRunSessionStore.getState().account).toBeNull();
    expect(useRunSessionStore.getState().scheduledRunHero).toBeNull();
  });
});
