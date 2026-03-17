import { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

export function AppCard({ children }: PropsWithChildren) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 20,
        gap: 12,
      }}
    >
      {children}
    </View>
  );
}
