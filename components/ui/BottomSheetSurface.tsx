import { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

export function BottomSheetSurface({ children }: PropsWithChildren) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceElevated,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {children}
    </View>
  );
}
