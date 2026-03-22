import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleProp, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SummaryShareCard } from '@/components/summary/SummaryShareCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuthSession } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { syncRecentCrewContactsForRunWithFirebase } from '@/lib/recentCrewService';
import { subscribeToRunWithFirebase } from '@/lib/runRealtime';
import { buildSummaryShareData, shareSummaryAsImage, shareSummaryAsPdf } from '@/lib/shareService';
import { updateUserStatsForCompletedRunWithFirebase } from '@/lib/userProfileService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { Run, SummaryDriverStat } from '@/types/domain';

function formatSummaryDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function toDisplayLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getFastestDriver(driverStats: SummaryDriverStat[]) {
  if (driverStats.length === 0) {
    return null;
  }

  return [...driverStats].sort((left, right) => (right.topSpeedKmh ?? 0) - (left.topSpeedKmh ?? 0))[0];
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function splitMetricValue(value: string) {
  const match = value.match(/^(.+?)\s([A-Za-z/]+)$/);
  if (!match) {
    return { primary: value, unit: null };
  }

  return {
    primary: match[1],
    unit: match[2],
  };
}

function getSteadiestPace(driverStats: SummaryDriverStat[]) {
  const eligibleDrivers = driverStats.filter(
    (driver) => typeof driver.avgMovingSpeedKmh === 'number'
  );

  if (eligibleDrivers.length === 0) {
    return null;
  }

  return [...eligibleDrivers].sort(
    (left, right) => (right.avgMovingSpeedKmh ?? 0) - (left.avgMovingSpeedKmh ?? 0)
  )[0];
}

function getTotalConvoyDistance(driverStats: SummaryDriverStat[]) {
  const distances = driverStats
    .map((driver) => driver.totalDistanceKm)
    .filter((distance): distance is number => typeof distance === 'number');

  if (distances.length === 0) {
    return null;
  }

  return roundToSingleDecimal(distances.reduce((total, distance) => total + distance, 0));
}

function getRoadScout(run: Run) {
  const hazards = Object.values(run.hazards ?? {});
  if (hazards.length === 0) {
    return null;
  }

  const counts = hazards.reduce<Record<string, { name: string; count: number }>>((summary, hazard) => {
    const key = hazard.reportedBy;
    const fallbackName =
      hazard.reporterName ||
      run.summary?.driverStats[key]?.name ||
      run.drivers?.[key]?.profile?.name ||
      'Club member';

    if (!summary[key]) {
      summary[key] = {
        name: fallbackName,
        count: 0,
      };
    }

    summary[key].count += 1;
    return summary;
  }, {});

  return (
    Object.values(counts).sort(
      (left, right) => right.count - left.count || left.name.localeCompare(right.name)
    )[0] ?? null
  );
}

export default function RunSummaryScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const auth = useAuthSession();
  const { theme } = useAppTheme();
  const account = useRunSessionStore((state) => state.account);
  const insets = useSafeAreaInsets();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const shareCardRef = useRef<View>(null);
  const lastPersistedSummaryKey = useRef<string | null>(null);
  const accountUserId = account?.userId ?? auth.userId;
  const isPersistentAccount = Boolean(account?.userId || (auth.userId && !auth.isAnonymous));

  useEffect(() => {
    if (!id) {
      return;
    }

    const unsubscribe = subscribeToRunWithFirebase(
      id,
      (nextRun) => {
        setRun(nextRun);
      },
      (nextError) => {
        setError(nextError.message);
      }
    );

    return unsubscribe;
  }, [id]);

  useEffect(() => {
    if (!run?.summary || !accountUserId || !isPersistentAccount) {
      return;
    }

    const summaryKey = `${id ?? run.joinCode}:${accountUserId}:${run.summary.generatedAt}`;
    if (lastPersistedSummaryKey.current === summaryKey) {
      return;
    }

    lastPersistedSummaryKey.current = summaryKey;
    const totalDistanceKm = run.summary.driverStats[accountUserId]?.totalDistanceKm ?? 0;
    const hazardsReported = Object.values(run.hazards ?? {}).filter(
      (hazard) => hazard.reportedBy === accountUserId
    ).length;

    void syncRecentCrewContactsForRunWithFirebase(accountUserId, run).catch(() => undefined);
    void updateUserStatsForCompletedRunWithFirebase(accountUserId, {
      userId: accountUserId,
      totalDistanceKm,
      hazardsReported,
    }).catch(() => undefined);
  }, [account?.userId, accountUserId, auth.isAnonymous, auth.userId, id, isPersistentAccount, run]);

  if (!run?.summary) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }} testID="screen-run-summary">
        <Stack.Screen options={{ headerShown: false }} />
        <SummaryTopOverlay insetTop={insets.top} onBack={() => router.back()} />
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 88,
            paddingBottom: insets.bottom + 32,
            paddingHorizontal: 20,
            gap: 16,
          }}
        >
          <AppCard>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 28, fontWeight: '800' }}>
              Run Summary
            </Text>
            <Text style={{ color: theme.colors.textSecondary }}>
              {error ?? 'Waiting for the summary to be generated.'}
            </Text>
            <LoadingSpinner />
          </AppCard>
        </ScrollView>
      </View>
    );
  }

  const currentRun = run;
  const summary = currentRun.summary!;
  const shareData = buildSummaryShareData(currentRun);
  const driverStats = Object.values(summary.driverStats);
  const steadiestPace = getSteadiestPace(driverStats);
  const highestSpeed = getFastestDriver(driverStats);
  const convoyDistance = getTotalConvoyDistance(driverStats);
  const roadScout = getRoadScout(currentRun);
  const trackedDriversCount = driverStats.filter(
    (driver) => typeof driver.totalDistanceKm === 'number'
  ).length;
  const generatedDateLabel = formatSummaryDate(summary.generatedAt);
  const hazardBreakdown = Object.entries(summary.hazardSummary.byType).sort(
    ([, left], [, right]) => right - left
  );

  async function handleShareImage() {
    setShareError(null);
    setIsSharingImage(true);
    try {
      await shareSummaryAsImage(currentRun, shareCardRef);
    } catch (nextError) {
      setShareError(nextError instanceof Error ? nextError.message : 'Unable to share summary image.');
    } finally {
      setIsSharingImage(false);
    }
  }

  async function handleSharePdf() {
    setShareError(null);
    setIsSharingPdf(true);
    try {
      await shareSummaryAsPdf(currentRun);
    } catch (nextError) {
      setShareError(nextError instanceof Error ? nextError.message : 'Unable to share summary PDF.');
    } finally {
      setIsSharingPdf(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} testID="screen-run-summary">
      <Stack.Screen options={{ headerShown: false }} />
      <SummaryTopOverlay insetTop={insets.top} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{
          gap: 20,
          paddingTop: insets.top + 88,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 20,
        }}
      >
        <AppCard>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 12,
              fontWeight: '600',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            Completed run
          </Text>
          <Text
            style={{
              color: theme.colors.textPrimary,
              fontSize: 32,
              lineHeight: 36,
              fontWeight: '800',
              letterSpacing: -0.8,
            }}
          >
            {run.name}
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 16, lineHeight: 24 }}>
            Generated {generatedDateLabel}. {summary.totalDistanceKm.toFixed(1)} km with{' '}
            {driverStats.length} {driverStats.length === 1 ? 'driver' : 'drivers'} and{' '}
            {summary.hazardSummary.total} logged{' '}
            {summary.hazardSummary.total === 1 ? 'hazard' : 'hazards'}.
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
            <HeroMetric
              label="Distance"
              value={`${summary.totalDistanceKm.toFixed(1)} km`}
              testID="text-summary-distance"
              style={{ width: '100%' }}
            />
            <HeroMetric
              label="Drive time"
              value={`${summary.totalDriveTimeMinutes} min`}
              testID="text-summary-duration"
              style={{ flexGrow: 1, minWidth: 150 }}
            />
            <HeroMetric
              label="Hazards logged"
              value={`${summary.hazardSummary.total}`}
              testID="text-summary-hazards"
              style={{ flexGrow: 1, minWidth: 150 }}
            />
          </View>
        </AppCard>

        <AppCard>
          <SectionHeader
            title="Highlights"
            subtitle="A few moments worth remembering from the run."
          />

          <HighlightHeroCard
            eyebrow="Convoy memory"
            title="Total convoy distance"
            value={convoyDistance != null ? `${convoyDistance.toFixed(1)} km` : 'No track data yet'}
            detail={
              convoyDistance != null
                ? `Combined distance across ${trackedDriversCount} ${
                    trackedDriversCount === 1 ? 'driver' : 'drivers'
                  } who logged mileage during the run.`
                : 'This appears once drivers finish the run with tracked movement.'
            }
            testID="text-highlight-convoy-distance"
          />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <HighlightStatCard
              title="Steadiest pace"
              value={
                steadiestPace?.avgMovingSpeedKmh != null
                  ? `${steadiestPace.avgMovingSpeedKmh.toFixed(1)} km/h`
                  : 'No pace data yet'
              }
              detail={
                steadiestPace
                  ? `${steadiestPace.name} held the convoy's steadiest pace in the ${steadiestPace.carMake} ${steadiestPace.carModel}.`
                  : 'Average moving speed appears here when pace data is available.'
              }
              testID="text-highlight-steadiest-pace"
              style={{ flexGrow: 1, minWidth: 150 }}
            />
            <HighlightStatCard
              title="Highest speed"
              value={
                highestSpeed?.topSpeedKmh != null
                  ? `${highestSpeed.topSpeedKmh.toFixed(1)} km/h`
                  : 'No speed data yet'
              }
              detail={
                highestSpeed
                  ? `${highestSpeed.name} reached the run's highest speed in the ${highestSpeed.carMake} ${highestSpeed.carModel}.`
                  : 'Peak speed appears here when speed data is available.'
              }
              testID="text-highlight-highest-speed"
              style={{ flexGrow: 1, minWidth: 150 }}
            />
          </View>

          <HighlightSpotlightCard
            title="Road scout"
            headline={roadScout ? roadScout.name : 'Calm roads this time'}
            detail={
              roadScout
                ? `${roadScout.count} ${roadScout.count === 1 ? 'hazard' : 'hazards'} called out for the convoy.`
                : 'No hazards were called out on this run.'
            }
            testID="text-highlight-road-scout"
          />

          <View
            style={{
              borderRadius: 20,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 16,
              gap: 14,
            }}
          >
            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.textPrimary, fontSize: 17, fontWeight: '700' }}>
                Hazard breakdown
              </Text>
              {hazardBreakdown.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {hazardBreakdown.map(([type, count]) => (
                    <View
                      key={type}
                      style={{
                        borderRadius: 999,
                        backgroundColor: theme.colors.accentMuted,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                        {toDisplayLabel(type)} {count}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: theme.colors.textSecondary }}>No hazards were called out.</Text>
              )}
            </View>
          </View>
        </AppCard>

        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.textSecondary }}>Share recap</Text>
          <Text
            style={{
              color: theme.colors.textPrimary,
              fontSize: 26,
              lineHeight: 30,
              fontWeight: '800',
              letterSpacing: -0.5,
            }}
          >
            Export a polished recap
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 16, lineHeight: 24 }}>
            Save a clean recap image or generate a printable PDF for the convoy archive.
          </Text>
          <View ref={shareCardRef} collapsable={false}>
            <SummaryShareCard data={shareData} testID="summary-share-card" />
          </View>
          <View style={{ gap: 12, marginTop: 4 }}>
            <AppButton
              label={isSharingImage ? 'Sharing Image…' : 'Share Image'}
              onPress={handleShareImage}
              labelStyle={{ fontWeight: '600' }}
              testID="button-share-image"
            />
            <AppButton
              label={isSharingPdf ? 'Sharing PDF…' : 'Share PDF'}
              onPress={handleSharePdf}
              labelStyle={{ fontWeight: '600' }}
              testID="button-share-pdf"
              variant="secondary"
            />
          </View>
          {shareError ? (
            <Text style={{ color: theme.colors.danger }} testID="text-share-error">
              {shareError}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryTopOverlay({
  insetTop,
  onBack,
}: {
  insetTop: number;
  onBack: () => void;
}) {
  const { theme } = useAppTheme();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insetTop + 10,
        left: 20,
        right: 20,
        zIndex: 10,
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
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
        testID="button-back-summary"
      >
        <Text style={{ color: theme.colors.textPrimary, fontSize: 28, fontWeight: '700', marginLeft: -2 }}>
          ‹
        </Text>
      </Pressable>
    </View>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { theme } = useAppTheme();

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: theme.colors.textPrimary,
          fontSize: 26,
          lineHeight: 30,
          fontWeight: '800',
          letterSpacing: -0.5,
        }}
      >
        {title}
      </Text>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 16, lineHeight: 24 }}>{subtitle}</Text>
    </View>
  );
}

function HeroMetric({
  label,
  value,
  testID,
  style,
}: {
  label: string;
  value: string;
  testID: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useAppTheme();
  const { primary, unit } = splitMetricValue(value);

  return (
    <View
      style={[
        {
          borderRadius: 20,
          backgroundColor: theme.colors.surfaceElevated,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 16,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.45,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: unit ? 6 : 0, marginTop: 8 }}
        testID={testID}
      >
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 28,
            lineHeight: 32,
            fontWeight: '800',
            letterSpacing: -0.5,
          }}
        >
          {primary}
        </Text>
        {unit ? (
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 18,
              lineHeight: 24,
              fontWeight: '600',
              marginBottom: 2,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function HighlightHeroCard({
  eyebrow,
  title,
  value,
  detail,
  testID,
}: {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  testID: string;
}) {
  const { theme } = useAppTheme();
  const { primary, unit } = splitMetricValue(value);

  return (
    <View
      style={{
        borderRadius: 24,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 18,
        gap: 8,
      }}
    >
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.45,
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </Text>
      <Text style={{ color: theme.colors.textPrimary, fontSize: 18, lineHeight: 22, fontWeight: '700' }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: unit ? 6 : 0 }} testID={testID}>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 32,
            lineHeight: 36,
            fontWeight: '800',
            letterSpacing: -0.8,
            flexShrink: 1,
          }}
        >
          {primary}
        </Text>
        {unit ? (
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 20,
              lineHeight: 24,
              fontWeight: '600',
              marginBottom: 3,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22 }}>{detail}</Text>
    </View>
  );
}

function HighlightStatCard({
  title,
  value,
  detail,
  testID,
  style,
}: {
  title: string;
  value: string;
  detail: string;
  testID: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useAppTheme();
  const { primary, unit } = splitMetricValue(value);

  return (
    <View
      style={[
        {
          borderRadius: 20,
          backgroundColor: theme.colors.surfaceElevated,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 16,
          gap: 8,
        },
        style,
      ]}
    >
      <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '600' }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: unit ? 6 : 0 }} testID={testID}>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 28,
            lineHeight: 32,
            fontWeight: '800',
            letterSpacing: -0.6,
            flexShrink: 1,
          }}
        >
          {primary}
        </Text>
        {unit ? (
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 18,
              lineHeight: 24,
              fontWeight: '600',
              marginBottom: 2,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22 }}>{detail}</Text>
    </View>
  );
}

function HighlightSpotlightCard({
  title,
  headline,
  detail,
  testID,
}: {
  title: string;
  headline: string;
  detail: string;
  testID: string;
}) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        borderRadius: 20,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 16,
        gap: 8,
      }}
    >
      <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: '600' }}>
        {title}
      </Text>
      <Text
        style={{
          color: theme.colors.textPrimary,
          fontSize: 28,
          lineHeight: 32,
          fontWeight: '800',
          letterSpacing: -0.6,
        }}
        testID={testID}
      >
        {headline}
      </Text>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22 }}>{detail}</Text>
    </View>
  );
}
