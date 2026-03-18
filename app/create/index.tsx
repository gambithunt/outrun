import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAppTheme } from '@/contexts/ThemeContext';
import { saveAdminRunToHistory } from '@/lib/adminRunHistory';
import { createRunWithFirebase } from '@/lib/runService';
import { useRunSessionStore } from '@/stores/runSessionStore';

export default function CreateRunScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const setSession = useRunSessionStore((state) => state.setSession);
  const setRunSnapshot = useRunSessionStore((state) => state.setRunSnapshot);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxDrivers, setMaxDrivers] = useState('15');
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreateRun() {
    setError(null);
    setIsSubmitting(true);

    try {
      const createdRun = await createRunWithFirebase({
        name,
        description,
        maxDrivers: Number(maxDrivers),
      });
      setJoinCode(createdRun.joinCode);
      setRunId(createdRun.runId);
      setSession({
        runId: createdRun.runId,
        driverId: createdRun.adminId,
        driverName: 'Admin',
        joinCode: createdRun.joinCode,
        role: 'admin',
        status: createdRun.run.status,
      });
      setRunSnapshot({
        name: createdRun.run.name,
        status: createdRun.run.status,
        route: createdRun.run.route ?? null,
      });
      void saveAdminRunToHistory({
        runId: createdRun.runId,
        name: createdRun.run.name,
        joinCode: createdRun.joinCode,
        driverId: createdRun.adminId,
        status: createdRun.run.status,
        createdAt: Date.now(),
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create run.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scrollable testID="screen-create-run" contentContainerStyle={{ gap: 16 }}>
      <AppCard>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 28,
            fontWeight: '800',
          }}
        >
          Create a Run
        </Text>
        <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
          Start a draft run, generate a shareable join code, and prepare the convoy before route
          planning begins.
        </Text>
      </AppCard>

      <AppCard>
        <AppTextInput
          label="Run name"
          value={name}
          onChangeText={setName}
          placeholder="Sunday Scenic Drive"
          testID="input-run-name"
        />
        <AppTextInput
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Optional notes for the club"
          testID="input-run-description"
        />
        <AppTextInput
          label="Max drivers"
          value={maxDrivers}
          onChangeText={setMaxDrivers}
          placeholder="15"
          testID="input-run-max-drivers"
        />
        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
        {isSubmitting ? <LoadingSpinner /> : null}
        <AppButton label="Generate Join Code" onPress={handleCreateRun} testID="button-submit-run" />
      </AppCard>

      {joinCode ? (
        <AppCard>
          <Text style={{ color: theme.colors.textSecondary }}>Draft run created</Text>
          <Text
            style={{
              color: theme.colors.textPrimary,
              fontSize: 36,
              fontWeight: '800',
              letterSpacing: 4,
            }}
            testID="text-generated-code"
          >
            {joinCode}
          </Text>
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.textSecondary }}>Run id</Text>
            <Text style={{ color: theme.colors.textPrimary }} testID="text-generated-run-id">
              {runId}
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.textSecondary }}>Max drivers</Text>
            <Text style={{ color: theme.colors.textPrimary }} testID="text-generated-max-drivers">
              {createdRunCapacityLabel(maxDrivers)}
            </Text>
          </View>
          <AppButton
            label="Plan Route"
            onPress={() =>
              router.push({
                pathname: '/create/route',
                params: {
                  runId: runId ?? '',
                  joinCode,
                },
              })
            }
            testID="button-plan-route"
          />
        </AppCard>
      ) : null}
    </Screen>
  );
}

function createdRunCapacityLabel(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : value;
}
