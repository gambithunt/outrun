import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { SummaryShareCard } from '@/components/summary/SummaryShareCard';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAppTheme } from '@/contexts/ThemeContext';
import { subscribeToRunWithFirebase } from '@/lib/runRealtime';
import { buildSummaryShareData, shareSummaryAsImage, shareSummaryAsPdf } from '@/lib/shareService';
import { Run } from '@/types/domain';

export default function RunSummaryScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { theme } = useAppTheme();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const shareCardRef = useRef<View>(null);

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

  if (!run?.summary) {
    return (
      <Screen testID="screen-run-summary" contentContainerStyle={{ gap: 16 }}>
        <AppCard>
          <Text style={{ color: theme.colors.textPrimary, fontSize: 28, fontWeight: '800' }}>
            Run Summary
          </Text>
          <Text style={{ color: theme.colors.textSecondary }}>
            {error ?? 'Waiting for the summary to be generated.'}
          </Text>
          <LoadingSpinner />
        </AppCard>
      </Screen>
    );
  }

  const currentRun = run;
  const summary = currentRun.summary!;
  const driverStats = Object.values(summary.driverStats);
  const shareData = buildSummaryShareData(currentRun);

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
    <Screen scrollable testID="screen-run-summary" contentContainerStyle={{ gap: 16, paddingBottom: 48 }}>
      <AppCard>
        <Text style={{ color: theme.colors.textPrimary, fontSize: 28, fontWeight: '800' }}>
          {run.name}
        </Text>
        <Text style={{ color: theme.colors.textSecondary }}>Completed run summary</Text>
      </AppCard>

      <AppCard>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-summary-distance">
          Distance: {summary.totalDistanceKm.toFixed(1)} km
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-summary-duration">
          Drive time: {summary.totalDriveTimeMinutes} minutes
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-summary-hazards">
          Hazards reported: {summary.hazardSummary.total}
        </Text>
      </AppCard>

      <AppCard>
        <Text style={{ color: theme.colors.textSecondary }}>Fuel totals</Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-summary-petrol">
          Petrol: {summary.collectiveFuel.petrolLitres.toFixed(1)} L
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-summary-diesel">
          Diesel: {summary.collectiveFuel.dieselLitres.toFixed(1)} L
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-summary-hybrid">
          Hybrid: {summary.collectiveFuel.hybridLitres.toFixed(1)} L
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-summary-electric">
          Electric: {summary.collectiveFuel.electricKwh.toFixed(1)} kWh
        </Text>
      </AppCard>

      <AppCard>
        <Text style={{ color: theme.colors.textSecondary, marginBottom: 8 }}>Driver stats</Text>
        {driverStats.length === 0 ? (
          <Text style={{ color: theme.colors.textPrimary }}>No driver summary data available.</Text>
        ) : (
          driverStats.map((driver) => (
            <Text
              key={`${driver.name}-${driver.carModel}`}
              style={{ color: theme.colors.textPrimary }}
            >
              {driver.name} • {driver.carMake} {driver.carModel} • Top speed:{' '}
              {driver.topSpeedKmh?.toFixed(1) ?? 'N/A'} km/h
            </Text>
          ))
        )}
      </AppCard>

      <AppCard>
        <Text style={{ color: theme.colors.textSecondary, marginBottom: 8 }}>Share recap</Text>
        <View ref={shareCardRef} collapsable={false}>
          <SummaryShareCard data={shareData} testID="summary-share-card" />
        </View>
        <View style={{ gap: 12, marginTop: 16 }}>
          <AppButton
            label={isSharingImage ? 'Sharing Image…' : 'Share Image'}
            onPress={handleShareImage}
            testID="button-share-image"
          />
          <AppButton
            label={isSharingPdf ? 'Sharing PDF…' : 'Share PDF'}
            onPress={handleSharePdf}
            testID="button-share-pdf"
            variant="secondary"
          />
        </View>
        {shareError ? (
          <Text style={{ color: theme.colors.danger, marginTop: 12 }} testID="text-share-error">
            {shareError}
          </Text>
        ) : null}
      </AppCard>
    </Screen>
  );
}
