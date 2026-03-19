import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/AppButton';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAppTheme } from '@/contexts/ThemeContext';
import { saveAdminRunToHistory } from '@/lib/adminRunHistory';
import { createRunWithFirebase } from '@/lib/runService';
import { useRunSessionStore } from '@/stores/runSessionStore';

const MIN_DRIVERS = 2;
const MAX_DRIVERS = 99;

export default function CreateRunScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const setSession = useRunSessionStore((state) => state.setSession);
  const setRunSnapshot = useRunSessionStore((state) => state.setRunSnapshot);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxDrivers, setMaxDrivers] = useState('15');
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRunDetails, setShowRunDetails] = useState(false);

  const parsedMaxDrivers = clampDriverCount(Number(maxDrivers));

  async function handleCreateRun() {
    setError(null);
    setIsSubmitting(true);

    try {
      const createdRun = await createRunWithFirebase({
        name,
        description,
        maxDrivers: parsedMaxDrivers,
      });
      setJoinCode(createdRun.joinCode);
      setRunId(createdRun.runId);
      setMaxDrivers(String(createdRun.run.maxDrivers ?? parsedMaxDrivers));
      setSession({
        runId: createdRun.runId,
        driverId: createdRun.adminId,
        driverName: 'You',
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

  async function handleShareInvite() {
    if (!joinCode) {
      return;
    }

    try {
      await Share.share({
        message: `Join the club run${name ? ` "${name}"` : ''} with code ${joinCode}.`,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to open the share sheet.');
    }
  }

  function adjustMaxDrivers(direction: 'decrease' | 'increase') {
    const delta = direction === 'increase' ? 1 : -1;
    setMaxDrivers(String(clampDriverCount(parsedMaxDrivers + delta)));
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} testID="screen-create-run">
      <Stack.Screen options={{ headerShown: false }} />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 10,
          left: 20,
          right: 20,
          zIndex: 10,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.94)',
            borderWidth: 1,
            borderColor: theme.colors.border,
            shadowColor: '#000000',
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
            opacity: pressed ? 0.86 : 1,
          })}
          testID="button-back-create-run"
        >
          <Text style={{ color: theme.colors.textPrimary, fontSize: 28, fontWeight: '700', marginLeft: -2 }}>
            ‹
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          gap: 20,
          paddingTop: insets.top + 88,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 20,
        }}
      >
        <View style={{ gap: 10 }}>
          <Text
            style={{
              color: theme.colors.textPrimary,
              fontSize: 34,
              fontWeight: '800',
              letterSpacing: -0.8,
            }}
          >
            Create the drive
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 17, lineHeight: 24 }}>
            Set the basics, generate an invite code for the club, then move straight into route
            planning.
          </Text>
        </View>

        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 20,
            gap: 20,
          }}
        >
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 22, fontWeight: '800' }}>
              Run details
            </Text>
            <Text style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
              Keep it simple now. You can still refine the route and the invite after this step.
            </Text>
          </View>

          <View style={{ gap: 18 }}>
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
              multiline
              numberOfLines={4}
              placeholder="Add a short note for drivers, meetup context, or the vibe of the run."
              testID="input-run-description"
            />
            <View
              style={{ gap: 10 }}
            >
              <View style={{ gap: 4 }}>
                <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                  Max drivers
                </Text>
                <Text style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
                  Choose how many cars can join this draft run.
                </Text>
              </View>

              <View
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  disabled={parsedMaxDrivers <= MIN_DRIVERS}
                  onPress={() => adjustMaxDrivers('decrease')}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    opacity: parsedMaxDrivers <= MIN_DRIVERS ? 0.35 : pressed ? 0.86 : 1,
                  })}
                  testID="button-decrease-max-drivers"
                >
                  <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '500' }}>
                    −
                  </Text>
                </Pressable>

                <View style={{ alignItems: 'center', gap: 4 }}>
                  <Text
                    style={{
                      color: theme.colors.textPrimary,
                      fontSize: 30,
                      fontWeight: '800',
                      letterSpacing: -0.5,
                    }}
                    testID="input-run-max-drivers"
                  >
                    {parsedMaxDrivers}
                  </Text>
                  <Text style={{ color: theme.colors.textSecondary, fontWeight: '600' }}>
                    drivers
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  disabled={parsedMaxDrivers >= MAX_DRIVERS}
                  onPress={() => adjustMaxDrivers('increase')}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    opacity: parsedMaxDrivers >= MAX_DRIVERS ? 0.35 : pressed ? 0.86 : 1,
                  })}
                  testID="button-increase-max-drivers"
                >
                  <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '500' }}>
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          {isSubmitting ? <LoadingSpinner /> : null}
          <View style={{ gap: 10 }}>
            <AppButton
              label="Create Draft Run"
              onPress={handleCreateRun}
              testID="button-submit-run"
            />
            <Text style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
              You can still adjust the details before sharing the drive with the club.
            </Text>
          </View>
        </View>

        {joinCode ? (
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 20,
              gap: 18,
            }}
          >
            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.colors.success, fontWeight: '700' }}>Draft run created</Text>
              <Text style={{ color: theme.colors.textPrimary, fontSize: 28, fontWeight: '800' }}>
                Invite the club
              </Text>
              <Text style={{ color: theme.colors.textSecondary, lineHeight: 21 }}>
                Share this join code with drivers, then move into route planning when you’re ready.
              </Text>
            </View>

            <View
              style={{
                borderRadius: 24,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 18,
                gap: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: theme.colors.textSecondary, fontWeight: '600' }}>Join code</Text>
              <Text
                style={{
                  color: theme.colors.textPrimary,
                  fontSize: 42,
                  fontWeight: '800',
                  letterSpacing: 5,
                }}
                testID="text-generated-code"
              >
                {joinCode}
              </Text>
              <Text style={{ color: theme.colors.textSecondary }}>
                Up to {createdRunCapacityLabel(maxDrivers)} drivers
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <AppButton
                  label="Share Invite"
                  onPress={handleShareInvite}
                  testID="button-share-run"
                  variant="secondary"
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton
                  label={showRunDetails ? 'Hide Details' : 'Show Details'}
                  onPress={() => setShowRunDetails((current) => !current)}
                  testID="button-toggle-run-details"
                  variant="ghost"
                />
              </View>
            </View>

            {showRunDetails ? (
              <View style={{ gap: 12 }}>
                <View style={{ gap: 4 }}>
                  <Text style={{ color: theme.colors.textSecondary }}>Run id</Text>
                  <Text style={{ color: theme.colors.textPrimary }} testID="text-generated-run-id">
                    {runId}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={{ color: theme.colors.textSecondary }}>Max drivers</Text>
                  <Text style={{ color: theme.colors.textPrimary }} testID="text-generated-max-drivers">
                    {createdRunCapacityLabel(maxDrivers)}
                  </Text>
                </View>
              </View>
            ) : null}

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
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createdRunCapacityLabel(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : value;
}

function clampDriverCount(value: number) {
  if (!Number.isFinite(value)) {
    return 15;
  }

  return Math.max(MIN_DRIVERS, Math.min(MAX_DRIVERS, Math.round(value)));
}
