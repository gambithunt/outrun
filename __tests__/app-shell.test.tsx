jest.mock('@/lib/adminRunHistory', () => ({
  loadAdminRunHistory: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/lib/scheduledRunService', () => ({
  buildRunsDashboardSections: jest.fn(({ history = [], invitedRuns = [] }) => ({
    hero: null,
    upcoming: [],
    invites: invitedRuns,
    recent: history,
  })),
  loadRunsDashboardSections: jest.fn(async () => ({
    hero: null,
    upcoming: [],
    recent: [],
  })),
  loadInvitedRunsForUserWithFirebase: jest.fn(async () => []),
  loadScheduledRunsForUserWithFirebase: jest.fn(async () => []),
}));

jest.mock('@/lib/recentCrewService', () => ({
  listRecentCrewWithFirebase: jest.fn(async () => []),
}));

import { fireEvent, waitFor } from '@testing-library/react-native';

import HomeScreen from '@/app/index';
import RootLayout from '@/app/_layout';
import CreateRunScreen from '@/app/create';
import DriveScreen from '@/app/drive';
import FriendsScreen from '@/app/friends';
import JoinRunScreen from '@/app/join';
import DriverProfileScreen from '@/app/join/profile';
import ProfileScreen from '@/app/profile';
import RunMapScreen from '@/app/run/[id]/map';
import RunSummaryScreen from '@/app/run/[id]/summary';
import SettingsScreen from '@/app/settings';
import { loadAdminRunHistory } from '@/lib/adminRunHistory';
import { listRecentCrewWithFirebase } from '@/lib/recentCrewService';
import { loadInvitedRunsForUserWithFirebase } from '@/lib/scheduledRunService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { renderWithProviders } from '@/test-utils/render';

describe('ClubRun app shell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRunSessionStore.getState().clearSession();
    (loadAdminRunHistory as jest.Mock).mockResolvedValue([]);
  });

  it('renders the runs dashboard branding and primary actions', async () => {
    const screen = renderWithProviders(<HomeScreen />);

    await waitFor(() => expect(screen.getAllByText('Runs').length).toBeGreaterThan(0));
    expect(screen.getByTestId('shell-brand-wordmark')).toHaveTextContent('CLUBRUN');
    expect(screen.getByTestId('button-new-run')).toBeTruthy();
    expect(screen.getByTestId('button-join-run-hero')).toBeTruthy();
    expect(screen.getByText('Create A Run')).toBeTruthy();
    expect(screen.getByText('Join A Run')).toBeTruthy();
    expect(screen.getByText('Recent Runs')).toBeTruthy();
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

  it('renders the root layout stack screens', async () => {
    const screen = renderWithProviders(<RootLayout />);

    await waitFor(() => expect(screen.getByText('screen:index')).toBeTruthy());
    expect(screen.getByText('screen:drive')).toBeTruthy();
    expect(screen.getByText('screen:friends')).toBeTruthy();
    expect(screen.getByText('screen:profile')).toBeTruthy();
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
        <DriveScreen />
        <FriendsScreen />
        <JoinRunScreen />
        <DriverProfileScreen />
        <ProfileScreen />
        <RunMapScreen />
        <RunSummaryScreen />
      </>
    );

    expect(screen.getByTestId('screen-settings')).toBeTruthy();
    expect(screen.getByTestId('screen-create-run')).toBeTruthy();
    expect(screen.getByTestId('screen-drive')).toBeTruthy();
    expect(screen.getByTestId('screen-friends')).toBeTruthy();
    expect(screen.getByTestId('screen-join-run')).toBeTruthy();
    expect(screen.getByTestId('screen-driver-profile')).toBeTruthy();
    expect(screen.getByTestId('screen-profile')).toBeTruthy();
    expect(screen.getByTestId('screen-run-map')).toBeTruthy();
    expect(screen.getByTestId('screen-run-summary')).toBeTruthy();
  });

  it('renders firebase diagnostics in settings', () => {
    const screen = renderWithProviders(<SettingsScreen />);

    expect(screen.getByTestId('text-firebase-mode')).toHaveTextContent(/Mode:/);
    expect(screen.getByTestId('text-firebase-project')).toHaveTextContent(/Project:/);
    expect(screen.getByTestId('text-firebase-auth-status')).toHaveTextContent(/Auth:/);
  });

  it('shows the guest profile state with sign-in actions', async () => {
    const screen = renderWithProviders(<ProfileScreen />);

    await waitFor(() => expect(screen.getByText('Guest mode')).toBeTruthy());
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getByTestId('button-open-sign-up')).toBeTruthy();
    expect(screen.getByTestId('button-open-sign-in')).toBeTruthy();
  });

  it('renders a denser drive control surface for planning runs', () => {
    useRunSessionStore.getState().setSession({
      runId: 'run_drive',
      driverId: 'driver_admin',
      driverName: 'Jamie',
      joinCode: '123456',
      role: 'admin',
      status: 'draft',
    });
    useRunSessionStore.getState().setRunSnapshot({
      name: 'Current run',
      status: 'draft',
      route: {
        points: [],
        distanceMetres: 23500,
        source: 'drawn',
      },
    });

    const screen = renderWithProviders(<DriveScreen />);

    expect(screen.getByText('Resume convoy')).toBeTruthy();
    expect(screen.getByText('Quick actions')).toBeTruthy();
    expect(screen.getByText('Planning')).toBeTruthy();
    expect(screen.getByText('23.5 km loaded')).toBeTruthy();

    fireEvent.press(screen.getByTestId('button-open-drive-primary'));
    expect(
      (
        globalThis as {
          __mockExpoRouter?: { push: jest.Mock };
        }
      ).__mockExpoRouter?.push
    ).toHaveBeenCalledWith({
      pathname: '/create/route',
      params: { runId: 'run_drive' },
    });

    fireEvent.press(screen.getByTestId('button-open-drive-map'));
    expect(
      (
        globalThis as {
          __mockExpoRouter?: { push: jest.Mock };
        }
      ).__mockExpoRouter?.push
    ).toHaveBeenCalledWith('/run/run_drive/map');
  });

  it('shows launch actions and the next scheduled run when there is no live convoy', () => {
    useRunSessionStore.getState().setScheduledRunHero({
      runId: 'run_scheduled',
      name: 'Coastal Dawn',
      scheduledFor: new Date('2026-03-28T08:30:00Z').getTime(),
      visibility: 'club',
    });

    const screen = renderWithProviders(<DriveScreen />);

    expect(screen.getAllByText('Ready to roll').length).toBeGreaterThan(0);
    expect(screen.getByText('Next up')).toBeTruthy();
    expect(screen.getByText('Coastal Dawn')).toBeTruthy();
    expect(screen.getByTestId('button-start-new-run')).toBeTruthy();
    expect(screen.getByTestId('button-join-run-drive')).toBeTruthy();
  });

  it('shows incoming invites on the runs dashboard when the user has invited runs', async () => {
    (loadInvitedRunsForUserWithFirebase as jest.Mock).mockResolvedValue([
      {
        name: 'Mountain Loop',
        joinCode: '222222',
        adminId: 'driver_admin',
        status: 'draft',
        createdAt: 1,
        startedAt: null,
        endedAt: null,
        maxDrivers: 10,
        scheduledFor: Date.now() + 60_000,
        visibility: 'club',
      },
    ]);
    useRunSessionStore.getState().setSignedInAccount({
      userId: 'mock-auth-user',
      isAnonymous: false,
      email: 'jamie@example.com',
    });

    const screen = renderWithProviders(<HomeScreen />);

    await waitFor(() => expect(screen.getByText('Invites')).toBeTruthy());
    expect(screen.getByText('Mountain Loop')).toBeTruthy();
  });

  it('starts a new scheduled invite flow from recent crew', async () => {
    (listRecentCrewWithFirebase as jest.Mock).mockResolvedValue([
      {
        userId: 'uid_friend',
        displayName: 'Ava',
        homeClub: 'Night Shift',
        lastRunName: 'Canyon Sprint',
        lastSeenAt: Date.now(),
      },
    ]);

    useRunSessionStore.getState().setSignedInAccount({
      userId: 'uid_self',
      isAnonymous: false,
      email: 'jamie@example.com',
    });

    const screen = renderWithProviders(<FriendsScreen />);

    await waitFor(() => expect(screen.getByTestId('button-invite-again-uid_friend')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-invite-again-uid_friend'));

    expect(
      (
        globalThis as {
          __mockExpoRouter?: { push: jest.Mock };
        }
      ).__mockExpoRouter?.push
    ).toHaveBeenCalledWith({
      pathname: '/create',
      params: {
        invitedUserIds: 'uid_friend',
      },
    });
  });
});
