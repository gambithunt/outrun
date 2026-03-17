import { Text } from 'react-native';

import { Screen } from '@/components/Screen';
import { AppCard } from '@/components/ui/AppCard';
import { useAppTheme } from '@/contexts/ThemeContext';

type PlaceholderScreenProps = {
  title: string;
  description: string;
  testID?: string;
};

export function PlaceholderScreen({ title, description, testID }: PlaceholderScreenProps) {
  const { theme } = useAppTheme();

  return (
    <Screen testID={testID}>
      <AppCard>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 28,
            fontWeight: '800',
            marginBottom: 12,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>{description}</Text>
      </AppCard>
    </Screen>
  );
}
