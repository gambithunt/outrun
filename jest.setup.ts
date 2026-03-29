const mockExpoRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};

(globalThis as { __mockExpoRouter?: typeof mockExpoRouter }).__mockExpoRouter = mockExpoRouter;
(globalThis as { __mockExpoRouterParams?: Record<string, string> }).__mockExpoRouterParams = {};
(globalThis as { __mockExpoRouterPathname?: string }).__mockExpoRouterPathname = '/';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-location', () => ({
  Accuracy: {
    High: 'high',
    Balanced: 'balanced',
  },
  geocodeAsync: jest.fn(async (address: string) => {
    if (address === 'Unknown') {
      return [];
    }
    return [
      {
        latitude: -26.2041,
        longitude: 28.0473,
      },
    ];
  }),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: {
      latitude: -26.2041,
      longitude: 28.0473,
      speed: 0,
      heading: 0,
      accuracy: 5,
    },
    timestamp: 1000,
  })),
  getLastKnownPositionAsync: jest.fn(async () => ({
    coords: {
      latitude: -26.2041,
      longitude: 28.0473,
      speed: 0,
      heading: 0,
      accuracy: 5,
    },
    timestamp: 900,
  })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
  })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
  })),
  reverseGeocodeAsync: jest.fn(async () => [
    {
      name: 'Main Rd',
      street: 'Main Rd',
      city: 'Johannesburg',
      region: 'Gauteng',
      country: 'South Africa',
    },
  ]),
  watchPositionAsync: jest.fn(async (_options, callback) => {
    callback({
      coords: {
        latitude: -26.2041,
        longitude: 28.0473,
        speed: 0,
        heading: 0,
        accuracy: 5,
      },
      timestamp: 1000,
    });
    return {
      remove: jest.fn(),
    };
  }),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => false),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({
    uri: '/tmp/clubrun-summary.pdf',
  })),
}));

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    Link: ({ children }: { children: React.ReactNode }) => children,
    Stack: Object.assign(
      ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
      {
        Screen: ({ name }: { name: string }) => React.createElement(Text, null, `screen:${name}`),
      }
    ),
    useFocusEffect: (cb: () => void) => { const { useEffect } = require('react'); useEffect(cb, []); },
    usePathname: () =>
      (globalThis as { __mockExpoRouterPathname?: string }).__mockExpoRouterPathname ?? '/',
    useRouter: () => (globalThis as { __mockExpoRouter?: typeof mockExpoRouter }).__mockExpoRouter,
    useLocalSearchParams: () =>
      (globalThis as { __mockExpoRouterParams?: Record<string, string> }).__mockExpoRouterParams ?? {},
  };
});

jest.mock('firebase/app', () => ({
  getApp: jest.fn(() => ({ name: 'mock-app' })),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: 'mock-app' })),
}));

const mockFirebaseAuth = {
  currentUser: null as { uid: string; isAnonymous?: boolean; email?: string | null } | null,
};

jest.mock('firebase/auth', () => ({
  EmailAuthProvider: {
    credential: jest.fn((email, password) => ({ email, password, providerId: 'password' })),
  },
  createUserWithEmailAndPassword: jest.fn(async (_auth, email: string) => {
    mockFirebaseAuth.currentUser = {
      uid: `created-${email}`,
      isAnonymous: false,
      email,
    };
    return {
      user: mockFirebaseAuth.currentUser,
    };
  }),
  connectAuthEmulator: jest.fn(),
  getReactNativePersistence: jest.fn(() => ({ type: 'LOCAL' })),
  getAuth: jest.fn(() => mockFirebaseAuth),
  initializeAuth: jest.fn(() => mockFirebaseAuth),
  linkWithCredential: jest.fn(async (user, credential) => {
    mockFirebaseAuth.currentUser = {
      uid: user.uid,
      isAnonymous: false,
      email: credential.email,
    };
    return {
      user: mockFirebaseAuth.currentUser,
    };
  }),
  signInWithEmailAndPassword: jest.fn(async (_auth, email: string) => {
    mockFirebaseAuth.currentUser = {
      uid: `signed-in-${email}`,
      isAnonymous: false,
      email,
    };
    return {
      user: mockFirebaseAuth.currentUser,
    };
  }),
  signInAnonymously: jest.fn(async () => {
    mockFirebaseAuth.currentUser = {
      uid: 'mock-auth-user',
      isAnonymous: true,
      email: null,
    };
    return {
      user: mockFirebaseAuth.currentUser,
    };
  }),
  signOut: jest.fn(async () => {
    mockFirebaseAuth.currentUser = null;
  }),
}));

jest.mock('firebase/database', () => ({
  child: jest.fn((_base, path) => path),
  connectDatabaseEmulator: jest.fn(),
  get: jest.fn(async () => ({
    exists: () => false,
    val: () => null,
  })),
  getDatabase: jest.fn(() => ({ name: 'mock-db' })),
  onValue: jest.fn((_refValue, onData) => {
    onData({
      exists: () => false,
      val: () => null,
    });
    return jest.fn();
  }),
  goOffline: jest.fn(),
  goOnline: jest.fn(),
  push: jest.fn(() => ({ key: 'mock-run-id' })),
  ref: jest.fn(() => 'mock-ref'),
  runTransaction: jest.fn(async (_refValue, updateFn) => ({
    committed: Boolean(updateFn({ maxDrivers: 15, drivers: {} })),
    snapshot: {
      exists: () => true,
      val: () => null,
    },
  })),
  set: jest.fn(async () => undefined),
}));

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');

  function MockComponent({
    children,
    label,
    onPress,
    testID,
  }: {
    children?: React.ReactNode;
    label: string;
    onPress?: () => void;
    testID?: string;
  }) {
    if (onPress) {
      return React.createElement(
        Pressable,
        { onPress, testID: testID ?? label },
        React.createElement(Text, null, label),
        children
      );
    }

    return React.createElement(React.Fragment, null, React.createElement(Text, null, label), children);
  }

  return {
    UserTrackingMode: {
      Follow: 'normal',
      FollowWithHeading: 'compass',
      FollowWithCourse: 'course',
    },
    MapView: ({
      children,
      onPress,
    }: {
      children?: React.ReactNode;
      onPress?: (feature: { geometry: { type: string; coordinates: [number, number] } }) => void;
    }) =>
      React.createElement(
        MockComponent,
        {
          label: 'mock-map-view',
          testID: 'mock-map-view',
          onPress: onPress
            ? () =>
                onPress({
                  geometry: {
                    type: 'Point',
                    coordinates: [28.0473, -26.2041],
                  },
                })
            : undefined,
        },
        children
      ),
    Camera: React.forwardRef(
      (
        {
          defaultSettings,
        }: {
          defaultSettings?: { centerCoordinate?: [number, number] };
        },
        _ref: unknown
      ) =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Text, null, 'mock-map-camera'),
          React.createElement(
            Text,
            { testID: 'mock-map-camera-center' },
            defaultSettings?.centerCoordinate?.join(',') ?? 'no-center'
          )
        )
    ),
    ShapeSource: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(MockComponent, { label: 'mock-shape-source' }, children),
    LineLayer: () => React.createElement(Text, null, 'mock-line-layer'),
    PointAnnotation: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(MockComponent, { label: 'mock-point-annotation' }, children),
    UserLocation: () => React.createElement(Text, null, 'mock-user-location'),
  };
});

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => '/tmp/clubrun-summary.png'),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => children,
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
