import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { saveAdminRunToHistory } from '@/lib/adminRunHistory';
import { createRunWithFirebase } from '@/lib/runService';
import { createScheduledRunWithFirebase } from '@/lib/scheduledRunService';
import { useRunSessionStore } from '@/stores/runSessionStore';

const MIN_DRIVERS = 2;
const MAX_DRIVERS = 99;

const createPalette = {
  background: '#120F10',
  backgroundAlt: '#181314',
  panel: '#1B1718',
  panelElevated: '#242021',
  panelMuted: '#2C2526',
  border: '#352D2E',
  textPrimary: '#F6F1F0',
  textSecondary: '#C1B0AD',
  textMuted: '#9E8E8C',
  accent: '#FF5548',
  accentGlow: 'rgba(255, 85, 72, 0.28)',
  accentMuted: 'rgba(255, 85, 72, 0.16)',
  success: '#54C98E',
  danger: '#FF7C6E',
  avatar: '#E8C89A',
};

export default function CreateRunScreen() {
  const params = useLocalSearchParams<{ invitedUserIds?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setSession = useRunSessionStore((state) => state.setSession);
  const setRunSnapshot = useRunSessionStore((state) => state.setRunSnapshot);
  const setScheduledRunHero = useRunSessionStore((state) => state.setScheduledRunHero);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxDrivers, setMaxDrivers] = useState('15');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'club' | 'public'>('club');
  const [inviteUserIds, setInviteUserIds] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRunDetails, setShowRunDetails] = useState(false);

  useEffect(() => {
    const invitedParam = params.invitedUserIds;
    if (!invitedParam) {
      return;
    }

    const normalizedInvites = Array.isArray(invitedParam)
      ? invitedParam.join(',')
      : invitedParam;

    setInviteUserIds((current) => current || normalizedInvites);
  }, [params.invitedUserIds]);

  const parsedMaxDrivers = clampDriverCount(Number(maxDrivers));
  const inviteCount = useMemo(
    () =>
      inviteUserIds
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean).length,
    [inviteUserIds]
  );
  const createMode = scheduledDate.trim() && scheduledTime.trim() ? 'Scheduled' : 'Draft';

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

  async function handleScheduleRun() {
    setError(null);
    setIsSubmitting(true);

    try {
      const scheduledFor = parseScheduledDateTime(scheduledDate, scheduledTime);
      const createdRun = await createScheduledRunWithFirebase({
        name,
        description,
        maxDrivers: parsedMaxDrivers,
        scheduledFor,
        visibility,
        invitedUserIds: inviteUserIds
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      });

      setJoinCode(createdRun.run.joinCode);
      setRunId(createdRun.runId);
      setMaxDrivers(String(createdRun.run.maxDrivers ?? parsedMaxDrivers));
      setScheduledRunHero({
        runId: createdRun.runId,
        name: createdRun.run.name,
        scheduledFor,
        visibility,
      });
      void saveAdminRunToHistory({
        runId: createdRun.runId,
        name: createdRun.run.name,
        joinCode: createdRun.run.joinCode,
        driverId: createdRun.run.adminId,
        status: createdRun.run.status,
        createdAt: Date.now(),
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to schedule run.');
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
    <View style={{ flex: 1, backgroundColor: createPalette.background }} testID="screen-create-run">
      <Stack.Screen options={{ headerShown: false }} />

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 260,
          backgroundColor: createPalette.backgroundAlt,
          borderBottomLeftRadius: 36,
          borderBottomRightRadius: 36,
          opacity: 0.9,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 92,
          right: -48,
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: createPalette.accentMuted,
          opacity: 0.22,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 180,
          left: -72,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: '#2A1E1E',
          opacity: 0.3,
        }}
      />

      <ScrollView
        contentContainerStyle={{
          gap: 18,
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 36,
          paddingHorizontal: 20,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => ({
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: createPalette.panel,
              borderWidth: 1,
              borderColor: createPalette.border,
              shadowColor: '#000000',
              shadowOpacity: 0.24,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
              opacity: pressed ? 0.84 : 1,
            })}
            testID="button-back-create-run"
          >
            <MaterialIcons name="arrow-back" size={24} color={createPalette.textPrimary} />
          </Pressable>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: createPalette.panel,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: createPalette.border,
              paddingLeft: 12,
              paddingRight: 10,
              paddingVertical: 10,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: createPalette.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialIcons name="speed" size={20} color="#160F0D" />
            </View>
            <Text
              style={{
                color: createPalette.accent,
                fontSize: 18,
                fontWeight: '800',
                fontStyle: 'italic',
                letterSpacing: 0.5,
              }}
            >
              CLUBRUN
            </Text>
          </View>

          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              backgroundColor: createPalette.avatar,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#D8B57D',
            }}
          >
            <Text style={{ color: '#3F281B', fontWeight: '800', fontSize: 16 }}>CR</Text>
          </View>
        </View>

        <View style={{ gap: 12, marginTop: 6 }}>
          <Text
            style={{
              color: createPalette.textSecondary,
              fontSize: 12,
              fontWeight: '800',
              letterSpacing: 2.2,
              textTransform: 'uppercase',
            }}
          >
            Host a new run
          </Text>
          <Text
            style={{
              color: createPalette.textPrimary,
              fontSize: 42,
              fontWeight: '800',
              lineHeight: 46,
              letterSpacing: -1.2,
            }}
          >
            Create the drive
          </Text>
          <Text style={{ color: createPalette.textSecondary, fontSize: 17, lineHeight: 25 }}>
            Set the basics, generate the invite, and move straight into route planning with the
            ClubRun shell.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <SummaryCard label="Mode" value={createMode} detail="Route planner next" />
          <SummaryCard label="Crew" value={`${parsedMaxDrivers}`} detail="Drivers max" />
          <SummaryCard
            label="Visibility"
            value={visibility.toUpperCase()}
            detail={inviteCount > 0 ? `${inviteCount} invites` : 'No invites'}
          />
        </View>

        <HeroCreateCard />

        <SectionCard
          title="Run details"
          subtitle="Start with the essentials. You can still shape the route and invite flow after this step."
        >
          <StudioTextInput
            label="Run name"
            value={name}
            onChangeText={setName}
            placeholder="Sunday Scenic Drive"
            testID="input-run-name"
          />
          <StudioTextInput
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            placeholder="Add a short note for drivers, meetup context, or the vibe of the run."
            testID="input-run-description"
          />
        </SectionCard>

        <SectionCard
          title="Schedule for later"
          subtitle="Optional. Leave these blank to create an immediate draft, or add a future slot for Upcoming."
          badge="Optional"
        >
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <StudioTextInput
                label="Date"
                value={scheduledDate}
                onChangeText={setScheduledDate}
                placeholder="2026-03-28"
                testID="input-scheduled-date"
              />
            </View>
            <View style={{ flex: 1 }}>
              <StudioTextInput
                label="Time"
                value={scheduledTime}
                onChangeText={setScheduledTime}
                placeholder="08:30"
                testID="input-scheduled-time"
              />
            </View>
          </View>

          <StudioTextInput
            label="Invite people"
            value={inviteUserIds}
            onChangeText={setInviteUserIds}
            placeholder="uid_123, uid_456"
            autoCapitalize="none"
            testID="input-invite-user-ids"
          />

          <View style={{ gap: 10 }}>
            <Text style={{ color: createPalette.textSecondary, fontWeight: '700', fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Visibility
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['private', 'club', 'public'] as const).map((value) => (
                <VisibilitySegment
                  key={value}
                  active={visibility === value}
                  label={value}
                  onPress={() => setVisibility(value)}
                  testID={`button-visibility-${value}`}
                />
              ))}
            </View>
          </View>
        </SectionCard>

        <SectionCard
          title="Max drivers"
          subtitle="Choose how many cars can join this run before the lobby locks."
        >
          <View
            style={{
              borderRadius: 28,
              borderWidth: 1,
              borderColor: createPalette.border,
              backgroundColor: createPalette.panelElevated,
              paddingHorizontal: 16,
              paddingVertical: 18,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <DriverCounterButton
              disabled={parsedMaxDrivers <= MIN_DRIVERS}
              icon="remove"
              onPress={() => adjustMaxDrivers('decrease')}
              testID="button-decrease-max-drivers"
            />

            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text
                style={{
                  color: createPalette.textPrimary,
                  fontSize: 44,
                  fontWeight: '800',
                  letterSpacing: -1,
                }}
                testID="input-run-max-drivers"
              >
                {parsedMaxDrivers}
              </Text>
              <Text style={{ color: createPalette.textSecondary, fontSize: 16, fontWeight: '700' }}>
                drivers
              </Text>
            </View>

            <DriverCounterButton
              disabled={parsedMaxDrivers >= MAX_DRIVERS}
              icon="add"
              onPress={() => adjustMaxDrivers('increase')}
              testID="button-increase-max-drivers"
            />
          </View>
        </SectionCard>

        {error ? <Notice tone="danger">{error}</Notice> : null}
        {isSubmitting ? <LoadingSpinner /> : null}

        <SectionCard title="Launch" subtitle="Create the draft now or schedule the run for a future slot.">
          <CreateActionButton
            label="Create Draft Run"
            onPress={handleCreateRun}
            testID="button-submit-run"
            variant="primary"
          />
          <CreateActionButton
            label="Schedule Run"
            onPress={handleScheduleRun}
            testID="button-schedule-run"
            variant="secondary"
          />
          <Text style={{ color: createPalette.textMuted, lineHeight: 21 }}>
            You can still adjust details before sharing the drive with the club.
          </Text>
        </SectionCard>

        {joinCode ? (
          <SectionCard
            title="Invite the club"
            subtitle="Share the join code, check the details, then head into route planning when you’re ready."
          >
            <View
              style={{
                borderRadius: 24,
                backgroundColor: createPalette.panelElevated,
                borderWidth: 1,
                borderColor: createPalette.border,
                padding: 18,
                gap: 10,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: createPalette.success,
                  fontWeight: '800',
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                  fontSize: 12,
                }}
              >
                Engine live
              </Text>
              <Text style={{ color: createPalette.textSecondary, fontWeight: '700' }}>Join code</Text>
              <Text
                style={{
                  color: createPalette.textPrimary,
                  fontSize: 42,
                  fontWeight: '800',
                  letterSpacing: 6,
                }}
                testID="text-generated-code"
              >
                {joinCode}
              </Text>
              <Text style={{ color: createPalette.textSecondary }}>
                Up to {createdRunCapacityLabel(maxDrivers)} drivers
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <CreateActionButton
                  label="Share Invite"
                  onPress={handleShareInvite}
                  testID="button-share-run"
                  variant="secondary"
                />
              </View>
              <View style={{ flex: 1 }}>
                <CreateActionButton
                  label={showRunDetails ? 'Hide Details' : 'Show Details'}
                  onPress={() => setShowRunDetails((current) => !current)}
                  testID="button-toggle-run-details"
                  variant="ghost"
                />
              </View>
            </View>

            {showRunDetails ? (
              <View style={{ gap: 12 }}>
                <DetailRow label="Run id" value={runId ?? ''} testID="text-generated-run-id" />
                <DetailRow
                  label="Max drivers"
                  value={createdRunCapacityLabel(maxDrivers)}
                  testID="text-generated-max-drivers"
                />
              </View>
            ) : null}

            <CreateActionButton
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
              variant="primary"
            />
          </SectionCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

function HeroCreateCard() {
  return (
    <View
      style={{
        borderRadius: 30,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: createPalette.border,
        backgroundColor: '#171314',
        minHeight: 196,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#22191A',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -8,
          bottom: -28,
          width: 220,
          height: 140,
          borderTopLeftRadius: 120,
          borderTopRightRadius: 60,
          borderBottomLeftRadius: 40,
          borderBottomRightRadius: 90,
          backgroundColor: '#27434D',
          transform: [{ rotate: '-10deg' }],
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -10,
          right: 70,
          bottom: 34,
          height: 6,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.14)',
          transform: [{ rotate: '-8deg' }],
        }}
      />
      <View style={{ padding: 22, gap: 14 }}>
        <Text
          style={{
            color: createPalette.textSecondary,
            fontSize: 12,
            fontWeight: '800',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Create a run
        </Text>
        <Text
          style={{
            color: createPalette.textPrimary,
            fontSize: 34,
            fontWeight: '800',
            fontStyle: 'italic',
            lineHeight: 38,
          }}
        >
          START ENGINE
        </Text>
        <Text style={{ color: createPalette.textSecondary, fontSize: 17, lineHeight: 24, maxWidth: '75%' }}>
          Host a private, club, or public lobby, then move straight into the planner.
        </Text>
      </View>
    </View>
  );
}

function SummaryCard({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: createPalette.border,
        backgroundColor: createPalette.panel,
        padding: 14,
        gap: 8,
      }}
    >
      <Text
        style={{
          color: createPalette.textMuted,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text style={{ color: createPalette.textPrimary, fontSize: 20, fontWeight: '800' }}>
        {value}
      </Text>
      <Text style={{ color: createPalette.textSecondary, fontSize: 12, lineHeight: 18 }}>
        {detail}
      </Text>
    </View>
  );
}

function SectionCard({
  badge,
  children,
  subtitle,
  title,
}: {
  badge?: string;
  children: ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <View
      style={{
        borderRadius: 30,
        borderWidth: 1,
        borderColor: createPalette.border,
        backgroundColor: createPalette.panel,
        padding: 20,
        gap: 18,
      }}
    >
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text style={{ color: createPalette.textPrimary, fontSize: 26, fontWeight: '800' }}>
            {title}
          </Text>
          {badge ? (
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: createPalette.panelElevated,
                borderWidth: 1,
                borderColor: createPalette.border,
              }}
            >
              <Text
                style={{
                  color: createPalette.textSecondary,
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={{ color: createPalette.textSecondary, fontSize: 16, lineHeight: 23 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function StudioTextInput({
  autoCapitalize = 'sentences',
  label,
  multiline = false,
  numberOfLines,
  onChangeText,
  placeholder,
  testID,
  value,
}: {
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  label: string;
  multiline?: boolean;
  numberOfLines?: number;
  onChangeText: (value: string) => void;
  placeholder?: string;
  testID?: string;
  value: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: createPalette.textPrimary, fontSize: 15, fontWeight: '700' }}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={numberOfLines}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={createPalette.textMuted}
        style={{
          backgroundColor: createPalette.panelElevated,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: createPalette.border,
          color: createPalette.textPrimary,
          minHeight: multiline ? 132 : 64,
          paddingHorizontal: 18,
          paddingTop: multiline ? 16 : 0,
          paddingBottom: multiline ? 16 : 0,
          fontSize: 16,
        }}
        testID={testID}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

function VisibilitySegment({
  active,
  label,
  onPress,
  testID,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 56,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: active ? createPalette.accent : createPalette.border,
        backgroundColor: active ? createPalette.accent : createPalette.panelElevated,
        shadowColor: active ? createPalette.accent : '#000000',
        shadowOpacity: active ? 0.24 : 0,
        shadowRadius: active ? 18 : 0,
        shadowOffset: { width: 0, height: 8 },
        opacity: pressed ? 0.88 : 1,
      })}
      testID={testID}
    >
      <Text
        style={{
          color: active ? '#170E0C' : createPalette.textPrimary,
          fontSize: 14,
          fontWeight: '800',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DriverCounterButton({
  disabled,
  icon,
  onPress,
  testID,
}: {
  disabled: boolean;
  icon: 'add' | 'remove';
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: createPalette.panel,
        borderWidth: 1,
        borderColor: createPalette.border,
        opacity: disabled ? 0.35 : pressed ? 0.86 : 1,
      })}
      testID={testID}
    >
      <MaterialIcons name={icon} size={28} color={createPalette.textPrimary} />
    </Pressable>
  );
}

function CreateActionButton({
  label,
  onPress,
  testID,
  variant,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  variant: 'primary' | 'secondary' | 'ghost';
}) {
  const backgroundColor =
    variant === 'primary'
      ? createPalette.accent
      : variant === 'secondary'
        ? createPalette.panelElevated
        : 'transparent';
  const textColor =
    variant === 'primary' ? '#180F0C' : variant === 'ghost' ? createPalette.textSecondary : createPalette.textPrimary;
  const borderColor =
    variant === 'primary' ? createPalette.accent : variant === 'ghost' ? createPalette.panelMuted : createPalette.border;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 60,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
        backgroundColor,
        borderWidth: variant === 'ghost' ? 0 : 1,
        borderColor,
        shadowColor: variant === 'primary' ? createPalette.accent : '#000000',
        shadowOpacity: variant === 'primary' ? 0.28 : 0,
        shadowRadius: variant === 'primary' ? 20 : 0,
        shadowOffset: { width: 0, height: 10 },
        opacity: pressed ? 0.88 : 1,
      })}
      testID={testID}
    >
      <Text
        style={{
          color: textColor,
          fontSize: 16,
          fontWeight: '800',
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Notice({
  children,
  tone,
}: {
  children: string;
  tone: 'danger';
}) {
  const borderColor = tone === 'danger' ? `${createPalette.danger}55` : createPalette.border;

  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor,
        backgroundColor: `${createPalette.danger}14`,
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Text style={{ color: createPalette.danger, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: createPalette.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>
        {label}
      </Text>
      <Text style={{ color: createPalette.textPrimary }} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function parseScheduledDateTime(date: string, time: string) {
  const normalizedDate = date.trim();
  const normalizedTime = time.trim();

  if (!normalizedDate || !normalizedTime) {
    throw new Error('Add both a future date and time before scheduling this run.');
  }

  const value = new Date(`${normalizedDate}T${normalizedTime}:00`);
  const timestamp = value.getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error('Use a valid date and time when scheduling this run.');
  }

  return timestamp;
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
