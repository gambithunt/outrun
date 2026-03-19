import { ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Text } from 'react-native';
import 'react-native-reanimated';

import { Screen } from '@/components/Screen';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AuthProvider, useAuthSession } from '@/contexts/AuthContext';
import { ensureBackgroundTrackingTaskRegisteredWithExpo } from '@/lib/backgroundTracking';
import { useDeviceLocationStore } from '@/stores/deviceLocationStore';
import { AppThemeProvider, useAppTheme } from '@/contexts/ThemeContext';

ensureBackgroundTrackingTaskRegisteredWithExpo();

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </AppThemeProvider>
  );
}

function RootNavigator() {
  const { navigationTheme, theme } = useAppTheme();
  const auth = useAuthSession();
  const bootstrapLocation = useDeviceLocationStore((state) => state.bootstrapLocation);

  useEffect(() => {
    void bootstrapLocation();
  }, [bootstrapLocation]);

  if (auth.status === 'loading') {
    return (
      <Screen testID="screen-auth-loading">
        <LoadingSpinner />
        <Text style={{ color: theme.colors.textPrimary }} testID="text-auth-loading">
          Connecting ClubRun to Firebase…
        </Text>
      </Screen>
    );
  }

  if (auth.status === 'error') {
    return (
      <Screen testID="screen-auth-error">
        <Text style={{ color: theme.colors.danger, fontWeight: '700' }} testID="text-auth-error">
          {auth.error ?? 'Unable to authenticate ClubRun.'}
        </Text>
      </Screen>
    );
  }

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="create/index" options={{ headerShown: false }} />
        <Stack.Screen name="create/route" options={{ headerShown: false }} />
        <Stack.Screen name="join/index" options={{ title: 'Join a Run' }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Join ClubRun' }} />
        <Stack.Screen name="join/profile" options={{ title: 'Driver Profile' }} />
        <Stack.Screen name="run/[id]/map" options={{ headerShown: false }} />
        <Stack.Screen name="run/[id]/summary" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not Found' }} />
      </Stack>
    </NavigationThemeProvider>
  );
}
