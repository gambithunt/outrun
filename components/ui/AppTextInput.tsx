import { Text, TextInput, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

type AppTextInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  numberOfLines?: number;
  secureTextEntry?: boolean;
  testID?: string;
};

export function AppTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  autoFocus = false,
  autoCapitalize = 'sentences',
  multiline = false,
  numberOfLines,
  secureTextEntry = false,
  testID,
}: AppTextInputProps) {
  const { theme } = useAppTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontWeight: '800',
          fontSize: 12,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <TextInput
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        multiline={multiline}
        numberOfLines={numberOfLines}
        secureTextEntry={secureTextEntry}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          color: theme.colors.textPrimary,
          minHeight: multiline ? 120 : 56,
          paddingHorizontal: 18,
          paddingTop: multiline ? 18 : 0,
          paddingBottom: multiline ? 18 : 0,
          fontSize: 16,
        }}
        testID={testID}
        value={value}
      />
      {error ? <Text style={{ color: theme.colors.danger, lineHeight: 20 }}>{error}</Text> : null}
    </View>
  );
}
