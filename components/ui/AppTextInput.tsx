import { Text, TextInput, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';

type AppTextInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  multiline?: boolean;
  numberOfLines?: number;
  testID?: string;
};

export function AppTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  multiline = false,
  numberOfLines,
  testID,
}: AppTextInputProps) {
  const { theme } = useAppTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>{label}</Text>
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        multiline={multiline}
        numberOfLines={numberOfLines}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          color: theme.colors.textPrimary,
          minHeight: multiline ? 112 : 52,
          paddingHorizontal: 16,
          paddingTop: multiline ? 16 : 0,
          paddingBottom: multiline ? 16 : 0,
        }}
        testID={testID}
        value={value}
      />
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
    </View>
  );
}
