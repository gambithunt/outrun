jest.mock('@/lib/runRealtime', () => ({
  subscribeToRunWithFirebase: jest.fn(),
}));

jest.mock('@/lib/shareService', () => ({
  ...jest.requireActual('@/lib/shareService'),
  shareSummaryAsImage: jest.fn(),
  shareSummaryAsPdf: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';

import RunSummaryScreen from '@/app/run/[id]/summary';
import { subscribeToRunWithFirebase } from '@/lib/runRealtime';
import { shareSummaryAsImage, shareSummaryAsPdf } from '@/lib/shareService';
import { renderWithProviders } from '@/test-utils/render';

describe('RunSummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as { __mockExpoRouterParams?: Record<string, string> }).__mockExpoRouterParams = {
      id: 'run_900',
    };
  });

  it('renders the generated summary', async () => {
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
        name: 'Sunrise Run',
        summary: {
          totalDistanceKm: 54,
          totalDriveTimeMinutes: 60,
          driverStats: {
            driver_1: {
              name: 'Jamie',
              carMake: 'BMW',
              carModel: 'M3',
              topSpeedKmh: 108,
              fuelUsedLitres: 12.5,
              fuelType: 'petrol',
            },
          },
          collectiveFuel: {
            petrolLitres: 12.5,
            dieselLitres: 0,
            hybridLitres: 0,
            electricKwh: 0,
          },
          hazardSummary: {
            total: 1,
            byType: {
              pothole: 1,
            },
          },
          generatedAt: 100,
        },
      });
      return jest.fn();
    });

    const screen = renderWithProviders(<RunSummaryScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('text-summary-distance')).toHaveTextContent('Distance: 54.0 km')
    );
    expect(screen.getByTestId('text-summary-duration')).toHaveTextContent('Drive time: 60 minutes');
    expect(screen.getByTestId('text-summary-hazards')).toHaveTextContent('Hazards reported: 1');
    expect(screen.getByTestId('button-share-image')).toBeTruthy();
    expect(screen.getByTestId('button-share-pdf')).toBeTruthy();
  });

  it('triggers image and PDF sharing actions', async () => {
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
        name: 'Sunrise Run',
        route: {
          points: [
            [-26.2041, 28.0473],
            [-25.7479, 28.2293],
          ],
          distanceMetres: 54000,
          source: 'drawn',
        },
        summary: {
          totalDistanceKm: 54,
          totalDriveTimeMinutes: 60,
          driverStats: {},
          collectiveFuel: {
            petrolLitres: 12.5,
            dieselLitres: 0,
            hybridLitres: 0,
            electricKwh: 0,
          },
          hazardSummary: {
            total: 1,
            byType: {
              pothole: 1,
            },
          },
          generatedAt: 100,
        },
      });
      return jest.fn();
    });

    const screen = renderWithProviders(<RunSummaryScreen />);

    await waitFor(() => expect(screen.getByTestId('button-share-image')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-share-image'));
    fireEvent.press(screen.getByTestId('button-share-pdf'));

    await waitFor(() => expect(shareSummaryAsImage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(shareSummaryAsPdf).toHaveBeenCalledTimes(1));
  });
});
