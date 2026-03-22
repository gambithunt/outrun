import { Pressable, StyleProp, Text, TextStyle } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'default' | 'compact';
  disabled?: boolean;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
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
  const borderColor =
    variant === 'primary' ? theme.colors.accent : variant === 'secondary' ? theme.colors.border : 'transparent';
  const textColor = variant === 'primary' ? theme.colors.onAccent : theme.colors.textPrimary;
  const minHeight = size === 'compact' ? 46 : 58;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: size === 'compact' ? 16 : 20,
        backgroundColor,
        borderWidth,
        borderColor,
        minHeight,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: size === 'compact' ? 16 : 20,
        shadowColor: variant === 'primary' ? theme.colors.accent : '#000000',
        shadowOpacity: variant === 'primary' ? 0.34 : 0,
        shadowRadius: variant === 'primary' ? 20 : 0,
        shadowOffset: { width: 0, height: 10 },
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
      })}
      testID={testID}
    >
      <Text
        style={[
          {
            color: textColor,
            fontWeight: '800',
            fontSize: size === 'compact' ? 14 : 16,
            fontStyle: variant === 'primary' && size !== 'compact' ? 'italic' : 'normal',
            letterSpacing: size === 'compact' ? 1.4 : 2,
            textTransform: 'uppercase',
          },
          labelStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
