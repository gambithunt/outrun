import { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

export function AppCard({ children }: PropsWithChildren) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.panel,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 22,
        gap: 14,
        shadowColor: '#000000',
        shadowOpacity: 0.28,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 14 },
        elevation: 10,
      }}
    >
      {children}
    </View>
  );
}
