import NetInfo from '@react-native-community/netinfo';
import { Database, goOffline, goOnline } from 'firebase/database';

import { getFirebaseDatabase, hasFirebaseConfig } from '@/lib/firebase';

type NetInfoStateLike = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

type ConnectivityModule = {
  addEventListener: (listener: (state: NetInfoStateLike) => void) => () => void;
};

type FirebaseConnectivityController = {
  setNetworkAvailability: (isOnline: boolean) => void;
};

export function isNetworkAvailable(state: NetInfoStateLike) {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function createFirebaseConnectivityController(
  database: Database,
  controls: {
    goOffline: (database: Database) => void;
    goOnline: (database: Database) => void;
  } = {
    goOffline,
    goOnline,
  }
): FirebaseConnectivityController {
  return {
    setNetworkAvailability: (isOnline) => {
      if (isOnline) {
        controls.goOnline(database);
        return;
      }

      controls.goOffline(database);
    },
  };
}

export function subscribeToConnectivity(
  connectivityModule: ConnectivityModule,
  controller: FirebaseConnectivityController,
  onStatusChange: (isOnline: boolean) => void
) {
  return connectivityModule.addEventListener((state) => {
    const isOnline = isNetworkAvailable(state);
    controller.setNetworkAvailability(isOnline);
    onStatusChange(isOnline);
  });
}

export function subscribeToConnectivityWithFirebase(onStatusChange: (isOnline: boolean) => void) {
  if (!hasFirebaseConfig()) {
    return () => undefined;
  }

  const database = getFirebaseDatabase();
  return subscribeToConnectivity(
    NetInfo as unknown as ConnectivityModule,
    createFirebaseConnectivityController(database),
    onStatusChange
  );
}
