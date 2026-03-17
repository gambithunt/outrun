import { createFirebaseConnectivityController, isNetworkAvailable, subscribeToConnectivity } from '@/lib/connectivity';

describe('connectivity', () => {
  it('treats a connected and reachable network as online', () => {
    expect(isNetworkAvailable({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(isNetworkAvailable({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isNetworkAvailable({ isConnected: false, isInternetReachable: true })).toBe(false);
    expect(isNetworkAvailable({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('syncs Firebase connection mode from NetInfo updates', () => {
    const setNetworkAvailability = jest.fn();
    const listenerRefs: Array<(state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void> = [];
    const unsubscribe = jest.fn();

    const stop = subscribeToConnectivity(
      {
        addEventListener: (listener) => {
          listenerRefs.push(listener);
          return unsubscribe;
        },
      },
      { setNetworkAvailability },
      jest.fn()
    );

    listenerRefs[0]?.({ isConnected: false, isInternetReachable: false });
    listenerRefs[0]?.({ isConnected: true, isInternetReachable: true });

    expect(setNetworkAvailability).toHaveBeenNthCalledWith(1, false);
    expect(setNetworkAvailability).toHaveBeenNthCalledWith(2, true);

    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('maps connectivity changes to Firebase goOffline and goOnline calls', () => {
    const goOffline = jest.fn();
    const goOnline = jest.fn();
    const controller = createFirebaseConnectivityController(
      { name: 'mock-db' } as never,
      { goOffline, goOnline }
    );

    controller.setNetworkAvailability(false);
    controller.setNetworkAvailability(true);

    expect(goOffline).toHaveBeenCalledWith({ name: 'mock-db' });
    expect(goOnline).toHaveBeenCalledWith({ name: 'mock-db' });
  });
});
