jest.mock('@/lib/profileService', () => ({
  loadDriverProfileDraft: jest.fn(),
  saveDriverProfileDraft: jest.fn(),
  saveDriverProfileWithFirebase: jest.fn(),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';

import DriverProfileScreen from '@/app/join/profile';
import { loadDriverProfileDraft, saveDriverProfileWithFirebase } from '@/lib/profileService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { renderWithProviders } from '@/test-utils/render';

describe('DriverProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRunSessionStore.getState().clearSession();
    (globalThis as { __mockExpoRouterParams?: Record<string, string> }).__mockExpoRouterParams = {
      runId: 'run_321',
      code: '654321',
    };
    (globalThis as {
      __mockExpoRouter?: { push: jest.Mock; replace: jest.Mock; back: jest.Mock };
    }).__mockExpoRouter = {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
    };
  });

  it('prefills cached values when a draft exists', async () => {
    (loadDriverProfileDraft as jest.Mock).mockResolvedValue({
      name: 'Ava',
      carMake: 'BMW',
      carModel: 'M3 Competition',
      fuelType: 'petrol',
    });

    const screen = renderWithProviders(<DriverProfileScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('input-driver-name').props.value).toBe('Ava')
    );
    expect(screen.getByTestId('input-car-make').props.value).toBe('BMW');
  });

  it('saves the profile, updates session state, and navigates to the run map', async () => {
    (loadDriverProfileDraft as jest.Mock).mockResolvedValue(null);
    (saveDriverProfileWithFirebase as jest.Mock).mockResolvedValue({
      driverId: 'driver_777',
      profile: {
        name: 'Jamie',
        carMake: 'Toyota',
        carModel: 'GR Yaris',
        fuelType: 'petrol',
      },
    });

    const screen = renderWithProviders(<DriverProfileScreen />);

    fireEvent.changeText(screen.getByTestId('input-driver-name'), 'Jamie');
    fireEvent.changeText(screen.getByTestId('input-car-make'), 'Toyota');
    fireEvent.changeText(screen.getByTestId('input-car-model'), 'GR Yaris');
    fireEvent.press(screen.getByTestId('button-save-profile'));

    await waitFor(() =>
      expect(saveDriverProfileWithFirebase).toHaveBeenCalledWith(
        'run_321',
        expect.objectContaining({
          name: 'Jamie',
          carMake: 'Toyota',
          carModel: 'GR Yaris',
        })
      )
    );

    expect(useRunSessionStore.getState()).toEqual(
      expect.objectContaining({
        runId: 'run_321',
        driverId: 'driver_777',
        driverName: 'Jamie',
        joinCode: '654321',
        role: 'driver',
        status: 'draft',
      })
    );
    expect(
      (globalThis as {
        __mockExpoRouter?: { push: jest.Mock };
      }).__mockExpoRouter?.push
    ).toHaveBeenCalledWith('/run/run_321/map');
  });

  it('shows a clear error when the run is already full', async () => {
    (loadDriverProfileDraft as jest.Mock).mockResolvedValue(null);
    (saveDriverProfileWithFirebase as jest.Mock).mockRejectedValue(new Error('This run is full.'));

    const screen = renderWithProviders(<DriverProfileScreen />);

    fireEvent.changeText(screen.getByTestId('input-driver-name'), 'Jamie');
    fireEvent.changeText(screen.getByTestId('input-car-make'), 'Toyota');
    fireEvent.changeText(screen.getByTestId('input-car-model'), 'GR Yaris');
    fireEvent.press(screen.getByTestId('button-save-profile'));

    await waitFor(() => expect(screen.getByText('This run is full.')).toBeTruthy());
    expect(
      (globalThis as {
        __mockExpoRouter?: { push: jest.Mock };
      }).__mockExpoRouter?.push
    ).not.toHaveBeenCalled();
  });

  it('shows a clear error when the run has already ended', async () => {
    (loadDriverProfileDraft as jest.Mock).mockResolvedValue(null);
    (saveDriverProfileWithFirebase as jest.Mock).mockRejectedValue(
      new Error('This run has already ended.')
    );

    const screen = renderWithProviders(<DriverProfileScreen />);

    fireEvent.changeText(screen.getByTestId('input-driver-name'), 'Jamie');
    fireEvent.changeText(screen.getByTestId('input-car-make'), 'Toyota');
    fireEvent.changeText(screen.getByTestId('input-car-model'), 'GR Yaris');
    fireEvent.press(screen.getByTestId('button-save-profile'));

    await waitFor(() => expect(screen.getByText('This run has already ended.')).toBeTruthy());
  });
});
