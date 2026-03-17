import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Text } from 'react-native';

import { Screen } from '@/components/Screen';
import { ClubRunMap } from '@/components/map/ClubRunMap';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Toast } from '@/components/ui/Toast';
import {
  startBackgroundTrackingWithExpo,
  stopBackgroundTrackingWithExpo,
} from '@/lib/backgroundTracking';
import { subscribeToConnectivityWithFirebase } from '@/lib/connectivity';
import { removeDriverWithFirebase } from '@/lib/driverManagementService';
import { useAppTheme } from '@/contexts/ThemeContext';
import {
  getDriverPresenceStatus,
  LiveDriver,
  subscribeToDriversWithFirebase,
} from '@/lib/driverRealtime';
import { startForegroundTrackingWithExpo } from '@/lib/foregroundTracking';
import { LiveHazard, subscribeToHazardsWithFirebase } from '@/lib/hazardRealtime';
import {
  HAZARD_LABELS,
  buildHazardToastMessage,
  dismissHazardWithFirebase,
  isVisibleHazard,
  reportHazardWithFirebase,
} from '@/lib/hazardService';
import { subscribeToRunWithFirebase } from '@/lib/runRealtime';
import { endRunWithFirebase } from '@/lib/summaryService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { HazardType, Run } from '@/types/domain';

type TrackingMode = 'idle' | 'starting' | 'foreground' | 'background' | 'denied';

export default function RunMapScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { theme } = useAppTheme();
  const session = useRunSessionStore();
  const setRunSnapshot = useRunSessionStore((state) => state.setRunSnapshot);
  const updateNetworkAvailability = useRunSessionStore((state) => state.updateNetworkAvailability);
  const markRealtimeSynced = useRunSessionStore((state) => state.markRealtimeSynced);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<LiveDriver[]>([]);
  const [hazards, setHazards] = useState<LiveHazard[]>([]);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('idle');
  const [trackingDetail, setTrackingDetail] = useState<string | null>(null);
  const [hazardMessage, setHazardMessage] = useState<string | null>(null);
  const [hazardToastMessage, setHazardToastMessage] = useState<string | null>(null);
  const [currentRun, setCurrentRun] = useState<Run | null>(null);
  const [isEndingRun, setIsEndingRun] = useState(false);
  const previousHazardsRef = useRef<LiveHazard[] | null>(null);
  const stopForegroundTrackingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    const unsubscribe = subscribeToRunWithFirebase(
      id,
      (run) => {
        markRealtimeSynced();
        setCurrentRun(run);
        setRunSnapshot(
          run
            ? {
                name: run.name,
                status: run.status,
                route: run.route ?? null,
              }
            : null
        );
      },
      (nextError) => {
        setError(nextError.message);
      }
    );

    return unsubscribe;
  }, [id, setRunSnapshot]);

  useEffect(() => {
    if (id && session.status === 'ended') {
      router.replace(`/run/${id}/summary`);
    }
  }, [id, router, session.status]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const unsubscribe = subscribeToDriversWithFirebase(
      id,
      (nextDrivers) => {
        markRealtimeSynced();
        setDrivers(nextDrivers);
      },
      (nextError) => {
        setError(nextError.message);
      }
    );

    return unsubscribe;
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const unsubscribe = subscribeToHazardsWithFirebase(
      id,
      (nextHazards) => {
        markRealtimeSynced();
        const visibleHazards = nextHazards.filter((hazard) => isVisibleHazard(hazard));
        if (previousHazardsRef.current) {
          const nextToastMessage = buildHazardToastMessage(
            previousHazardsRef.current,
            visibleHazards,
            session.driverId
          );
          if (nextToastMessage) {
            setHazardToastMessage(nextToastMessage);
          }
        }

        previousHazardsRef.current = visibleHazards;
        setHazards(visibleHazards);
      },
      (nextError) => {
        setError(nextError.message);
      }
    );

    return unsubscribe;
  }, [id, markRealtimeSynced, session.driverId]);

  useEffect(() => {
    if (!hazardToastMessage) {
      return;
    }

    const timeout = setTimeout(() => {
      setHazardToastMessage(null);
    }, 4000);

    return () => clearTimeout(timeout);
  }, [hazardToastMessage]);

  useEffect(() => {
    return () => {
      stopForegroundTrackingRef.current?.();
      stopForegroundTrackingRef.current = null;
      void stopBackgroundTrackingWithExpo();
    };
  }, []);

  useEffect(() => {
    return subscribeToConnectivityWithFirebase((isOnline) => {
      updateNetworkAvailability(isOnline);
    });
  }, [updateNetworkAvailability]);

  async function handleReportHazard(type: HazardType) {
    const currentDriver = drivers.find((driver) => driver.id === session.driverId);
    if (!id || !session.driverId || !session.driverName) {
      setError('Join the run before reporting a hazard.');
      return;
    }

    if (!currentDriver?.location) {
      setError('Waiting for your GPS location before you can report a hazard.');
      return;
    }

    try {
      const result = await reportHazardWithFirebase({
        runId: id,
        reportedBy: session.driverId,
        reporterName: session.driverName,
        type,
        point: [currentDriver.location.lat, currentDriver.location.lng],
        existingHazards: hazards,
      });
      setHazardMessage(
        result.deduped
          ? `Merged with existing ${HAZARD_LABELS[type].toLowerCase()} report.`
          : `${HAZARD_LABELS[type]} reported.`
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to report hazard.');
    }
  }

  async function handleEndRun() {
    if (!id || !currentRun) {
      setError('Run data is still loading.');
      return;
    }

    setIsEndingRun(true);
    try {
      await endRunWithFirebase(id, currentRun);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to end the run.');
    } finally {
      setIsEndingRun(false);
    }
  }

  async function handleDismissHazard(hazard: LiveHazard) {
    if (!id) {
      setError('Run data is still loading.');
      return;
    }

    try {
      await dismissHazardWithFirebase(id, hazard);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to dismiss hazard.');
    }
  }

  async function handleRemoveDriver(driverId: string) {
    if (!id) {
      setError('Run data is still loading.');
      return;
    }

    try {
      await removeDriverWithFirebase(id, driverId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to remove driver.');
    }
  }

  async function handleEnableTracking() {
    if (!id || !session.driverId) {
      setError('Join the run before enabling location tracking.');
      setTrackingMode('denied');
      setTrackingDetail('Location access is off until your driver session is ready.');
      return;
    }

    setError(null);
    setTrackingMode('starting');
    setTrackingDetail('Requesting location access and starting convoy tracking.');

    try {
      stopForegroundTrackingRef.current?.();
      const stopTracking = await startForegroundTrackingWithExpo({
        runId: id,
        driverId: session.driverId,
      });
      stopForegroundTrackingRef.current = stopTracking;
      setTrackingMode('foreground');
      setTrackingDetail('Foreground GPS is active while the app is open.');

      const backgroundResult = await startBackgroundTrackingWithExpo({
        runId: id,
        driverId: session.driverId,
      });

      if (backgroundResult.enabled) {
        setTrackingMode('background');
        setTrackingDetail('Background tracking is enabled for locked-screen convoy updates.');
        return;
      }

      setTrackingMode('foreground');
      setTrackingDetail(
        'Allow Always location access to keep sharing your position while your phone is locked.'
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to start tracking.');
      setTrackingMode('denied');
      setTrackingDetail(
        'Location access is off. Open system settings to allow ClubRun to share your position.'
      );
    }
  }

  async function handleOpenLocationSettings() {
    try {
      await Linking.openSettings();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to open device settings.');
    }
  }

  return (
    <Screen scrollable testID="screen-run-map" contentContainerStyle={{ gap: 16, paddingBottom: 48 }}>
      <AppCard>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 28,
            fontWeight: '800',
          }}
        >
          {session.runName ?? 'Live Map'}
        </Text>
        <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
          Run {id ?? 'unknown'} is live with synced route, drivers, hazards, and convoy tracking.
          ClubRun will keep your group aligned with foreground GPS now, and background updates when
          Always permission is available.
        </Text>
      </AppCard>
      {hazardToastMessage ? <Toast message={hazardToastMessage} testID="toast-hazard-event" /> : null}
      {session.connectivityStatus !== 'online' ? (
        <AppCard>
          <Text
            style={{
              color:
                session.connectivityStatus === 'offline'
                  ? theme.colors.warning
                  : theme.colors.textPrimary,
            }}
            testID="text-connectivity-banner"
          >
            {session.connectivityStatus === 'offline'
              ? 'Offline. Live updates are paused until your connection returns.'
              : 'Reconnecting… syncing live convoy updates.'}
          </Text>
        </AppCard>
      ) : null}
      {trackingMode === 'idle' || trackingMode === 'starting' || trackingMode === 'denied' ? (
        <AppCard>
          <Text
            style={{ color: theme.colors.textPrimary, fontSize: 20, fontWeight: '700' }}
            testID="text-enable-tracking-title"
          >
            Enable location tracking
          </Text>
          <Text
            style={{ color: theme.colors.textSecondary, lineHeight: 22, marginTop: 8 }}
            testID="text-enable-tracking-body"
          >
            Turn on location sharing so ClubRun can place you on the convoy map, keep the roster
            current, and continue updating while your screen is locked when Always access is
            available.
          </Text>
          <AppButton
            label={
              trackingMode === 'starting' ? 'Starting Tracking…' : 'Enable Location Tracking'
            }
            onPress={() => {
              void handleEnableTracking();
            }}
            testID="button-enable-location-tracking"
          />
          {trackingMode === 'denied' ? (
            <AppButton
              label="Open Settings"
              onPress={() => {
                void handleOpenLocationSettings();
              }}
              testID="button-open-location-settings"
              variant="secondary"
            />
          ) : null}
        </AppCard>
      ) : null}
      {session.isRunLoaded ? (
        <ClubRunMap
          drivers={drivers}
          hazards={hazards}
          routePoints={session.route?.points ?? []}
          testID="live-run-map"
        />
      ) : (
        <AppCard>
          <Text style={{ color: theme.colors.textSecondary }}>Loading run data…</Text>
          <LoadingSpinner />
        </AppCard>
      )}
      <AppCard>
        <Text style={{ color: theme.colors.textSecondary }}>Run details</Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-run-name">
          Name: {session.runName ?? 'Unavailable'}
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-run-status">
          Status: {session.status ?? 'Unknown'}
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-run-route-points">
          Route points: {session.route?.points.length ?? 0}
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-driver-count">
          Drivers: {drivers.length}
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-hazard-count">
          Hazards: {hazards.length}
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-tracking-state">
          Tracking: {formatTrackingMode(trackingMode)}
        </Text>
        {trackingDetail ? (
          <Text style={{ color: theme.colors.textSecondary }} testID="text-tracking-detail">
            {trackingDetail}
          </Text>
        ) : null}
        {session.role === 'admin' ? (
          <AppButton
            label={isEndingRun ? 'Ending Run…' : 'End Run'}
            onPress={handleEndRun}
            testID="button-end-run"
          />
        ) : null}
      </AppCard>
      <AppCard>
        <Text style={{ color: theme.colors.textSecondary, marginBottom: 8 }}>Driver roster</Text>
        {drivers.length === 0 ? (
          <Text style={{ color: theme.colors.textPrimary }}>No drivers have joined yet.</Text>
        ) : (
          drivers.map((driver) => {
            const presence = getDriverPresenceStatus(driver);
            return (
              <AppCard key={driver.id}>
                <Text
                  style={{ color: theme.colors.textPrimary, marginBottom: 8 }}
                  testID={`text-driver-presence-${driver.id}`}
                >
                  {driver.name} • {presence.replace('_', ' ')}
                </Text>
                {session.role === 'admin' && driver.id !== session.driverId ? (
                  <AppButton
                    label="Remove Driver"
                    onPress={() => handleRemoveDriver(driver.id)}
                    testID={`button-remove-driver-${driver.id}`}
                    variant="ghost"
                  />
                ) : null}
              </AppCard>
            );
          })
        )}
      </AppCard>
      <AppCard>
        <Text style={{ color: theme.colors.textSecondary, marginBottom: 8 }}>Report hazard</Text>
        <Text style={{ color: theme.colors.textPrimary, marginBottom: 12 }}>
          Quick-report from your current GPS location.
        </Text>
        {(
          [
            'pothole',
            'roadworks',
            'police',
            'debris',
            'animal',
            'broken_down_car',
          ] as HazardType[]
        ).map((type) => (
          <AppButton
            key={type}
            label={HAZARD_LABELS[type]}
            onPress={() => handleReportHazard(type)}
            testID={`button-hazard-${type}`}
            variant="secondary"
          />
        ))}
        {hazardMessage ? (
          <Text style={{ color: theme.colors.success }} testID="text-hazard-message">
            {hazardMessage}
          </Text>
        ) : null}
      </AppCard>
      {hazards.length > 0 ? (
        <AppCard>
          <Text style={{ color: theme.colors.textSecondary, marginBottom: 8 }}>Active hazards</Text>
          {hazards.map((hazard) => (
            <AppCard key={hazard.id}>
              <Text style={{ color: theme.colors.textPrimary, marginBottom: 8 }}>
                {HAZARD_LABELS[hazard.type]} • {hazard.reporterName} • Reports: {hazard.reportCount}
              </Text>
              {session.role === 'admin' ? (
                <AppButton
                  label="Dismiss Hazard"
                  onPress={() => handleDismissHazard(hazard)}
                  testID={`button-dismiss-hazard-${hazard.id}`}
                  variant="ghost"
                />
              ) : null}
            </AppCard>
          ))}
        </AppCard>
      ) : null}
      <AppCard>
        <Text style={{ color: theme.colors.textSecondary }}>Current session</Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-session-driver-name">
          Driver: {session.driverName ?? 'Not joined yet'}
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-session-driver-id">
          Driver id: {session.driverId ?? 'Unavailable'}
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-session-role">
          Role: {session.role ?? 'Unknown'}
        </Text>
        <Text style={{ color: theme.colors.textPrimary }} testID="text-session-status">
          Status: {session.status ?? 'Unknown'}
        </Text>
      </AppCard>
      {error ? (
        <AppCard>
          <Text style={{ color: theme.colors.danger }} testID="text-run-error">
            {error}
          </Text>
        </AppCard>
      ) : null}
    </Screen>
  );
}

function formatTrackingMode(mode: TrackingMode) {
  if (mode === 'background') {
    return 'background enabled';
  }

  if (mode === 'foreground') {
    return 'foreground only';
  }

  if (mode === 'starting') {
    return 'starting';
  }

  if (mode === 'denied' || mode === 'idle') {
    return 'disabled';
  }

  return 'starting';
}
