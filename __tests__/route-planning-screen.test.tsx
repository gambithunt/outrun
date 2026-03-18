import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/routeService', () => ({
  fetchRoadRouteFromStops: jest.fn(),
  saveRouteDraftToRunWithFirebase: jest.fn(),
  startRunWithSavedRouteWithFirebase: jest.fn(),
}));

jest.mock('@/lib/placeSearchService', () => ({
  searchPlacesWithProvider: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';

import RoutePlanningScreen from '@/app/create/route';
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
  });

  it('centers on the user without auto-filling start, then hides the sheet after using current for start', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    expect(screen.getByTestId('route-planning-map')).toBeTruthy();
    expect(screen.getByTestId('route-planner-sheet')).toBeTruthy();
    expect(screen.getByTestId('text-guided-step')).toHaveTextContent('Choose start');
    expect(screen.getByTestId('text-selected-stop-label')).toHaveTextContent('Start');

    await waitFor(() =>
      expect(screen.getByTestId('mock-map-camera-center')).toHaveTextContent('28.0473,-26.2041')
    );

    fireEvent.press(screen.getByTestId('button-use-current-location'));

    await waitFor(() => expect(screen.queryByTestId('route-planner-sheet')).toBeNull());
    expect(screen.getByTestId('route-summary-chip')).toBeTruthy();
    expect(screen.getByTestId('text-route-summary-stops')).toHaveTextContent('0 stops');

    fireEvent.press(screen.getByTestId('route-summary-chip'));

    expect(screen.getByTestId('text-guided-step')).toHaveTextContent('Choose destination');
    expect(screen.getByTestId('text-selected-stop-label')).toHaveTextContent('Destination');
  });

  it('adds a waypoint, saves the route draft, marks later edits dirty, then starts the run after re-saving', async () => {
    (saveRouteDraftToRunWithFirebase as jest.Mock).mockResolvedValue(undefined);
    (startRunWithSavedRouteWithFirebase as jest.Mock).mockResolvedValue(undefined);

    const screen = renderWithProviders(<RoutePlanningScreen />);

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

    expect(screen.getByTestId('button-start-run')).toBeEnabled();
    expect(screen.getByTestId('text-route-save-state')).toHaveTextContent('Ready to start');

    fireEvent.press(screen.getByTestId('button-add-stop'));
    expect(screen.getByTestId('route-stop-row-waypoint-1')).toBeTruthy();
    expect(screen.getByTestId('button-start-run')).toBeDisabled();
    expect(screen.getByTestId('text-route-save-state')).toHaveTextContent('Draft changed');

    fireEvent.press(screen.getByTestId('button-save-route'));

    await waitFor(() => expect(screen.getByTestId('button-start-run')).toBeEnabled());

    fireEvent.press(screen.getByTestId('button-start-run'));

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

    expect(screen.queryByTestId('button-save-route')).toBeNull();
    expect(screen.queryByTestId('button-start-run')).toBeNull();
    expect(screen.queryByTestId('button-swap-start-destination')).toBeNull();

    fireEvent.press(screen.getByTestId('button-use-current-location'));
    await waitFor(() => expect(screen.getByTestId('route-summary-chip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-summary-chip'));

    expect(screen.queryByTestId('button-save-route')).toBeNull();
    expect(screen.queryByTestId('button-swap-start-destination')).toBeNull();

    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() => expect(screen.getByTestId('button-save-route')).toBeTruthy());
    expect(screen.getByTestId('button-swap-start-destination')).toBeTruthy();

    fireEvent.press(screen.getByTestId('button-add-stop'));
    expect(screen.queryByTestId('button-swap-start-destination')).toBeNull();
  });

  it('swaps start and destination, opens reorder mode from a stop handle, and can return to the main sheet', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-use-current-location'));
    await waitFor(() => expect(screen.getByTestId('route-summary-chip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-summary-chip'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() => expect(screen.getByTestId('button-add-stop')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-add-stop'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-26.1000, 28.1000');
    await waitFor(() =>
      expect(screen.getAllByText('-26.1000, 28.1000').length).toBeGreaterThan(0)
    );

    fireEvent.press(screen.getByTestId('button-add-stop'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-26.0000, 28.2000');
    await waitFor(() =>
      expect(screen.getAllByText('-26.0000, 28.2000').length).toBeGreaterThan(0)
    );

    fireEvent.press(screen.getByTestId('route-stop-row-start'));
    fireEvent.press(screen.getByTestId('button-swap-start-destination'));
    expect(screen.getByTestId('text-selected-stop-label')).toHaveTextContent('Start');

    fireEvent.press(screen.getByTestId('drag-handle-waypoint-2'));

    expect(screen.getByTestId('route-reorder-sheet')).toBeTruthy();
    expect(screen.queryByTestId('route-planner-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('button-exit-reorder-mode'));

    expect(screen.getByTestId('route-planner-sheet')).toBeTruthy();
    expect(screen.getAllByTestId(/route-stop-row-waypoint-/)).toHaveLength(2);
  });

  it('lets leaders remove a waypoint directly from reorder mode', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-use-current-location'));
    await waitFor(() => expect(screen.getByTestId('route-summary-chip')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-summary-chip'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() => expect(screen.getByTestId('button-add-stop')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-add-stop'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-26.1000, 28.1000');
    await waitFor(() =>
      expect(screen.getAllByText('-26.1000, 28.1000').length).toBeGreaterThan(0)
    );

    fireEvent.press(screen.getByTestId('drag-handle-waypoint-1'));

    expect(screen.getByTestId('route-reorder-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('button-remove-waypoint-reorder-1'));
    fireEvent.press(screen.getByTestId('button-exit-reorder-mode'));

    expect(screen.queryByTestId('route-stop-row-waypoint-1')).toBeNull();
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

    await waitFor(() =>
      expect(screen.getByText('Johannesburg, Gauteng, South Africa')).toBeTruthy()
    );
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

    fireEvent.press(firstScreen.getByTestId('button-add-stop'));
    fireEvent.changeText(firstScreen.getByTestId('input-stop-search'), '-26.1000, 28.1000');

    await waitFor(() =>
      expect(firstScreen.getByTestId('text-selected-stop-label')).toHaveTextContent('Stop 1')
    );

    firstScreen.unmount();

    const reopenedScreen = renderWithProviders(<RoutePlanningScreen />);

    await waitFor(() =>
      expect(reopenedScreen.getByTestId('route-stop-row-waypoint-1')).toBeTruthy()
    );
    expect(reopenedScreen.getByTestId('text-sheet-state')).toHaveTextContent('Main');
    expect(reopenedScreen.getByTestId('text-selected-stop-label')).toHaveTextContent('Stop 1');
    expect(reopenedScreen.getByTestId('text-guided-step')).toHaveTextContent('Add stops or save route');
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
