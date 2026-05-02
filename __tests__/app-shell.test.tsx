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

import ShellLayout from '@/app/(shell)/_layout';
import HomeScreen from '@/app/(shell)';
import RootLayout from '@/app/_layout';
import CreateRunScreen from '@/app/create';
import DriveScreen from '@/app/(shell)/drive';
import FriendsScreen from '@/app/(shell)/friends';
import JoinRunScreen from '@/app/join';
import DriverProfileScreen from '@/app/join/profile';
import ProfileScreen from '@/app/(shell)/profile';
import RunMapScreen from '@/app/run/[id]/map';
import RunSummaryScreen from '@/app/run/[id]/summary';
import SettingsScreen from '@/app/settings';
import * as authLib from '@/lib/auth';
import { loadAdminRunHistory } from '@/lib/adminRunHistory';
import { listRecentCrewWithFirebase } from '@/lib/recentCrewService';
import { loadInvitedRunsForUserWithFirebase } from '@/lib/scheduledRunService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { renderWithProviders } from '@/test-utils/render';

describe('ClubRun app shell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as { __mockExpoRouterPathname?: string }).__mockExpoRouterPathname = '/';
    useRunSessionStore.getState().clearSession();
    (loadAdminRunHistory as jest.Mock).mockResolvedValue([]);
  });

  it('renders the start dashboard branding and primary actions', async () => {
    const screen = renderWithProviders(<HomeScreen />);

    await waitFor(() => expect(screen.getAllByText('Start').length).toBeGreaterThan(0));
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

    await waitFor(() => expect(screen.getByText('screen:(shell)')).toBeTruthy());
    expect(screen.getByText('screen:settings')).toBeTruthy();
    expect(screen.getByText('screen:create/index')).toBeTruthy();
    expect(screen.getByText('screen:join/index')).toBeTruthy();
    expect(screen.getByText('screen:run/[id]/map')).toBeTruthy();
    expect(screen.getByText('screen:run/[id]/summary')).toBeTruthy();
  });

  it('renders the persistent shell tab bar inside the shared shell layout', async () => {
    const shellScreen = renderWithProviders(<ShellLayout />);

    await waitFor(() => expect(shellScreen.getByText('screen:index')).toBeTruthy());
    expect(shellScreen.getByText('screen:drive')).toBeTruthy();
    expect(shellScreen.getByText('screen:friends')).toBeTruthy();
    expect(shellScreen.getByText('screen:profile')).toBeTruthy();
    await waitFor(() => expect(shellScreen.getByTestId('tab-start')).toBeTruthy());
    expect(shellScreen.getByTestId('tab-drive')).toBeTruthy();
    expect(shellScreen.getByTestId('tab-friends')).toBeTruthy();
    expect(shellScreen.getByTestId('tab-profile')).toBeTruthy();
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

  it('lets guests request a password reset inline from sign-in mode', async () => {
    const resetSpy = jest
      .spyOn(authLib, 'sendPasswordResetEmailWithFirebase')
      .mockResolvedValue(undefined);

    const screen = renderWithProviders(<ProfileScreen />);

    await waitFor(() => expect(screen.getByTestId('button-open-sign-in')).toBeTruthy());
    fireEvent.press(screen.getByTestId('button-open-sign-in'));
    fireEvent.changeText(screen.getByTestId('input-account-email'), 'jamie@example.com');
    fireEvent.press(screen.getByTestId('button-forgot-password'));

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledWith('jamie@example.com');
    });
    expect(screen.getByTestId('text-account-auth-notice')).toHaveTextContent(
      'Check your inbox for a password reset link.'
    );
  });

  it('renders a focused drive control surface for the current run', () => {
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

    expect(screen.getByText('Current convoy')).toBeTruthy();
    expect(screen.getByText('Planning')).toBeTruthy();
    expect(screen.getByText('23.5 km loaded')).toBeTruthy();
    expect(screen.queryByText('Quick actions')).toBeNull();

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

    fireEvent.press(screen.getByTestId('button-open-drive-secondary'));
    expect(
      (
        globalThis as {
          __mockExpoRouter?: { push: jest.Mock };
        }
    ).__mockExpoRouter?.push
    ).toHaveBeenCalledWith('/run/run_drive/map');
  });

  it('keeps the start tab on the dashboard even when a live session exists', async () => {
    useRunSessionStore.getState().setSession({
      runId: 'run_live',
      driverId: 'driver_admin',
      driverName: 'Jamie',
      joinCode: '123456',
      role: 'admin',
      status: 'draft',
    });

    const screen = renderWithProviders(<HomeScreen />);

    await waitFor(() => expect(screen.getAllByText('Start').length).toBeGreaterThan(0));
    expect(screen.getByTestId('screen-home')).toBeTruthy();
    expect(
      (
        globalThis as {
          __mockExpoRouter?: { replace: jest.Mock };
        }
      ).__mockExpoRouter?.replace
    ).not.toHaveBeenCalledWith('/drive');
  });

  it('shows a single return path to Start when there is no live convoy', () => {
    useRunSessionStore.getState().setScheduledRunHero({
      runId: 'run_scheduled',
      name: 'Coastal Dawn',
      scheduledFor: new Date('2026-03-28T08:30:00Z').getTime(),
      visibility: 'club',
    });

    const screen = renderWithProviders(<DriveScreen />);

    expect(screen.getByText('No active convoy')).toBeTruthy();
    expect(screen.getByTestId('button-drive-go-start')).toBeTruthy();
    expect(screen.queryByText('Next up')).toBeNull();
    expect(screen.queryByText('Coastal Dawn')).toBeNull();
    expect(screen.queryByTestId('button-start-new-run')).toBeNull();
    expect(screen.queryByTestId('button-join-run-drive')).toBeNull();
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
