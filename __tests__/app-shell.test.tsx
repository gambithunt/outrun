jest.mock('@/lib/adminRunHistory', () => ({
  loadAdminRunHistory: jest.fn().mockResolvedValue([]),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';

import HomeScreen from '@/app/index';
import RootLayout from '@/app/_layout';
import CreateRunScreen from '@/app/create';
import JoinRunScreen from '@/app/join';
import DriverProfileScreen from '@/app/join/profile';
import RunMapScreen from '@/app/run/[id]/map';
import RunSummaryScreen from '@/app/run/[id]/summary';
import SettingsScreen from '@/app/settings';
import { loadAdminRunHistory } from '@/lib/adminRunHistory';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { renderWithProviders } from '@/test-utils/render';

describe('ClubRun app shell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRunSessionStore.getState().clearSession();
    (loadAdminRunHistory as jest.Mock).mockResolvedValue([]);
  });

  it('renders the home screen branding and calls to action', () => {
    const screen = renderWithProviders(<HomeScreen />);

    expect(screen.getByText('ClubRun')).toBeTruthy();
    expect(screen.getByTestId('button-create-run')).toBeTruthy();
    expect(screen.getByTestId('button-join-run')).toBeTruthy();
    expect(screen.getByText('Your Recent Runs')).toBeTruthy();
  });

  it('restores creator sessions using the "You" label', async () => {
    (loadAdminRunHistory as jest.Mock).mockResolvedValue([
      {
        runId: 'run_42',
        name: 'Sunrise Run',
        joinCode: '123456',
        driverId: 'driver_admin',
        status: 'ready',
        createdAt: Date.now(),
      },
    ]);

    const screen = renderWithProviders(<HomeScreen />);

    await waitFor(() => expect(screen.getByTestId('button-resume-run-run_42')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-resume-run-run_42'));

    expect(useRunSessionStore.getState()).toEqual(
      expect.objectContaining({
        runId: 'run_42',
        driverId: 'driver_admin',
        driverName: 'You',
        role: 'admin',
      })
    );
  });

  it('renders the root layout stack screens', () => {
    const screen = renderWithProviders(<RootLayout />);

    expect(screen.getByText('screen:index')).toBeTruthy();
    expect(screen.getByText('screen:settings')).toBeTruthy();
    expect(screen.getByText('screen:create/index')).toBeTruthy();
    expect(screen.getByText('screen:join/index')).toBeTruthy();
    expect(screen.getByText('screen:run/[id]/map')).toBeTruthy();
    expect(screen.getByText('screen:run/[id]/summary')).toBeTruthy();
  });

  it('renders each placeholder route shell', () => {
    const screen = renderWithProviders(
      <>
        <SettingsScreen />
        <CreateRunScreen />
        <JoinRunScreen />
        <DriverProfileScreen />
        <RunMapScreen />
        <RunSummaryScreen />
      </>
    );

    expect(screen.getByTestId('screen-settings')).toBeTruthy();
    expect(screen.getByTestId('screen-create-run')).toBeTruthy();
    expect(screen.getByTestId('screen-join-run')).toBeTruthy();
    expect(screen.getByTestId('screen-driver-profile')).toBeTruthy();
    expect(screen.getByTestId('screen-run-map')).toBeTruthy();
    expect(screen.getByTestId('screen-run-summary')).toBeTruthy();
  });

  it('renders firebase diagnostics in settings', () => {
    const screen = renderWithProviders(<SettingsScreen />);

    expect(screen.getByTestId('text-firebase-mode')).toHaveTextContent(/Mode:/);
    expect(screen.getByTestId('text-firebase-project')).toHaveTextContent(/Project:/);
    expect(screen.getByTestId('text-firebase-auth-status')).toHaveTextContent(/Auth:/);
  });
});
