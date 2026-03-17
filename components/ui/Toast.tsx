import { Text, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

export function Toast({ message, testID }: { message: string; testID?: string }) {
  const { theme } = useAppTheme();

  return (
    <View
      accessibilityRole="alert"
      testID={testID}
      style={{
        backgroundColor: theme.colors.surfaceElevated,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <Text style={{ color: theme.colors.textPrimary }}>{message}</Text>
    </View>
  );
}
