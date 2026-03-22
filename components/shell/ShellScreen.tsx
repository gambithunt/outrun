import { MaterialIcons } from '@expo/vector-icons';
import { PropsWithChildren } from 'react';
import { SafeAreaView, ScrollView, StyleProp, Text, View, ViewStyle } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';
import { AppShellTab, useRunSessionStore } from '@/stores/runSessionStore';

import { MainTabBar } from './MainTabBar';

type ShellScreenProps = PropsWithChildren<{
  activeTab: AppShellTab;
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function ShellScreen({
  activeTab,
  children,
  contentContainerStyle,
  scrollable = true,
  testID,
}: ShellScreenProps) {
  const { theme } = useAppTheme();
  const connectivityStatus = useRunSessionStore((state) => state.connectivityStatus);
  const signalColor =
    connectivityStatus === 'offline'
      ? theme.colors.danger
      : connectivityStatus === 'reconnecting'
        ? theme.colors.warning
        : theme.colors.textPrimary;

  const contentStyle: StyleProp<ViewStyle> = [
    {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 32,
      gap: 20,
    },
    contentContainerStyle,
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} testID={testID}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -80,
            right: -40,
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: theme.colors.accentMuted,
            opacity: 0.22,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 240,
            left: -90,
            width: 180,
            height: 180,
            borderRadius: 90,
            backgroundColor: theme.colors.surfaceElevated,
            opacity: 0.35,
          }}
        />

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text
            style={{
              color: theme.colors.textPrimary,
              fontSize: 24,
              fontWeight: '900',
              fontStyle: 'italic',
              letterSpacing: -0.8,
              textTransform: 'uppercase',
            }}
            testID="shell-brand-wordmark"
          >
            CLUBRUN
          </Text>

          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 18,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialIcons color={signalColor} name="wifi-tethering" size={24} />
          </View>
        </View>

        {scrollable ? (
          <ScrollView contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View style={contentStyle}>{children}</View>
        )}
      </View>
      <MainTabBar activeTab={activeTab} />
    </SafeAreaView>
  );
}
