jest.mock('@/lib/routeService', () => ({
  fetchRoadRouteFromStops: jest.fn(),
  saveRouteDraftToRunWithFirebase: jest.fn(),
  startRunWithSavedRouteWithFirebase: jest.fn(),
}));

jest.mock('@/lib/placeSearchService', () => ({
  searchPlacesWithProvider: jest.fn(),
}));

import { fireEvent, userEvent, waitFor } from '@testing-library/react-native';

import RoutePlanningScreen from '@/app/create/route';
import { searchPlacesWithProvider } from '@/lib/placeSearchService';
import {
  fetchRoadRouteFromStops,
  saveRouteDraftToRunWithFirebase,
  startRunWithSavedRouteWithFirebase,
} from '@/lib/routeService';
import { renderWithProviders } from '@/test-utils/render';

describe('RoutePlanningScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('renders a guided planner with minimal chrome and previews a route from selected stops', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    expect(screen.getByTestId('route-planning-map')).toBeTruthy();
    expect(screen.queryByTestId('top-stop-start')).toBeNull();
    expect(screen.getByTestId('button-center-on-user')).toBeTruthy();
    expect(screen.queryByTestId('button-apply-active-stop')).toBeNull();
    expect(screen.getByTestId('text-guided-step')).toHaveTextContent('Choose start');

    fireEvent.press(screen.getByTestId('button-use-current-location'));

    await waitFor(() =>
      expect(screen.getByTestId('text-guided-step')).toHaveTextContent('Choose destination')
    );

    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() =>
      expect(screen.getByTestId('text-route-distance')).toHaveTextContent('54.0 km')
    );

    expect(screen.getByTestId('text-route-duration')).toHaveTextContent('1 hr 0 min');
    expect(screen.getByTestId('text-guided-step')).toHaveTextContent('Add stops or save route');
    expect(screen.getByTestId('button-fit-route')).toBeTruthy();
    expect(fetchRoadRouteFromStops).toHaveBeenCalled();
  });

  it('adds a waypoint, saves the route draft, then starts the run separately', async () => {
    (saveRouteDraftToRunWithFirebase as jest.Mock).mockResolvedValue(undefined);
    (startRunWithSavedRouteWithFirebase as jest.Mock).mockResolvedValue(undefined);

    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-use-current-location'));

    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    await waitFor(() => expect(screen.getByTestId('text-route-distance')).toBeTruthy());

    fireEvent.press(screen.getByTestId('button-expand-route-sheet'));
    fireEvent.press(screen.getByTestId('button-add-stop'));
    expect(screen.getByTestId('route-stop-row-waypoint-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('button-start-run'));
    expect(startRunWithSavedRouteWithFirebase).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('button-save-route'));

    await waitFor(() =>
      expect(saveRouteDraftToRunWithFirebase).toHaveBeenCalledWith(
        'run_500',
        expect.objectContaining({ distanceMetres: 54000 })
      )
    );

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

  it('swaps start and destination and supports hold-to-reorder for waypoints', async () => {
    const user = userEvent.setup();
    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-use-current-location'));

    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-25.7479, 28.2293');

    fireEvent.press(screen.getByTestId('button-expand-route-sheet'));
    fireEvent.press(screen.getByTestId('button-add-stop'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-26.1000, 28.1000');
    await waitFor(() => expect(screen.getByText('-26.1000, 28.1000')).toBeTruthy());

    fireEvent.press(screen.getByTestId('button-add-stop'));
    fireEvent.changeText(screen.getByTestId('input-stop-search'), '-26.0000, 28.2000');
    await waitFor(() => expect(screen.getByText('-26.0000, 28.2000')).toBeTruthy());

    fireEvent.press(screen.getByTestId('button-swap-start-destination'));
    fireEvent.press(screen.getByTestId('route-stop-row-start'));
    expect(screen.getByTestId('text-selected-stop-label')).toHaveTextContent('Start');

    await user.longPress(screen.getByTestId('drag-handle-waypoint-2'));
    fireEvent.press(screen.getByTestId('drop-target-before-waypoint-1'));

    expect(screen.getAllByTestId(/route-stop-row-waypoint-/)).toHaveLength(2);
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

    fireEvent.press(screen.getByTestId('button-expand-route-sheet'));
    await waitFor(() =>
      expect(screen.getByText('Johannesburg, Gauteng, South Africa')).toBeTruthy()
    );
  });

  it('supports map pick mode with confirm and cancel actions', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-enter-pick-mode'));
    expect(screen.getByTestId('text-map-pick-mode')).toHaveTextContent('Tap the map to choose Start');
    expect(screen.getByTestId('button-confirm-map-pick')).toBeTruthy();

    fireEvent.press(screen.getByTestId('button-cancel-map-pick'));
    expect(screen.queryByTestId('button-confirm-map-pick')).toBeNull();

    fireEvent.press(screen.getByTestId('button-enter-pick-mode'));
    fireEvent.press(screen.getByTestId('mock-map-view'));
    fireEvent.press(screen.getByTestId('button-confirm-map-pick'));

    fireEvent.press(screen.getByTestId('button-expand-route-sheet'));
    await waitFor(() =>
      expect(screen.getByText('Main Rd, Main Rd, Johannesburg, Gauteng, South Africa')).toBeTruthy()
    );
  });

  it('collapses to a compact guided sheet and expands to show the ordered route list', async () => {
    const screen = renderWithProviders(<RoutePlanningScreen />);

    expect(screen.getByTestId('input-stop-search')).toBeTruthy();
    expect(screen.queryByTestId('route-stop-row-start')).toBeNull();

    fireEvent.press(screen.getByTestId('button-expand-route-sheet'));
    expect(screen.getByTestId('text-sheet-state')).toHaveTextContent('Expanded');
    expect(screen.getByTestId('route-stop-row-start')).toBeTruthy();
    expect(screen.getByTestId('route-stop-row-destination')).toBeTruthy();

    fireEvent.press(screen.getByTestId('button-collapse-route-sheet'));
    expect(screen.getByTestId('text-sheet-state')).toHaveTextContent('Collapsed');
    expect(screen.queryByTestId('route-stop-row-start')).toBeNull();
    expect(screen.getByTestId('input-stop-search')).toBeTruthy();
  });
});
