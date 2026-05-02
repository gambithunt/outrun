import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/contexts/ThemeContext';
import { AppShellTab, useRunSessionStore } from '@/stores/runSessionStore';

const TAB_CONFIG: Array<{
  key: AppShellTab;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  path: '/';
} | {
  key: AppShellTab;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  path: '/drive' | '/friends' | '/profile';
}> = [
  { key: 'start', label: 'Start', icon: 'speed', path: '/' },
  { key: 'drive', label: 'Drive', icon: 'explore', path: '/drive' },
  { key: 'friends', label: 'Friends', icon: 'groups', path: '/friends' },
  { key: 'profile', label: 'Profile', icon: 'person', path: '/profile' },
];

export function MainTabBar({ activeTab }: { activeTab: AppShellTab }) {
  const router = useRouter();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const setCurrentTab = useRunSessionStore((state) => state.setCurrentTab);

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          backgroundColor: theme.colors.tabBar,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 32,
          paddingHorizontal: 8,
          paddingVertical: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'stretch',
          shadowColor: '#000000',
          shadowOpacity: 0.26,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 12 },
          elevation: 12,
        }}
      >
        {TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              onPress={() => {
                setCurrentTab(tab.key);
                router.replace(tab.path);
              }}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 24,
                backgroundColor: isActive ? theme.colors.surfaceElevated : 'transparent',
                borderWidth: isActive ? 1 : 0,
                borderColor: isActive ? theme.colors.border : 'transparent',
                paddingHorizontal: 10,
                paddingVertical: 10,
                opacity: pressed ? 0.86 : 1,
              })}
              testID={`tab-${tab.key}`}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isActive ? theme.colors.accentMuted : 'transparent',
                }}
              >
                <MaterialIcons
                  color={isActive ? theme.colors.accent : theme.colors.textSecondary}
                  name={tab.icon}
                  size={22}
                />
              </View>
              <Text
                style={{
                  color: isActive ? theme.colors.textPrimary : theme.colors.textSecondary,
                  fontWeight: '800',
                  fontSize: 11,
                  letterSpacing: 1.8,
                  textTransform: 'uppercase',
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function resolveShellTabForPathname(pathname: string | null | undefined): AppShellTab | null {
  if (pathname === '/') {
    return 'start';
  }

  if (pathname === '/drive') {
    return 'drive';
  }

  if (pathname === '/friends') {
    return 'friends';
  }

  if (pathname === '/profile') {
    return 'profile';
  }

  return null;
}
