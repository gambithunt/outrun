import { Pressable, Text } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  testID?: string;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  testID,
}: AppButtonProps) {
  const { theme } = useAppTheme();

  const backgroundColor =
    variant === 'primary'
      ? theme.colors.accent
      : variant === 'secondary'
        ? theme.colors.surfaceElevated
        : 'transparent';
  const borderWidth = variant === 'ghost' ? 0 : 1;
  const borderColor = variant === 'primary' ? theme.colors.accent : theme.colors.border;
  const textColor = variant === 'primary' ? theme.colors.onAccent : theme.colors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 18,
        backgroundColor,
        borderWidth,
        borderColor,
        minHeight: 56,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
        opacity: pressed ? 0.88 : 1,
      })}
      testID={testID}
    >
      <Text style={{ color: textColor, fontWeight: '700', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}
