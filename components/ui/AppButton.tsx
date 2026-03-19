import { Pressable, StyleProp, Text, TextStyle } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  labelStyle,
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
      disabled={disabled}
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
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
      })}
      testID={testID}
    >
      <Text style={[{ color: textColor, fontWeight: '700', fontSize: 16 }, labelStyle]}>{label}</Text>
    </Pressable>
  );
}
