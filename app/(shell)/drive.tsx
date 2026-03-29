import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

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
    scheduledRunHero,
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
          {hasLiveContext ? 'Resume convoy' : 'Ready to roll'}
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 17, lineHeight: 25 }}>
          {hasLiveContext
            ? 'Map, lobby, and route controls stay one tap away while the crew is moving.'
            : 'Keep the next run close, then jump back into the map when the route is ready.'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TelemetryCard
          detail={labelForConnectivity(connectivityStatus)}
          label="Connection"
          theme={theme}
          value={connectivityStatus === 'offline' ? 'Offline' : connectivityStatus === 'reconnecting' ? 'Syncing' : 'Live'}
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
                : drivePhase === 'live'
                  ? 'Live'
                  : 'Idle'
          }
        />
      </View>

      {hasLiveContext && drivePhase ? (
        <>
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
                label="Open Map"
                onPress={handleOpenMap}
                variant="secondary"
                testID="button-open-drive-map"
              />
            </View>
          </AppCard>

          <View style={{ gap: 12 }}>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 30, fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase' }}>
              Quick actions
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ActionTile
                label="Runs"
                detail="Dashboard and history"
                onPress={() => router.push('/')}
              />
              <ActionTile
                label="Friends"
                detail="Recent crew"
                onPress={() => router.push('/friends')}
              />
              <ActionTile
                label="Profile"
                detail="Garage and account"
                onPress={() => router.push('/profile')}
              />
            </View>
          </View>
        </>
      ) : (
        <AppCard>
          <StatusPill label="Drive shell" tone="neutral" />
          <Text style={{ color: theme.colors.textPrimary, fontSize: 34, fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase' }}>
            Ready to roll
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 16, lineHeight: 23 }}>
            Start a route from the Runs tab, or join an active session and this drive deck will turn into mission control.
          </Text>

          <View style={{ gap: 10 }}>
            <AppButton
              label="Start New Run"
              onPress={() => router.push('/create')}
              testID="button-start-new-run"
            />
            <AppButton
              label="Join Run"
              onPress={() => router.push('/join')}
              variant="secondary"
              testID="button-join-run-drive"
            />
          </View>

          {scheduledRunHero ? (
            <View style={{ gap: 12 }}>
              <Text style={{ color: theme.colors.textPrimary, fontSize: 30, fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase' }}>
                Next up
              </Text>
              <View
                style={{
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                  padding: 18,
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    fontSize: 12,
                    fontWeight: '800',
                    letterSpacing: 1.8,
                    textTransform: 'uppercase',
                  }}
                >
                  {scheduledRunHero.visibility === 'club' ? 'Club Run' : 'Scheduled Run'}
                </Text>
                <Text style={{ color: theme.colors.textPrimary, fontSize: 26, fontWeight: '900' }}>
                  {scheduledRunHero.name}
                </Text>
                <Text style={{ color: theme.colors.textSecondary }}>
                  {new Date(scheduledRunHero.scheduledFor).toLocaleString()}
                </Text>
              </View>
            </View>
          ) : null}
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

function ActionTile({
  detail,
  label,
  onPress,
}: {
  detail: string;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        borderRadius: 24,
        backgroundColor: pressed ? theme.colors.surfaceElevated : theme.colors.panel,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 16,
        gap: 8,
      })}
    >
      <Text style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '900' }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
        {detail}
      </Text>
    </Pressable>
  );
}
