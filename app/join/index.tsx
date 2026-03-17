import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAppTheme } from '@/contexts/ThemeContext';
import { resolveJoinCodeWithFirebase } from '@/lib/runService';

export default function JoinRunScreen() {
  const router = useRouter();
  const { code: prefilledCode } = useLocalSearchParams<{ code?: string }>();
  const { theme } = useAppTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resolvedRunId, setResolvedRunId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (prefilledCode) {
      setCode(prefilledCode);
    }
  }, [prefilledCode]);

  async function handleResolveCode() {
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await resolveJoinCodeWithFirebase(code);
      if (!result) {
        throw new Error('No run found for that join code.');
      }

      setResolvedRunId(result.runId);
      router.push({
        pathname: '/join/profile',
        params: {
          runId: result.runId,
          code: code.trim(),
        },
      });
    } catch (nextError) {
      setResolvedRunId(null);
      setError(nextError instanceof Error ? nextError.message : 'Unable to resolve join code.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen testID="screen-join-run" contentContainerStyle={{ gap: 16 }}>
      <AppCard>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 28,
            fontWeight: '800',
          }}
        >
          Join a Run
        </Text>
        <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
          Enter the 6-digit code shared by your club admin to join an active or draft run.
        </Text>
      </AppCard>

      <AppCard>
        <AppTextInput
          label="Join code"
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          testID="input-join-code"
        />
        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
        {isSubmitting ? <LoadingSpinner /> : null}
        <AppButton label="Continue" onPress={handleResolveCode} testID="button-submit-join-code" />
      </AppCard>

      {resolvedRunId ? (
        <AppCard>
          <Text style={{ color: theme.colors.textSecondary }}>Resolved run</Text>
          <Text style={{ color: theme.colors.textPrimary }} testID="text-resolved-run-id">
            {resolvedRunId}
          </Text>
        </AppCard>
      ) : null}
    </Screen>
  );
}
