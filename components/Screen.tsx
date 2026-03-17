import { PropsWithChildren, ReactNode } from 'react';
import { SafeAreaView, ScrollView, StyleProp, View, ViewStyle } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

type ScreenProps = PropsWithChildren<{
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  testID?: string;
}>;

export function Screen({
  children,
  contentContainerStyle,
  footer,
  scrollable = false,
  testID,
}: ScreenProps) {
  const { theme } = useAppTheme();
  const sharedStyle: StyleProp<ViewStyle> = [
    {
      flexGrow: 1,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 24,
    },
    contentContainerStyle,
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} testID={testID}>
      {scrollable ? (
        <ScrollView contentContainerStyle={sharedStyle}>{children}</ScrollView>
      ) : (
        <View style={sharedStyle}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}
