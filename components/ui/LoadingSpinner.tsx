import { ActivityIndicator, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

export function LoadingSpinner() {
  const { theme } = useAppTheme();

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <ActivityIndicator color={theme.colors.accent} />
    </View>
  );
}
