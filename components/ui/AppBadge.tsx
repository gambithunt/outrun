import { Text, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

export function AppBadge({ label }: { label: string }) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        backgroundColor: theme.colors.accentMuted,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </View>
  );
}
