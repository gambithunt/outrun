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
        drivers: {
          driver_1: {
            profile: {
              name: 'Jamie',
              carMake: 'BMW',
              carModel: 'M3',
              fuelType: 'petrol',
            },
            joinedAt: 1,
            leftAt: null,
          },
          driver_2: {
            profile: {
              name: 'Ava',
              carMake: 'Toyota',
              carModel: 'GR86',
              fuelType: 'petrol',
            },
            joinedAt: 1,
            leftAt: null,
          },
        },
        hazards: {
          hazard_1: {
            type: 'pothole',
            reportedBy: 'driver_1',
            reporterName: 'Jamie',
            lat: 0,
            lng: 0,
            timestamp: 1,
            dismissed: false,
            reportCount: 1,
          },
          hazard_2: {
            type: 'police',
            reportedBy: 'driver_1',
            reporterName: 'Jamie',
            lat: 0,
            lng: 0,
            timestamp: 2,
            dismissed: false,
            reportCount: 1,
          },
          hazard_3: {
            type: 'debris',
            reportedBy: 'driver_2',
            reporterName: 'Ava',
            lat: 0,
            lng: 0,
            timestamp: 3,
            dismissed: false,
            reportCount: 1,
          },
        },
        summary: {
          totalDistanceKm: 54,
          totalDriveTimeMinutes: 60,
          driverStats: {
            driver_1: {
              name: 'Jamie',
              carMake: 'BMW',
              carModel: 'M3',
              avgMovingSpeedKmh: 81.4,
              topSpeedKmh: 108,
              totalDistanceKm: 54.2,
              fuelUsedLitres: 12.5,
              fuelType: 'petrol',
            },
            driver_2: {
              name: 'Ava',
              carMake: 'Toyota',
              carModel: 'GR86',
              avgMovingSpeedKmh: 74.1,
              topSpeedKmh: 102.3,
              totalDistanceKm: 48.6,
              fuelUsedLitres: 10.2,
              fuelType: 'petrol',
            },
          },
          collectiveFuel: {
            petrolLitres: 22.7,
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
      expect(screen.getByTestId('text-summary-distance')).toHaveTextContent(/54\.0\s*km/)
    );
    expect(screen.getByText('Completed run')).toBeTruthy();
    expect(screen.getByText('Highlights')).toBeTruthy();
    expect(screen.getByText('Share recap')).toBeTruthy();
    expect(screen.getByText('Total convoy distance')).toBeTruthy();
    expect(screen.getByText('Steadiest pace')).toBeTruthy();
    expect(screen.getByText('Highest speed')).toBeTruthy();
    expect(screen.getByText('Road scout')).toBeTruthy();
    expect(screen.getByText('Hazard breakdown')).toBeTruthy();
    expect(screen.getByText('A few moments worth remembering from the run.')).toBeTruthy();
    expect(screen.getByTestId('text-summary-duration')).toHaveTextContent(/60\s*min/);
    expect(screen.getByTestId('text-summary-hazards')).toHaveTextContent('1');
    expect(screen.getByTestId('text-highlight-convoy-distance')).toHaveTextContent(/102\.8\s*km/);
    expect(screen.getByTestId('text-highlight-steadiest-pace')).toHaveTextContent(/81\.4\s*km\/h/);
    expect(screen.getByTestId('text-highlight-highest-speed')).toHaveTextContent(/108\.0\s*km\/h/);
    expect(screen.getByTestId('text-highlight-road-scout')).toHaveTextContent('Jamie');
    expect(screen.getByText('2 hazards called out for the convoy.')).toBeTruthy();
    expect(screen.getByTestId('button-share-image')).toBeTruthy();
    expect(screen.getByTestId('button-share-pdf')).toBeTruthy();
  });

  it('shows a floating back button and returns to the previous screen', async () => {
    (subscribeToRunWithFirebase as jest.Mock).mockImplementation((_id, onData) => {
      onData({
        name: 'Sunrise Run',
        summary: {
          totalDistanceKm: 54,
          totalDriveTimeMinutes: 60,
          driverStats: {},
          collectiveFuel: {
            petrolLitres: 0,
            dieselLitres: 0,
            hybridLitres: 0,
            electricKwh: 0,
          },
          hazardSummary: {
            total: 0,
            byType: {},
          },
          generatedAt: 100,
        },
      });
      return jest.fn();
    });

    const screen = renderWithProviders(<RunSummaryScreen />);

    await waitFor(() => expect(screen.getByTestId('button-back-summary')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-back-summary'));

    expect(
      (
        globalThis as {
          __mockExpoRouter?: { back: jest.Mock };
        }
      ).__mockExpoRouter?.back
    ).toHaveBeenCalledTimes(1);
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
