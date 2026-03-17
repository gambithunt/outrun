jest.mock('@/lib/routeService', () => ({
  fetchRoadRoute: jest.fn(),
  saveRouteToRunWithFirebase: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';

import RoutePlanningScreen from '@/app/create/route';
import { fetchRoadRoute, saveRouteToRunWithFirebase } from '@/lib/routeService';
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
  });

  it('previews a route and displays summary details', async () => {
    (fetchRoadRoute as jest.Mock).mockResolvedValue({
      points: [
        [-26.2041, 28.0473],
        [-25.7479, 28.2293],
      ],
      distanceMetres: 54000,
      source: 'drawn',
    });

    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-preview-route'));

    await waitFor(() =>
      expect(screen.getByTestId('text-route-distance')).toHaveTextContent('Distance: 54.0 km')
    );
    expect(screen.getByTestId('text-route-points')).toHaveTextContent('Route points: 2');
  });

  it('saves the previewed route and navigates to the run map', async () => {
    (fetchRoadRoute as jest.Mock).mockResolvedValue({
      points: [
        [-26.2041, 28.0473],
        [-25.7479, 28.2293],
      ],
      distanceMetres: 54000,
      source: 'drawn',
    });
    (saveRouteToRunWithFirebase as jest.Mock).mockResolvedValue(undefined);

    const screen = renderWithProviders(<RoutePlanningScreen />);

    fireEvent.press(screen.getByTestId('button-preview-route'));
    await waitFor(() => expect(screen.getByTestId('text-route-points')).toBeTruthy());

    fireEvent.press(screen.getByTestId('button-save-route'));

    await waitFor(() =>
      expect(saveRouteToRunWithFirebase).toHaveBeenCalledWith(
        'run_500',
        expect.objectContaining({ distanceMetres: 54000 })
      )
    );
    expect(
      (globalThis as {
        __mockExpoRouter?: { push: jest.Mock };
      }).__mockExpoRouter?.push
    ).toHaveBeenCalledWith('/run/run_500/map');
  });
});
