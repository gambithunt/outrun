import { Stack, usePathname } from 'expo-router';
import { View } from 'react-native';

import { MainTabBar, resolveShellTabForPathname } from '@/components/shell/MainTabBar';

export default function ShellLayout() {
  const pathname = usePathname();
  const activeShellTab = resolveShellTabForPathname(pathname) ?? 'runs';

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="drive" />
          <Stack.Screen name="friends" />
          <Stack.Screen name="profile" />
        </Stack>
      </View>
      <MainTabBar activeTab={activeShellTab} />
    </View>
  );
}
