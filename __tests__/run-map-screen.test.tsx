jest.mock('@/lib/runRealtime', () => ({
  subscribeToRunWithFirebase: jest.fn(),
}));

jest.mock('@/lib/driverRealtime', () => ({
  getDriverPresenceStatus: jest.requireActual('@/lib/driverRealtime').getDriverPresenceStatus,
  subscribeToDriversWithFirebase: jest.fn(),
}));

jest.mock('@/lib/foregroundTracking', () => ({
  startForegroundTrackingWithExpo: jest.fn(),
}));

jest.mock('@/lib/driverManagementService', () => ({
  removeDriverWithFirebase: jest.fn(),
}));

jest.mock('@/lib/backgroundTracking', () => ({
  startBackgroundTrackingWithExpo: jest.fn(),
  stopBackgroundTrackingWithExpo: jest.fn(),
}));

jest.mock('@/lib/hazardRealtime', () => ({
  subscribeToHazardsWithFirebase: jest.fn(),
  formatHazardLabel: jest.requireActual('@/lib/hazardRealtime').formatHazardLabel,
}));

jest.mock('@/lib/hazardService', () => ({
  HAZARD_LABELS: jest.requireActual('@/lib/hazardService').HAZARD_LABELS,
  buildHazardToastMessage: jest.requireActual('@/lib/hazardService').buildHazardToastMessage,
  dismissHazardWithFirebase: jest.fn(),
  isVisibleHazard: jest.requireActual('@/lib/hazardService').isVisibleHazard,
  reportHazardWithFirebase: jest.fn(),
}));

jest.mock('@/lib/summaryService', () => ({
  endRunWithFirebase: jest.fn(),
}));

jest.mock('@/lib/runService', () => ({
  startDriveWithFirebase: jest.fn(),
}));

jest.mock('@/lib/routeService', () => ({
  reopenRoutePlannerFromLobbyWithFirebase: jest.fn(),
}));

jest.mock('@/lib/connectivity', () => ({
  subscribeToConnectivityWithFirebase: jest.fn(),
}));

jest.mock('@/lib/adminRunHistory', () => ({
  updateAdminRunStatusInHistory: jest.fn(),
}));

import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import RunMapScreen from '@/app/run/[id]/map';
import {
  startBackgroundTrackingWithExpo,
  stopBackgroundTrackingWithExpo,
} from '@/lib/backgroundTracking';
import { subscribeToConnectivityWithFirebase } from '@/lib/connectivity';
import { removeDriverWithFirebase } from '@/lib/driverManagementService';
import { subscribeToDriversWithFirebase } from '@/lib/driverRealtime';
import { startForegroundTrackingWithExpo } from '@/lib/foregroundTracking';
import { subscribeToHazardsWithFirebase } from '@/lib/hazardRealtime';
import { dismissHazardWithFirebase, reportHazardWithFirebase } from '@/lib/hazardService';
import { reopenRoutePlannerFromLobbyWithFirebase } from '@/lib/routeService';
import { subscribeToRunWithFirebase } from '@/lib/runRealtime';
import { endRunWithFirebase } from '@/lib/summaryService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { renderWithProviders } from '@/test-utils/render';

function mockLiveSubscriptions() {
  (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
    onData({
      name: 'Night Run',
      status: 'active',
    });
    return jest.fn();
  });
  (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
    onData([]);
    return jest.fn();
  });
  (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
    onData([]);
    return jest.fn();
  });
}

async function enableTracking(screen: ReturnType<typeof renderWithProviders>) {
  fireEvent.press(screen.getByTestId('button-enable-location-tracking'));
  await waitFor(() => expect(startForegroundTrackingWithExpo).toHaveBeenCalled());
}

describe('RunMapScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRunSessionStore.getState().clearSession();
    useRunSessionStore.getState().setSession({
      runId: 'run_900',
      driverId: 'driver_1',
      driverName: 'Jamie',
      joinCode: '123456',
      role: 'driver',
      status: 'draft',
    });
    (globalThis as { __mockExpoRouterParams?: Record<string, string> }).__mockExpoRouterParams = {
      id: 'run_900',
    };
    (subscribeToConnectivityWithFirebase as jest.Mock).mockImplementation(() => jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads the run route and status from realtime updates', async () => {
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
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

      return jest.fn();
    });
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([
        {
          id: 'driver_1',
          name: 'Jamie',
          location: {
            lat: -26.2041,
            lng: 28.0473,
            heading: 0,
            speed: 0,
            accuracy: 0,
            timestamp: Date.now(),
          },
        },
      ]);
      return jest.fn();
    });
    (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([
        {
          id: 'hazard_1',
          type: 'pothole',
          reportedBy: 'driver_1',
          reporterName: 'Jamie',
          lat: -26.2041,
          lng: 28.0473,
          timestamp: Date.now(),
          dismissed: false,
          reportCount: 1,
        },
      ]);
      return jest.fn();
    });
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });
    (reportHazardWithFirebase as jest.Mock).mockResolvedValue({
      hazardId: 'hazard_2',
      deduped: false,
    });

    const screen = renderWithProviders(<RunMapScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('text-enable-tracking-title')).toHaveTextContent(
        'Enable location tracking'
      )
    );
    expect(startForegroundTrackingWithExpo).not.toHaveBeenCalled();
    await enableTracking(screen);

    await waitFor(() =>
      expect(screen.getByTestId('text-run-name')).toHaveTextContent('Sunrise Run')
    );
    expect(screen.getByTestId('text-run-route-points')).toHaveTextContent('Route points: 2');
    expect(screen.getByTestId('text-driver-count')).toHaveTextContent('Drivers: 1');
    expect(screen.getByTestId('text-hazard-count')).toHaveTextContent('Hazards: 1');
    expect(screen.getByTestId('text-tracking-state')).toHaveTextContent(
      'Tracking: background enabled'
    );
    expect(screen.getByTestId('text-driver-presence-driver_1')).toHaveTextContent('Jamie • active');
    expect(screen.getByTestId('live-run-map')).toBeTruthy();
  });

  it('shows subscription errors', async () => {
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, _onData, onError) => {
      onError(new Error('Connection lost'));
      return jest.fn();
    });
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (startForegroundTrackingWithExpo as jest.Mock).mockRejectedValue(new Error('Permission denied'));

    const screen = renderWithProviders(<RunMapScreen />);

    await enableTracking(screen);

    await waitFor(() =>
      expect(screen.getByTestId('text-run-error')).toHaveTextContent(/Connection lost|Permission denied|Unable to start/)
    );
  });

  it('waits for explicit user consent before starting GPS tracking', async () => {
    mockLiveSubscriptions();
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });

    const screen = renderWithProviders(<RunMapScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('text-enable-tracking-title')).toHaveTextContent(
        'Enable location tracking'
      )
    );
    expect(screen.getByTestId('text-enable-tracking-body')).toHaveTextContent(
      /Turn on location sharing/
    );
    expect(startForegroundTrackingWithExpo).not.toHaveBeenCalled();
    expect(startBackgroundTrackingWithExpo).not.toHaveBeenCalled();
  });

  it('lets admins reopen the route planner from the lobby only after confirmation', async () => {
    useRunSessionStore.getState().setSession({
      runId: 'run_900',
      driverId: 'driver_admin',
      driverName: 'Admin',
      joinCode: '123456',
      role: 'admin',
      status: 'ready',
    });
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
        name: 'Sunrise Run',
        status: 'ready',
        route: {
          points: [
            [-26.2041, 28.0473],
            [-25.7479, 28.2293],
          ],
          distanceMetres: 54000,
          source: 'drawn',
        },
      });

      return jest.fn();
    });
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (reopenRoutePlannerFromLobbyWithFirebase as jest.Mock).mockResolvedValue(undefined);

    const screen = renderWithProviders(<RunMapScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('button-edit-route')).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId('button-edit-route'));
    await waitFor(() =>
      expect(screen.getByTestId('button-confirm-edit-route')).toBeTruthy()
    );
    fireEvent.press(screen.getByTestId('button-confirm-edit-route'));

    await waitFor(() =>
      expect(reopenRoutePlannerFromLobbyWithFirebase).toHaveBeenCalledWith('run_900')
    );
    expect(
      (
        globalThis as {
          __mockExpoRouter?: { replace: jest.Mock };
        }
      ).__mockExpoRouter?.replace
    ).toHaveBeenCalledWith('/create/route?runId=run_900&joinCode=123456');
  });

  it('reports a hazard from the current driver location', async () => {
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
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
      return jest.fn();
    });
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([
        {
          id: 'driver_1',
          name: 'Jamie',
          location: {
            lat: -26.2041,
            lng: 28.0473,
            heading: 0,
            speed: 0,
            accuracy: 0,
            timestamp: Date.now(),
          },
        },
      ]);
      return jest.fn();
    });
    (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });
    (reportHazardWithFirebase as jest.Mock).mockResolvedValue({
      hazardId: 'hazard_2',
      deduped: false,
    });

    const screen = renderWithProviders(<RunMapScreen />);

    await waitFor(() => screen.getByTestId('text-driver-count'));
    await enableTracking(screen);
    fireEvent.press(screen.getByTestId('button-open-hazard-actions'));
    fireEvent.press(screen.getByTestId('button-hazard-pothole'));

    await waitFor(() =>
      expect(reportHazardWithFirebase).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run_900',
          reportedBy: 'driver_1',
          type: 'pothole',
        })
      )
    );
  });

  it('shows end run for admins and ends the run', async () => {
    useRunSessionStore.getState().setSession({
      runId: 'run_900',
      driverId: 'driver_admin',
      driverName: 'Admin',
      joinCode: '123456',
      role: 'admin',
      status: 'active',
    });
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
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
      return jest.fn();
    });
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });
    (endRunWithFirebase as jest.Mock).mockResolvedValue({});

    const screen = renderWithProviders(<RunMapScreen />);

    await enableTracking(screen);
    fireEvent.press(screen.getByTestId('button-driver-panel-toggle'));
    await waitFor(() => expect(screen.getByTestId('button-end-run')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-end-run'));
    fireEvent.press(screen.getByTestId('button-confirm-end-run'));

    await waitFor(() =>
      expect(endRunWithFirebase).toHaveBeenCalledWith(
        'run_900',
        expect.objectContaining({
          name: 'Sunrise Run',
        })
      )
    );
  });

  it('falls back to foreground-only tracking when background access is denied', async () => {
    mockLiveSubscriptions();
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: false,
      reason: 'permission_denied',
    });

    const screen = renderWithProviders(<RunMapScreen />);

    await enableTracking(screen);

    await waitFor(() =>
      expect(screen.getByTestId('text-tracking-state')).toHaveTextContent(
        'Tracking: foreground only'
      )
    );
    expect(screen.getByTestId('text-tracking-detail')).toHaveTextContent(
      /Allow Always/
    );
  });

  it('stops background tracking when the map screen unmounts', async () => {
    mockLiveSubscriptions();
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });

    const screen = renderWithProviders(<RunMapScreen />);

    await waitFor(() => expect(screen.getByTestId('live-run-map')).toBeTruthy());
    await enableTracking(screen);
    screen.unmount();

    await waitFor(() => expect(stopBackgroundTrackingWithExpo).toHaveBeenCalledTimes(1));
  });

  it('shows an offline banner when connectivity is lost', async () => {
    let onConnectivityChange: ((isOnline: boolean) => void) | undefined;
    (subscribeToConnectivityWithFirebase as jest.Mock).mockImplementation((callback) => {
      onConnectivityChange = callback;
      return jest.fn();
    });
    mockLiveSubscriptions();
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });

    const screen = renderWithProviders(<RunMapScreen />);

    await waitFor(() => expect(screen.getByTestId('live-run-map')).toBeTruthy());
    await enableTracking(screen);
    await act(async () => {
      onConnectivityChange?.(false);
    });

    await waitFor(() =>
      expect(screen.getByTestId('text-connectivity-banner')).toHaveTextContent(
        'Offline. Live updates are paused until your connection returns.'
      )
    );
  });

  it('shows reconnecting state until realtime data syncs again', async () => {
    let onConnectivityChange: ((isOnline: boolean) => void) | undefined;
    let onRunData: ((run: Record<string, unknown>) => void) | undefined;
    (subscribeToConnectivityWithFirebase as jest.Mock).mockImplementation((callback) => {
      onConnectivityChange = callback;
      return jest.fn();
    });
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onRunData = onData;
      onData({
        name: 'Night Run',
        status: 'active',
      });
      return jest.fn();
    });
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });

    const screen = renderWithProviders(<RunMapScreen />);

    await waitFor(() => expect(screen.getByTestId('live-run-map')).toBeTruthy());
    await enableTracking(screen);
    await act(async () => {
      onConnectivityChange?.(false);
      onConnectivityChange?.(true);
    });

    await waitFor(() =>
      expect(screen.getByTestId('text-connectivity-banner')).toHaveTextContent(
        'Reconnecting… syncing live convoy updates.'
      )
    );

    await act(async () => {
      onRunData?.({
        name: 'Night Run',
        status: 'active',
      });
    });

    await waitFor(() => expect(screen.queryByTestId('text-connectivity-banner')).toBeNull());
  });

  it('shows a toast for hazards reported by other drivers after initial load', async () => {
    let onHazardsData:
      | ((hazards: Array<Record<string, unknown>>) => void)
      | undefined;
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
        name: 'Night Run',
        status: 'active',
      });
      return jest.fn();
    });
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onHazardsData = onData;
      onData([]);
      return jest.fn();
    });
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });

    const screen = renderWithProviders(<RunMapScreen />);

    await waitFor(() => expect(screen.getByTestId('live-run-map')).toBeTruthy());
    await enableTracking(screen);

    await act(async () => {
      onHazardsData?.([
        {
          id: 'hazard_2',
          type: 'police',
          reportedBy: 'driver_2',
          reporterName: 'Ava',
          lat: -26.2041,
          lng: 28.0473,
          timestamp: Date.now(),
          dismissed: false,
          reportCount: 1,
        },
      ]);
    });

    await waitFor(() =>
      expect(screen.getByTestId('toast-hazard-event')).toHaveTextContent(
        /Ava reported police ahead/
      )
    );
  });

  it('suppresses hazard toast messages for the current driver', async () => {
    let onHazardsData:
      | ((hazards: Array<Record<string, unknown>>) => void)
      | undefined;
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
        name: 'Night Run',
        status: 'active',
      });
      return jest.fn();
    });
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onHazardsData = onData;
      onData([]);
      return jest.fn();
    });
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });

    const screen = renderWithProviders(<RunMapScreen />);

    await waitFor(() => expect(screen.getByTestId('live-run-map')).toBeTruthy());
    await enableTracking(screen);

    await act(async () => {
      onHazardsData?.([
        {
          id: 'hazard_2',
          type: 'police',
          reportedBy: 'driver_1',
          reporterName: 'Jamie',
          lat: -26.2041,
          lng: 28.0473,
          timestamp: Date.now(),
          dismissed: false,
          reportCount: 1,
        },
      ]);
    });

    expect(screen.queryByTestId('toast-hazard-event')).toBeNull();
  });

  it('shows admin-only hazard dismissal controls and dismisses a hazard', async () => {
    useRunSessionStore.getState().setSession({
      runId: 'run_900',
      driverId: 'driver_admin',
      driverName: 'Admin',
      joinCode: '123456',
      role: 'admin',
      status: 'active',
    });
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
        name: 'Night Run',
        status: 'active',
      });
      return jest.fn();
    });
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([
        {
          id: 'hazard_9',
          type: 'debris',
          reportedBy: 'driver_2',
          reporterName: 'Ava',
          lat: -26.2041,
          lng: 28.0473,
          timestamp: Date.now(),
          dismissed: false,
          reportCount: 1,
        },
      ]);
      return jest.fn();
    });
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });
    (dismissHazardWithFirebase as jest.Mock).mockResolvedValue(undefined);

    const screen = renderWithProviders(<RunMapScreen />);

    await enableTracking(screen);
    fireEvent.press(screen.getByTestId('button-driver-panel-toggle'));
    await waitFor(() => expect(screen.getByTestId('button-dismiss-hazard-hazard_9')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-dismiss-hazard-hazard_9'));

    await waitFor(() =>
      expect(dismissHazardWithFirebase).toHaveBeenCalledWith(
        'run_900',
        expect.objectContaining({
          id: 'hazard_9',
          type: 'debris',
        })
      )
    );
  });

  it('renders stale driver status and lets admins remove another driver', async () => {
    useRunSessionStore.getState().setSession({
      runId: 'run_900',
      driverId: 'driver_admin',
      driverName: 'You',
      joinCode: '123456',
      role: 'admin',
      status: 'active',
    });
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
        name: 'Club Run',
        status: 'active',
      });
      return jest.fn();
    });
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([
        {
          id: 'driver_admin',
          name: 'You',
          location: {
            lat: -26.2041,
            lng: 28.0473,
            heading: 0,
            speed: 0,
            accuracy: 0,
            timestamp: Date.now(),
          },
        },
        {
          id: 'driver_2',
          name: 'Ava',
          location: {
            lat: -26.2041,
            lng: 28.0473,
            heading: 0,
            speed: 0,
            accuracy: 0,
            timestamp: Date.now() - 90_000,
          },
        },
      ]);
      return jest.fn();
    });
    (subscribeToHazardsWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData([]);
      return jest.fn();
    });
    (startForegroundTrackingWithExpo as jest.Mock).mockResolvedValue(jest.fn());
    (startBackgroundTrackingWithExpo as jest.Mock).mockResolvedValue({
      enabled: true,
      reason: 'granted',
    });
    (removeDriverWithFirebase as jest.Mock).mockResolvedValue(undefined);

    const screen = renderWithProviders(<RunMapScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('text-driver-presence-driver_2')).toHaveTextContent('Ava • stale')
    );
    await enableTracking(screen);
    fireEvent.press(screen.getByTestId('button-driver-panel-toggle'));
    await waitFor(() => expect(screen.getAllByText('You').length).toBeGreaterThan(0));
    expect(screen.queryByText('You (you)')).toBeNull();

    fireEvent.press(screen.getByTestId('button-remove-driver-driver_2'));

    await waitFor(() => expect(removeDriverWithFirebase).toHaveBeenCalledWith('run_900', 'driver_2'));
  });

  it('shows permission recovery guidance and opens device settings after denial', async () => {
    jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    mockLiveSubscriptions();
    (startForegroundTrackingWithExpo as jest.Mock).mockRejectedValue(
      new Error('Foreground location permission is required.')
    );

    const screen = renderWithProviders(<RunMapScreen />);

    await enableTracking(screen);

    await waitFor(() =>
      expect(screen.getByTestId('text-run-error')).toHaveTextContent(
        /Foreground location permission is required/
      )
    );
    expect(screen.getByTestId('text-tracking-state')).toHaveTextContent('Tracking: disabled');
    expect(screen.getByTestId('text-tracking-detail')).toHaveTextContent(
      /Open system settings|Open settings/
    );

    fireEvent.press(screen.getByTestId('button-open-location-settings'));

    await waitFor(() => expect(Linking.openSettings).toHaveBeenCalledTimes(1));
  });
});
