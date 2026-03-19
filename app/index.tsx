import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/contexts/ThemeContext';
import { AdminRunHistoryEntry, loadAdminRunHistory } from '@/lib/adminRunHistory';
import { useRunSessionStore } from '@/stores/runSessionStore';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  ready: 'Lobby',
  active: 'Live',
  ended: 'Ended',
};

const STATUS_COLOR: Record<string, string> = {
  draft: '#8E8E93',
  ready: '#FF9500',
  active: '#34C759',
  ended: '#8E8E93',
};

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const setSession = useRunSessionStore((state) => state.setSession);
  const [recentRuns, setRecentRuns] = useState<AdminRunHistoryEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      void loadAdminRunHistory().then(setRecentRuns);
    }, [])
  );

  function handleResumeRun(entry: AdminRunHistoryEntry) {
    setSession({
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

  return (
    <Screen
      scrollable
      testID="screen-home"
      contentContainerStyle={{ gap: 20, paddingBottom: 32 }}
    >
      <View style={{ gap: 12 }}>
        <AppBadge label="Realtime convoy tracking" />
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 36,
            fontWeight: '800',
            letterSpacing: -1,
          }}
        >
          ClubRun
        </Text>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: 18,
            lineHeight: 28,
          }}
        >
          Coordinate car club drives with live maps, shared hazards, and rich post-run summaries.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <AppButton
          label="Create a Run"
          onPress={() => router.push('/create')}
          testID="button-create-run"
        />
        <AppButton
          label="Join a Run"
          variant="secondary"
          onPress={() => router.push('/join')}
          testID="button-join-run"
        />
      </View>

      <AppCard>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 20,
            fontWeight: '700',
            marginBottom: 12,
          }}
        >
          Your Recent Runs
        </Text>

        {recentRuns.length === 0 ? (
          <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
            Runs you create will appear here so you can quickly return after closing the app.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {recentRuns.map((entry) => (
              <Pressable
                key={entry.runId}
                onPress={() => handleResumeRun(entry)}
                testID={`button-resume-run-${entry.runId}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: pressed
                    ? theme.colors.surface + 'CC'
                    : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                })}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{ color: theme.colors.textPrimary, fontWeight: '600', fontSize: 15 }}
                    numberOfLines={1}
                  >
                    {entry.name}
                  </Text>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
                    Code: {entry.joinCode}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: (STATUS_COLOR[entry.status] ?? '#8E8E93') + '22',
                    }}
                  >
                    <Text
                      style={{
                        color: STATUS_COLOR[entry.status] ?? '#8E8E93',
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {STATUS_LABEL[entry.status] ?? entry.status}
                    </Text>
                  </View>
                  <Text style={{ color: theme.colors.accent, fontWeight: '600', fontSize: 14 }}>
                    Resume →
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </AppCard>

      <AppCard>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 20,
            fontWeight: '700',
            marginBottom: 8,
          }}
        >
          Ready for the full convoy workflow
        </Text>
        <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
          The current build includes the app shell, typed routes, theme system, and Firebase-ready
          foundations. The next slices will wire in run creation, joining, route planning, and live
          tracking.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={{ marginTop: 16 }}
          testID="button-open-settings"
        >
          <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>Open settings</Text>
        </Pressable>
      </AppCard>
    </Screen>
  );
}
