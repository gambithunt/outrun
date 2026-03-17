import { Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { useAuthSession } from '@/contexts/AuthContext';
import { ThemeMode, useAppTheme } from '@/contexts/ThemeContext';
import { getFirebaseRuntimeSummary } from '@/lib/firebase';

const MODES: ThemeMode[] = ['system', 'dark', 'light'];

export default function SettingsScreen() {
  const { mode, setMode, theme } = useAppTheme();
  const auth = useAuthSession();
  const firebase = getFirebaseRuntimeSummary();

  return (
    <Screen testID="screen-settings">
      <AppCard>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 24,
            fontWeight: '700',
            marginBottom: 8,
          }}
        >
          Appearance
        </Text>
        <Text style={{ color: theme.colors.textSecondary, lineHeight: 22, marginBottom: 16 }}>
          Choose whether ClubRun follows the system appearance or stays locked to a manual theme.
        </Text>

        <View style={{ gap: 12 }}>
          {MODES.map((themeMode) => (
            <AppButton
              key={themeMode}
              label={themeMode === 'system' ? 'System' : themeMode === 'dark' ? 'Dark' : 'Light'}
              onPress={() => setMode(themeMode)}
              testID={`theme-option-${themeMode}`}
              variant={mode === themeMode ? 'primary' : 'secondary'}
            />
          ))}
        </View>
      </AppCard>

      <AppCard>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 24,
            fontWeight: '700',
            marginBottom: 8,
          }}
        >
          Firebase
        </Text>
        <Text style={{ color: theme.colors.textSecondary, lineHeight: 22, marginBottom: 16 }}>
          Use this panel before real-device testing to confirm whether ClubRun is pointed at local
          emulators or your live Firebase project, and whether the app has an authenticated user.
        </Text>
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.textPrimary }} testID="text-firebase-mode">
            Mode: {formatFirebaseMode(firebase.mode)}
          </Text>
          <Text style={{ color: theme.colors.textPrimary }} testID="text-firebase-project">
            Project: {firebase.projectId ?? 'Not configured'}
          </Text>
          <Text style={{ color: theme.colors.textPrimary }} testID="text-firebase-database">
            Database: {firebase.databaseTarget}
          </Text>
          <Text style={{ color: theme.colors.textPrimary }} testID="text-firebase-auth-status">
            Auth:{' '}
            {auth.status === 'loading'
              ? 'Connecting'
              : auth.status === 'error'
                ? auth.error ?? 'Error'
                : auth.userId
                  ? `Signed in as ${auth.userId}`
                  : 'Not signed in'}
          </Text>
        </View>
      </AppCard>
    </Screen>
  );
}

function formatFirebaseMode(mode: ReturnType<typeof getFirebaseRuntimeSummary>['mode']) {
  if (mode === 'emulator') {
    return 'Local emulator';
  }

  if (mode === 'production') {
    return 'Live Firebase';
  }

  return 'Not configured';
}
