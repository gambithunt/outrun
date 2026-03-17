import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/contexts/ThemeContext';

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();

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
            marginBottom: 8,
          }}
        >
          Recent Admin Runs
        </Text>
        <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
          Your last three created runs will appear here once local history is wired up.
        </Text>
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
