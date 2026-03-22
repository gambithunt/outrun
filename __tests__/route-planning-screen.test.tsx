import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/routeService', () => ({
  fetchRoadRouteFromStops: jest.fn(),
  saveRouteDraftToRunWithFirebase: jest.fn(),
  startRunWithSavedRouteWithFirebase: jest.fn(),
}));

jest.mock('@/lib/driverRealtime', () => ({
  subscribeToDriversWithFirebase: jest.fn(),
}));

jest.mock('@/lib/placeSearchService', () => ({
  searchPlacesWithProvider: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';

import RoutePlanningScreen from '@/app/create/route';
import { subscribeToDriversWithFirebase } from '@/lib/driverRealtime';
import { searchPlacesWithProvider } from '@/lib/placeSearchService';
import {
  fetchRoadRouteFromStops,
  saveRouteDraftToRunWithFirebase,
  startRunWithSavedRouteWithFirebase,
} from '@/lib/routeService';
import { useDeviceLocationStore } from '@/stores/deviceLocationStore';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { renderWithProviders } from '@/test-utils/render';

describe('RoutePlanningScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();

    useDeviceLocationStore.setState({
      currentLocation: null,
      status: 'idle',
      bootstrapLocation: useDeviceLocationStore.getState().bootstrapLocation,
      refreshLocation: useDeviceLocationStore.getState().refreshLocation,
    });
    useRunSessionStore.getState().clearSession();

    (globalThis as { __mockExpoRouterParams?: Record<string, string> }).__mockExpoRouterParams = {
      runId: 'run_500',
      joinCode: '123456',
    };
    (globalThis as {
      __mockExpoRouter?: { push: jest.Mock; replace: jest.Mock; back: jest.Mock };
    }).__mockExpoRouter = {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
    };

    (fetchRoadRouteFromStops as jest.Mock).mockResolvedValue({
      points: [
        [-26.2041, 28.0473],
        [-25.7479, 28.2293],
      ],
      distanceMetres: 54000,
      durationSeconds: 3600,
      source: 'drawn',
      stops: [],
    });
    (searchPlacesWithProvider as jest.Mock).mockResolvedValue([]);
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_runId, onData) => {
      onData([]);
      return jest.fn();
    });
  });

  it('centers on the user without auto-filling start, then hides the sheet after using current for start', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    expect(screen.getByTestId('route-planning-map')).toBeTruthy();
    expect(screen.getByTestId('route-planner-stats-card')).toBeTruthy();
    expect(screen.getByTestId('route-planner-sheet')).toBeTruthy();
    expect(screen.getByTestId('text-stage-title')).toHaveTextContent('Choose Start');
    expect(screen.getByTestId('text-guided-step')).toHaveTextContent('Choose start');
    expect(screen.getByTestId('text-selected-stop-label')).toHaveTextContent('Start');
    expect(screen.getByTestId('planner-action-search')).toBeTruthy();
    expect(screen.getByTestId('planner-action-current')).toBeTruthy();
    expect(screen.getByTestId('planner-action-pick')).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByTestId('mock-map-camera-center')).toHaveTextContent('28.0473,-26.2041')
    );

    fireEvent.press(screen.getByTestId('button-use-current-location'));

    await waitFor(() => expect(screen.queryByTestId('route-planner-sheet')).toBeNull());
    expect(screen.getByTestId('route-summary-chip')).toBeTruthy();
    expect(screen.getByTestId('text-route-summary-stops')).toHaveTextContent('0 stops');

    fireEvent.press(screen.getByTestId('route-summary-chip'));

    expect(screen.getByTestId('text-stage-title')).toHaveTextContent('Choose Destination');
    expect(screen.getByTestId('text-guided-step')).toHaveTextContent('Choose destination');
    expect(screen.getByTestId('text-selected-stop-label')).toHaveTextContent('Destination');
    expect(screen.getByTestId('planner-action-search')).toBeTruthy();
    expect(screen.queryByTestId('planner-action-current')).toBeNull();
    expect(screen.getByTestId('planner-action-pick')).toBeTruthy();
  });

  it('shows live readiness in the top card, saves the route draft, marks later edits dirty, then opens the lobby after re-saving', async () => {
    (saveRouteDraftToRunWithFirebase as jest.Mock).mockResolvedValue(undefined);
    (startRunWithSavedRouteWithFirebase as jest.Mock).mockResolvedValue(undefined);
    (subscribeToDriversWithFirebase as jest.Mock).mockImplementation((_runId, onData) => {
      onData([
        {
          id: 'driver_1',
          name: 'Jamie',
          location: {
            lat: -26.2041,
            lng: 28.0473,
            heading: 0,
            speed: 0,
            accuracy: 5,
            timestamp: Date.now(),
          },
        },
        {
          id: 'driver_2',
          name: 'Ava',
          location: null,
        },
        {
          id: 'driver_3',
          name: 'Mia',
          location: null,
        },
      ]);
      return jest.fn();
    });

    const screen = renderWithProviders(<RoutePlanningScreen />);
    expect(screen.getByTestId('text-driver-ready-count')).toHaveTextContent('1/3 ready');

    fireEvent.press(screen.getByTestId('button-use-current-location'));
    await waitFor(() => expect(screen.getByTestId('route-summary-chip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-summary-chip'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() => expect(screen.getByTestId('text-route-distance')).toHaveTextContent('54.0 km'));

    fireEvent.press(screen.getByTestId('button-save-route'));

    await waitFor(() =>
      expect(saveRouteDraftToRunWithFirebase).toHaveBeenCalledWith(
        'run_500',
        expect.objectContaining({ distanceMetres: 54000 })
      )
    );

    expect(screen.getByTestId('button-open-lobby')).toBeEnabled();
    expect(screen.getByTestId('button-open-lobby')).toHaveTextContent('Open Lobby');
    expect(screen.getByTestId('text-route-save-state')).toHaveTextContent('Saved');

    fireEvent.press(screen.getByTestId('button-add-stop-inline'));
    expect(screen.getByTestId('route-flow-stop-waypoint-1')).toBeTruthy();
    expect(screen.getByTestId('button-open-lobby')).toHaveTextContent('Save + Open Lobby');
    expect(screen.getByTestId('text-route-save-state')).toHaveTextContent('Unsaved changes');

    fireEvent.press(screen.getByTestId('button-save-route'));

    await waitFor(() =>
      expect(screen.getByTestId('button-open-lobby')).toHaveTextContent('Open Lobby')
    );

    fireEvent.press(screen.getByTestId('button-open-lobby'));

    await waitFor(() =>
      expect(startRunWithSavedRouteWithFirebase).toHaveBeenCalledWith('run_500')
    );
    expect(
      (globalThis as {
        __mockExpoRouter?: { push: jest.Mock };
      }).__mockExpoRouter?.push
    ).toHaveBeenCalledWith('/run/run_500/map');
  });

  it('keeps route actions contextual until a valid route exists', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    expect(screen.getByTestId('button-open-lobby')).toBeDisabled();
    expect(screen.queryByTestId('button-save-route')).toBeNull();
    expect(screen.queryByTestId('button-swap-start-destination')).toBeNull();

    fireEvent.press(screen.getByTestId('button-use-current-location'));
    await waitFor(() => expect(screen.getByTestId('route-summary-chip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-summary-chip'));

    expect(screen.queryByTestId('button-save-route')).toBeNull();
    expect(screen.queryByTestId('button-swap-start-destination')).toBeNull();
    expect(screen.getByTestId('button-open-lobby')).toBeDisabled();

    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() => expect(screen.getByTestId('button-save-route')).toBeTruthy());
    expect(screen.getByTestId('button-swap-start-destination')).toBeTruthy();
    expect(screen.getByTestId('button-open-lobby')).toHaveTextContent('Save + Open Lobby');

    fireEvent.press(screen.getByTestId('button-add-stop-inline'));
    expect(screen.queryByTestId('button-swap-start-destination')).toBeNull();
  });

  it('shows a route composer once the endpoints are set and inserts a new stop into the flow', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-use-current-location'));
    await waitFor(() => expect(screen.getByTestId('route-summary-chip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-summary-chip'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() => expect(screen.getByTestId('route-flow-composer')).toBeTruthy());
    expect(screen.getByTestId('route-flow-stop-start')).toBeTruthy();
    expect(screen.getByTestId('route-flow-stop-destination')).toBeTruthy();
    expect(screen.getByTestId('button-add-stop-inline')).toBeTruthy();

    fireEvent.press(screen.getByTestId('button-add-stop-inline'));

    expect(screen.getByTestId('text-selected-stop-label')).toHaveTextContent('Stop 1');
    expect(screen.getByTestId('route-flow-stop-waypoint-1')).toBeTruthy();
    expect(screen.getByTestId('text-waypoint-placement-helper')).toHaveTextContent(
      'Search for a place or drop this stop directly on the map.'
    );
    expect(screen.queryByTestId('button-use-current-location')).toBeNull();
    expect(screen.getByTestId('button-enter-pick-mode')).toBeTruthy();
  });

  it('swaps start and destination, opens in-card reorder mode, and can return to the summary flow', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-use-current-location'));
    await waitFor(() => expect(screen.getByTestId('route-summary-chip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-summary-chip'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() => expect(screen.getByTestId('button-add-stop-inline')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-add-stop-inline'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-26.1000, 28.1000');
    await waitFor(() =>
      expect(screen.getAllByText('-26.1000, 28.1000').length).toBeGreaterThan(0)
    );

    fireEvent.press(screen.getByTestId('button-add-stop-inline'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-26.0000, 28.2000');
    await waitFor(() =>
      expect(screen.getAllByText('-26.0000, 28.2000').length).toBeGreaterThan(0)
    );

    fireEvent.press(screen.getByTestId('route-flow-stop-start'));
    fireEvent.press(screen.getByTestId('button-swap-start-destination'));
    expect(screen.getByTestId('text-selected-stop-label')).toHaveTextContent('Start');

    fireEvent.press(screen.getByTestId('button-enter-drive-reorder-mode'));

    expect(screen.getByTestId('route-flow-reorder-list')).toBeTruthy();
    expect(screen.getByTestId('route-reorder-row-start')).toBeTruthy();
    expect(screen.getByTestId('route-reorder-row-waypoint-1')).toBeTruthy();
    expect(screen.getByTestId('route-reorder-row-waypoint-2')).toBeTruthy();
    expect(screen.getByTestId('route-reorder-row-destination')).toBeTruthy();

    fireEvent.press(screen.getByTestId('button-exit-drive-reorder-mode'));

    expect(screen.getByTestId('route-flow-composer')).toBeTruthy();
    expect(screen.getAllByTestId(/route-flow-stop-waypoint-/)).toHaveLength(2);
  });

  it('lets leaders remove a waypoint directly from in-card reorder mode', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-use-current-location'));
    await waitFor(() => expect(screen.getByTestId('route-summary-chip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-summary-chip'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() => expect(screen.getByTestId('button-add-stop-inline')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-add-stop-inline'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-26.1000, 28.1000');
    await waitFor(() =>
      expect(screen.getAllByText('-26.1000, 28.1000').length).toBeGreaterThan(0)
    );

    fireEvent.press(screen.getByTestId('button-enter-drive-reorder-mode'));

    expect(screen.getByTestId('route-flow-reorder-list')).toBeTruthy();
    fireEvent.press(screen.getByTestId('button-remove-waypoint-reorder-1'));

    expect(screen.queryByTestId('route-flow-stop-waypoint-1')).toBeNull();
    expect(screen.queryByTestId('button-exit-drive-reorder-mode')).toBeNull();
  });

  it('shows live place suggestions and applies a tapped result', async () => {
    (searchPlacesWithProvider as jest.Mock).mockResolvedValue([
      {
        id: 'place-jhb',
        label: 'Johannesburg, Gauteng, South Africa',
        lat: -26.2041,
        lng: 28.0473,
      },
    ]);

    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.changeText(screen.getByTestId('input-stop-search'), 'Johannesburg');

    await waitFor(() =>
      expect(screen.getByText('Johannesburg, Gauteng, South Africa')).toBeTruthy()
    );

    fireEvent.press(screen.getByTestId('place-result-place-jhb'));

    await waitFor(() => expect(screen.getByTestId('text-guided-step')).toHaveTextContent('Choose destination'));
    expect(screen.getByTestId('text-selected-stop-label')).toHaveTextContent('Destination');
    expect(screen.getByTestId('mock-map-camera-center')).toHaveTextContent('28.0473,-26.2041');
  });

  it('uses hidden map-pick mode with explicit confirmation before applying the point', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-enter-pick-mode'));

    expect(screen.queryByTestId('route-planner-sheet')).toBeNull();
    expect(screen.getByTestId('text-map-pick-mode')).toHaveTextContent('Choose Start On The Map');
    expect(screen.queryByTestId('button-confirm-map-pick')).toBeNull();

    fireEvent.press(screen.getByTestId('mock-map-view'));

    expect(screen.getByTestId('text-map-pick-selection')).toHaveTextContent('Pin ready for Start');
    expect(screen.getByTestId('button-confirm-map-pick')).toBeTruthy();

    fireEvent.press(screen.getByTestId('button-confirm-map-pick'));

    await waitFor(() =>
      expect(screen.getByTestId('text-selected-stop-label')).toHaveTextContent('Destination')
    );
    expect(screen.getByTestId('text-guided-step')).toHaveTextContent('Choose destination');
  });

  it('restores the latest route-planner draft and editing context when reopened', async () => {
    const firstScreen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(firstScreen.getByTestId('button-use-current-location'));
    await waitFor(() => expect(firstScreen.getByTestId('route-summary-chip')).toBeTruthy());
    fireEvent.press(firstScreen.getByTestId('route-summary-chip'));
    fireEvent.changeText(firstScreen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() =>
      expect(firstScreen.getByTestId('text-route-distance')).toHaveTextContent('54.0 km')
    );

    fireEvent.press(firstScreen.getByTestId('button-add-stop-inline'));
    fireEvent.changeText(firstScreen.getByTestId('input-stop-search'), '-26.1000, 28.1000');

    await waitFor(() =>
      expect(firstScreen.getByTestId('text-selected-stop-label')).toHaveTextContent('Stop 1')
    );

    firstScreen.unmount();

    const reopenedScreen = renderWithProviders(<RoutePlanningScreen />);

    await waitFor(() =>
      expect(reopenedScreen.getByTestId('route-flow-stop-waypoint-1')).toBeTruthy()
    );
    expect(reopenedScreen.getByTestId('text-sheet-state')).toHaveTextContent('Main');
    expect(reopenedScreen.getByTestId('text-selected-stop-label')).toHaveTextContent('Stop 1');
    expect(reopenedScreen.getByTestId('text-guided-step')).toHaveTextContent('Add stops or save route');
  });

  it('auto-saves before opening the lobby when the route has unsaved changes', async () => {
    (saveRouteDraftToRunWithFirebase as jest.Mock).mockResolvedValue(undefined);
    (startRunWithSavedRouteWithFirebase as jest.Mock).mockResolvedValue(undefined);

    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-use-current-location'));
    await waitFor(() => expect(screen.getByTestId('route-summary-chip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-summary-chip'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() =>
      expect(screen.getByTestId('button-open-lobby')).toHaveTextContent('Save + Open Lobby')
    );

    fireEvent.press(screen.getByTestId('button-open-lobby'));

    await waitFor(() =>
      expect(saveRouteDraftToRunWithFirebase).toHaveBeenCalledWith(
        'run_500',
        expect.objectContaining({ distanceMetres: 54000 })
      )
    );
    await waitFor(() =>
      expect(startRunWithSavedRouteWithFirebase).toHaveBeenCalledWith('run_500')
    );
  });

  it('can minimize to a compact route summary and expand back into the editor', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    expect(screen.getByTestId('route-planner-sheet')).toBeTruthy();
    expect(screen.getByTestId('input-stop-search')).toBeTruthy();
    expect(screen.getByTestId('text-sheet-state')).toHaveTextContent('Main');

    fireEvent.press(screen.getByTestId('button-minimize-route-sheet'));
    expect(screen.queryByTestId('route-planner-sheet')).toBeNull();
    expect(screen.getByTestId('route-summary-chip')).toBeTruthy();
    expect(screen.getByTestId('text-route-summary-stops')).toHaveTextContent('0 stops');
    expect(screen.queryByTestId('input-stop-search')).toBeNull();

    fireEvent.press(screen.getByTestId('route-summary-chip'));
    expect(screen.getByTestId('route-planner-sheet')).toBeTruthy();
    expect(screen.getByTestId('text-sheet-state')).toHaveTextContent('Main');
    expect(screen.getByTestId('input-stop-search')).toBeTruthy();
  });
});
