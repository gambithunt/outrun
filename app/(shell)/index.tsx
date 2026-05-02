import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ShellScreen } from '@/components/shell/ShellScreen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAuthSession } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { AdminRunHistoryEntry, loadAdminRunHistory } from '@/lib/adminRunHistory';
import {
  buildRunsDashboardSections,
  loadInvitedRunsForUserWithFirebase,
  loadScheduledRunsForUserWithFirebase,
} from '@/lib/scheduledRunService';
import { Run } from '@/types/domain';
import { useRunSessionStore } from '@/stores/runSessionStore';

function statusLabelForHero(hero: Run | AdminRunHistoryEntry | null) {
  if (!hero) {
    return 'Ready when you are';
  }

  if ('scheduledFor' in hero && typeof hero.scheduledFor === 'number') {
    return 'Upcoming run';
  }

  if (hero.status === 'active') {
    return 'Active convoy';
  }

  if (hero.status === 'ready') {
    return 'Open lobby';
  }

  if (hero.status === 'draft') {
    return 'Route draft';
  }

  return 'Recent run';
}

function heroTitle(hero: Run | AdminRunHistoryEntry | null) {
  return hero?.name ?? 'Build the next convoy';
}

export default function HomeScreen() {
  const router = useRouter();
  const auth = useAuthSession();
  const { theme } = useAppTheme();
  const session = useRunSessionStore();
  const account = useRunSessionStore((state) => state.account);
  const [recentRuns, setRecentRuns] = useState<AdminRunHistoryEntry[]>([]);
  const [scheduledRuns, setScheduledRuns] = useState<Run[]>([]);
  const [invitedRuns, setInvitedRuns] = useState<Run[]>([]);
  const accountUserId = account?.userId ?? auth.userId;

  useFocusEffect(
    useCallback(() => {
      void loadAdminRunHistory().then(setRecentRuns);
    }, [])
  );

  useEffect(() => {
    if (!accountUserId) {
      setScheduledRuns([]);
      return;
    }

    let cancelled = false;

    void loadScheduledRunsForUserWithFirebase(accountUserId)
      .then((runs) => {
        if (!cancelled) {
          setScheduledRuns(runs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScheduledRuns([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountUserId]);

  useEffect(() => {
    if (!accountUserId) {
      setInvitedRuns([]);
      return;
    }

    let cancelled = false;

    void loadInvitedRunsForUserWithFirebase(accountUserId)
      .then((runs) => {
        if (!cancelled) {
          setInvitedRuns(runs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInvitedRuns([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountUserId]);

  const dashboard = useMemo(
    () =>
      buildRunsDashboardSections({
        runs: scheduledRuns,
        invitedRuns,
        history: recentRuns,
      }),
    [invitedRuns, recentRuns, scheduledRuns]
  );

  useEffect(() => {
    if (dashboard.hero && 'scheduledFor' in dashboard.hero && typeof dashboard.hero.scheduledFor === 'number') {
      useRunSessionStore.getState().setScheduledRunHero({
        runId: dashboard.hero.joinCode,
        name: dashboard.hero.name,
        scheduledFor: dashboard.hero.scheduledFor,
        visibility: dashboard.hero.visibility ?? 'private',
      });
      return;
    }

    useRunSessionStore.getState().setScheduledRunHero(null);
  }, [dashboard.hero]);

  function handleResumeRun(entry: AdminRunHistoryEntry) {
    session.setSession({
      runId: entry.runId,
      driverId: entry.driverId,
      driverName: 'You',
      joinCode: entry.joinCode,
      role: 'admin',
      status: entry.status,
    });

    if (entry.status === 'draft') {
      router.push({
        pathname: '/create/route',
        params: { runId: entry.runId, joinCode: entry.joinCode },
      });
    } else {
      router.push(`/run/${entry.runId}/map`);
    }
  }

  const metrics = [
    {
      label: 'History',
      value: String(dashboard.recent.length),
      detail: dashboard.recent.length === 1 ? 'Route in history' : 'Routes in history',
    },
    {
      label: 'Upcoming',
      value: String(dashboard.upcoming.length),
      detail: dashboard.upcoming.length === 1 ? 'Scheduled convoy' : 'Scheduled convoys',
    },
    {
      label: 'Invites',
      value: String(dashboard.invites.length),
      detail: dashboard.invites.length === 1 ? 'Waiting for you' : 'Waiting for you',
    },
  ];

  return (
    <ShellScreen activeTab="start" testID="screen-home">
      <View style={{ gap: 10 }}>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: 13,
            fontWeight: '800',
            letterSpacing: 2.4,
            textTransform: 'uppercase',
          }}
        >
          Mission Control
        </Text>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 40,
            fontWeight: '900',
            letterSpacing: -1.6,
          }}
        >
          Start
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 17, lineHeight: 25 }}>
          Launch a new convoy, rejoin a live lobby, or reopen the routes worth running again.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {metrics.map((metric) => (
          <View
            key={metric.label}
            style={{
              flex: 1,
              borderRadius: 24,
              backgroundColor: theme.colors.panel,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 14,
              paddingVertical: 16,
              gap: 6,
            }}
          >
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}
            >
              {metric.label}
            </Text>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 28, fontWeight: '900' }}>
              {metric.value}
            </Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
              {metric.detail}
            </Text>
          </View>
        ))}
      </View>

      <ActionFeatureCard
        action={statusLabelForHero(dashboard.hero)}
        body="Host a private or club convoy, invite your crew, and move straight into route planning."
        ctaLabel="Start Engine"
        heroTitle="Create A Run"
        onPress={() => router.push('/create')}
        testID="button-new-run"
        theme={theme}
      />

      <ActionFeatureCard
        action={dashboard.invites.length > 0 ? `${dashboard.invites.length} live invites` : 'Crew access'}
        body={`Jump into ${heroTitle(dashboard.hero)} or browse the next lobby waiting for you.`}
        ctaLabel="Browse Sessions"
        heroTitle="Join A Run"
        onPress={() => router.push('/join')}
        testID="button-join-run-hero"
        theme={theme}
        variant="secondary"
      />

      {dashboard.upcoming.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionHeading theme={theme} title="Upcoming" />
          {dashboard.upcoming.slice(0, 2).map((run) => (
            <AppCard key={`${run.name}-${run.scheduledFor ?? run.createdAt}`}>
              <Text style={eyebrowTextStyle(theme.colors.textSecondary)}>
                {run.visibility === 'club' ? 'Club Invite' : 'Scheduled Run'}
              </Text>
              <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '900' }}>
                {run.name}
              </Text>
              <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
                {new Date(run.scheduledFor ?? run.createdAt).toLocaleString()}
              </Text>
            </AppCard>
          ))}
        </View>
      ) : null}

      {dashboard.invites.length > 0 ? (
        <View style={{ gap: 12 }}>
          <SectionHeading theme={theme} title="Invites" />
          {dashboard.invites.slice(0, 3).map((run) => (
            <AppCard key={`invite-${run.joinCode}-${run.createdAt}`}>
              <Text style={eyebrowTextStyle(theme.colors.textSecondary)}>
                {run.visibility === 'club' ? 'Club Invite' : 'Incoming Invite'}
              </Text>
              <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '900' }}>
                {run.name}
              </Text>
              <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
                {typeof run.scheduledFor === 'number'
                  ? new Date(run.scheduledFor).toLocaleString()
                  : `Join code ${run.joinCode}`}
              </Text>
            </AppCard>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <SectionHeading theme={theme} title="Recent Runs" />
        {dashboard.recent.length === 0 ? (
          <AppCard>
            <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
              Your latest convoy drafts and finishes will show up here once you start building routes.
            </Text>
          </AppCard>
        ) : (
          dashboard.recent.map((entry) => (
            <Pressable
              key={entry.runId}
              onPress={() => handleResumeRun(entry)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? theme.colors.surfaceElevated : theme.colors.panel,
                borderRadius: 28,
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 18,
                gap: 14,
              })}
              testID={`button-resume-run-${entry.runId}`}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={eyebrowTextStyle(theme.colors.textSecondary)}>{entry.status}</Text>
                  <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '900' }}>
                    {entry.name}
                  </Text>
                  <Text style={{ color: theme.colors.textSecondary }}>
                    {`Join code ${entry.joinCode}`}
                  </Text>
                </View>
                <View
                  style={{
                    minWidth: 96,
                  }}
                >
                  <AppButton label="Resume" onPress={() => handleResumeRun(entry)} size="compact" variant="secondary" />
                </View>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ShellScreen>
  );
}

function SectionHeading({
  theme,
  title,
}: {
  theme: ReturnType<typeof useAppTheme>['theme'];
  title: string;
}) {
  return (
    <Text
      style={{
        color: theme.colors.textPrimary,
        fontSize: 30,
        fontWeight: '900',
        fontStyle: 'italic',
        letterSpacing: -1,
        textTransform: 'uppercase',
      }}
    >
      {title}
    </Text>
  );
}

function ActionFeatureCard({
  action,
  body,
  ctaLabel,
  heroTitle,
  onPress,
  testID,
  theme,
  variant = 'primary',
}: {
  action: string;
  body: string;
  ctaLabel: string;
  heroTitle: string;
  onPress: () => void;
  testID: string;
  theme: ReturnType<typeof useAppTheme>['theme'];
  variant?: 'primary' | 'secondary';
}) {
  return (
    <View
      style={{
        borderRadius: 32,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.panel,
        padding: 22,
        gap: 18,
        overflow: 'hidden',
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -30,
          top: -20,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: variant === 'primary' ? theme.colors.accentMuted : theme.colors.surfaceElevated,
          opacity: 0.8,
        }}
      />
      <Text style={eyebrowTextStyle(theme.colors.accent)}>{action}</Text>
      <View style={{ gap: 8 }}>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 36,
            fontWeight: '900',
            fontStyle: 'italic',
            letterSpacing: -1.3,
            textTransform: 'uppercase',
          }}
        >
          {heroTitle}
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 17, lineHeight: 24 }}>
          {body}
        </Text>
      </View>
      <View style={{ width: variant === 'secondary' ? 260 : 200 }}>
        <AppButton
          label={ctaLabel}
          onPress={onPress}
          testID={testID}
          variant={variant === 'primary' ? 'primary' : 'secondary'}
          labelStyle={{ flexShrink: 0 }}
        />
      </View>
    </View>
  );
}

function eyebrowTextStyle(color: string) {
  return {
    color,
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  };
}
