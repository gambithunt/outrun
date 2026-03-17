import HomeScreen from '@/app/index';
import RootLayout from '@/app/_layout';
import CreateRunScreen from '@/app/create';
import JoinRunScreen from '@/app/join';
import DriverProfileScreen from '@/app/join/profile';
import RunMapScreen from '@/app/run/[id]/map';
import RunSummaryScreen from '@/app/run/[id]/summary';
import SettingsScreen from '@/app/settings';
import { renderWithProviders } from '@/test-utils/render';

describe('ClubRun app shell', () => {
  it('renders the home screen branding and calls to action', () => {
    const screen = renderWithProviders(<HomeScreen />);

    expect(screen.getByText('ClubRun')).toBeTruthy();
    expect(screen.getByTestId('button-create-run')).toBeTruthy();
    expect(screen.getByTestId('button-join-run')).toBeTruthy();
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
