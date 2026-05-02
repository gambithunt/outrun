import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { ShellScreen } from '@/components/shell/ShellScreen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useRunSessionStore } from '@/stores/runSessionStore';

type DrivePhase = 'planning' | 'lobby' | 'live';

export default function DriveScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const {
    connectivityStatus,
    joinCode,
    runId,
    runName,
    route,
    status,
  } = useRunSessionStore();

  const hasLiveContext = Boolean(runId && status && status !== 'ended');
  const drivePhase = getDrivePhase(status);
  const routeDistanceLabel = route?.distanceMetres
    ? `${(route.distanceMetres / 1000).toFixed(1)} km loaded`
    : 'No route locked';

  function handlePrimaryAction() {
    if (!runId) {
      return;
    }

    if (status === 'draft') {
      router.push({
        pathname: '/create/route',
        params: { runId },
      });
      return;
    }

    router.push(`/run/${runId}/map`);
  }

  function handleOpenMap() {
    if (!runId) {
      return;
    }

    router.push(`/run/${runId}/map`);
  }

  function handleSecondaryAction() {
    if (drivePhase === 'planning') {
      handleOpenMap();
      return;
    }

    router.push('/');
  }

  return (
    <ShellScreen activeTab="drive" testID="screen-drive">
      <View style={{ gap: 10 }}>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: 13,
            fontWeight: '800',
            letterSpacing: 2.2,
            textTransform: 'uppercase',
          }}
        >
          Drive Deck
        </Text>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 40,
            fontWeight: '900',
            letterSpacing: -1.4,
          }}
        >
          {hasLiveContext ? 'Current convoy' : 'Drive'}
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 17, lineHeight: 25 }}>
          {hasLiveContext
            ? 'Status, route, and crew controls stay focused on the convoy you are in right now.'
            : 'Drive becomes your mission control once a convoy is underway.'}
        </Text>
      </View>

      {hasLiveContext && drivePhase ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TelemetryCard
              detail={labelForConnectivity(connectivityStatus)}
              label="Connection"
              theme={theme}
              value={
                connectivityStatus === 'offline'
                  ? 'Offline'
                  : connectivityStatus === 'reconnecting'
                    ? 'Syncing'
                    : 'Live'
              }
            />
            <TelemetryCard
              detail={joinCode ? `Code ${joinCode}` : 'Waiting on crew'}
              label="Run State"
              theme={theme}
              value={
                drivePhase === 'planning'
                  ? 'Draft'
                  : drivePhase === 'lobby'
                    ? 'Lobby'
                    : 'Live'
              }
            />
          </View>

          <AppCard>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <StatusPill label={labelForPhase(drivePhase)} tone="accent" />
              <StatusPill label={labelForConnectivity(connectivityStatus)} tone="neutral" />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.colors.textPrimary, fontSize: 34, fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase' }}>
                {runName ?? 'Current run'}
              </Text>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 16, lineHeight: 23 }}>
                {descriptionForPhase(drivePhase, routeDistanceLabel, joinCode)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <MetricTile label="Route" value={routeDistanceLabel} />
              <MetricTile label="Join Code" value={joinCode ?? 'Pending'} />
            </View>

            <View style={{ gap: 10 }}>
              <AppButton
                label={drivePhase === 'planning' ? 'Open Planner' : 'Open Live Map'}
                onPress={handlePrimaryAction}
                testID="button-open-drive-primary"
              />
              <AppButton
                label={drivePhase === 'planning' ? 'Open Map' : 'Go to Start'}
                onPress={handleSecondaryAction}
                variant="secondary"
                testID="button-open-drive-secondary"
              />
            </View>
          </AppCard>
        </>
      ) : (
        <AppCard>
          <StatusPill label="No active drive" tone="neutral" />
          <Text
            style={{
              color: theme.colors.textPrimary,
              fontSize: 34,
              fontWeight: '900',
              fontStyle: 'italic',
              textTransform: 'uppercase',
            }}
          >
            No active convoy
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 16, lineHeight: 23 }}>
            Create, join, and browse sessions from Start. Come back here once a convoy is planned, in lobby, or live on the map.
          </Text>

          <AppButton label="Go to Start" onPress={() => router.push('/')} testID="button-drive-go-start" />
        </AppCard>
      )}
    </ShellScreen>
  );
}

function getDrivePhase(status: ReturnType<typeof useRunSessionStore.getState>['status']): DrivePhase | null {
  if (status === 'draft') {
    return 'planning';
  }

  if (status === 'ready') {
    return 'lobby';
  }

  if (status === 'active') {
    return 'live';
  }

  return null;
}

function labelForPhase(phase: DrivePhase) {
  if (phase === 'planning') {
    return 'Planning';
  }

  if (phase === 'lobby') {
    return 'Open lobby';
  }

  return 'Live convoy';
}

function labelForConnectivity(status: ReturnType<typeof useRunSessionStore.getState>['connectivityStatus']) {
  if (status === 'offline') {
    return 'Offline';
  }

  if (status === 'reconnecting') {
    return 'Reconnecting';
  }

  return 'Online';
}

function descriptionForPhase(phase: DrivePhase, routeDistanceLabel: string, joinCode: string | null) {
  if (phase === 'planning') {
    return routeDistanceLabel === 'No route locked'
      ? 'Route draft is still taking shape before the crew joins.'
      : `${routeDistanceLabel}. Fine-tune the route before locking the lobby.`;
  }

  if (phase === 'lobby') {
    return joinCode
      ? `Lobby is open and drivers can join with code ${joinCode}.`
      : 'Lobby is open and the convoy is almost ready to launch.';
  }

  return 'Convoy is live. Jump straight back into the map and the active run controls.';
}

function TelemetryCard({
  detail,
  label,
  theme,
  value,
}: {
  detail: string;
  label: string;
  theme: ReturnType<typeof useAppTheme>['theme'];
  value: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 24,
        backgroundColor: theme.colors.panel,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: 16,
        paddingVertical: 18,
        gap: 6,
      }}
    >
      <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.textPrimary, fontSize: 26, fontWeight: '900' }}>
        {value}
      </Text>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
        {detail}
      </Text>
    </View>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'accent' | 'neutral';
}) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: tone === 'accent' ? theme.colors.accentMuted : theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: tone === 'accent' ? theme.colors.accentGlow : theme.colors.border,
      }}
    >
      <Text
        style={{
          color: tone === 'accent' ? theme.colors.accent : theme.colors.textSecondary,
          fontSize: 12,
          fontWeight: '800',
          letterSpacing: 1.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        flex: 1,
        borderRadius: 22,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 14,
        gap: 6,
      }}
    >
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text style={{ color: theme.colors.textPrimary, fontSize: 17, fontWeight: '800' }}>
        {value}
      </Text>
    </View>
  );
}
