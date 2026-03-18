import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClubRunMap } from '@/components/map/ClubRunMap';
import { AppButton } from '@/components/ui/AppButton';
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
import { haversineDistanceMeters } from '@/lib/geo';
import { LiveHazard, subscribeToHazardsWithFirebase } from '@/lib/hazardRealtime';
import {
  HAZARD_LABELS,
  buildHazardToastMessage,
  dismissHazardWithFirebase,
  isVisibleHazard,
  reportHazardWithFirebase,
} from '@/lib/hazardService';
import { startDriveWithFirebase } from '@/lib/runService';
import { subscribeToRunWithFirebase } from '@/lib/runRealtime';
import { endRunWithFirebase } from '@/lib/summaryService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { HazardType, Run } from '@/types/domain';

type TrackingMode = 'idle' | 'starting' | 'foreground' | 'background' | 'denied';

const HAZARD_EMOJI: Record<HazardType, string> = {
  pothole: '🕳️',
  roadworks: '🚧',
  police: '🚓',
  debris: '⚠️',
  animal: '🐄',
  broken_down_car: '🚗',
};

// ─── Incoming hazard alert (Waze-style slide from top) ───────────────────────

function HazardAlert({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    const slideIn = Animated.timing(translateY, {
      toValue: 0,
      duration: 320,
      useNativeDriver: true,
    });
    const slideOut = Animated.timing(translateY, {
      toValue: -120,
      duration: 320,
      useNativeDriver: true,
    });

    slideIn.start(() => {
      const timer = setTimeout(() => {
        slideOut.start(() => onDismiss());
      }, 4500);
      return () => clearTimeout(timer);
    });
  }, [onDismiss, translateY]);

  return (
    <Animated.View
      style={[styles.hazardAlert, { transform: [{ translateY }] }]}
      testID="toast-hazard-event"
    >
      <TouchableOpacity onPress={onDismiss} style={styles.hazardAlertInner} activeOpacity={0.9}>
        <Text style={styles.hazardAlertText}>{message}</Text>
        <Text style={styles.hazardAlertDismiss}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Driver awareness bottom sheet ────────────────────────────────────────────

function DriverPanel({
  drivers,
  currentDriverId,
  hazards,
  isAdmin,
  isEndingRun,
  onDismissHazard,
  onEndRun,
  onRemoveDriver,
  accentColor,
}: {
  drivers: LiveDriver[];
  currentDriverId: string | null;
  hazards: LiveHazard[];
  isAdmin: boolean;
  isEndingRun: boolean;
  onDismissHazard: (hazard: LiveHazard) => void;
  onEndRun: () => void;
  onRemoveDriver: (id: string) => void;
  accentColor: string;
}) {
  const [expanded, setExpanded] = useState(isAdmin);
  const insets = useSafeAreaInsets();

  const panY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 60) {
          setExpanded(false);
        }
        Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  // Sort: self first, then by name
  const sortedDrivers = [...drivers].sort((a, b) => {
    if (a.id === currentDriverId) return -1;
    if (b.id === currentDriverId) return 1;
    return a.name.localeCompare(b.name);
  });

  function presenceLabel(driver: LiveDriver) {
    const s = getDriverPresenceStatus(driver);
    if (s === 'active') return '🟢';
    if (s === 'stale') return '🟡';
    if (s === 'lost_signal') return '🔴';
    return '⬜';
  }

  function speedLabel(driver: LiveDriver) {
    if (!driver.location?.speed || driver.location.speed < 0.5) return '';
    const kmh = Math.round(driver.location.speed * 3.6);
    return ` · ${kmh} km/h`;
  }

  return (
    <Animated.View
      style={[
        styles.driverPanel,
        { paddingBottom: insets.bottom + 4, transform: [{ translateY: panY }] },
      ]}
    >
      {/* Drag handle */}
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.driverPanelHandle}>
        <View style={styles.driverPanelHandleBar} />
      </TouchableOpacity>

      {/* Collapsed: avatar strip */}
      {!expanded ? (
        <TouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.8}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.driverStrip}
          >
            {sortedDrivers.map((driver) => {
              const isSelf = driver.id === currentDriverId;
              const status = getDriverPresenceStatus(driver);
              const dotColor =
                status === 'active' ? '#22C55E' : status === 'stale' ? '#F59E0B' : '#EF4444';
              return (
                <View key={driver.id} style={styles.driverStripItem}>
                  <View
                    style={[
                      styles.driverStripAvatar,
                      {
                        backgroundColor: isSelf ? accentColor : '#374151',
                        borderColor: isSelf ? '#FFFFFF' : 'transparent',
                        borderWidth: isSelf ? 2 : 0,
                      },
                    ]}
                  >
                    <Text style={styles.driverStripInitials}>
                      {driver.name
                        .split(' ')
                        .map((p) => p[0]?.toUpperCase() ?? '')
                        .slice(0, 2)
                        .join('')}
                    </Text>
                  </View>
                  <View style={[styles.driverStatusDot, { backgroundColor: dotColor }]} />
                  <Text style={styles.driverStripName} numberOfLines={1}>
                    {driver.name.split(' ')[0]}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      ) : (
        /* Expanded: full driver list */
        <Animated.View {...panResponder.panHandlers}>
          <ScrollView style={styles.driverList} showsVerticalScrollIndicator={false}>
            {sortedDrivers.map((driver) => {
              const isSelf = driver.id === currentDriverId;
              return (
                <View
                  key={driver.id}
                  style={[
                    styles.driverRow,
                    isSelf && { backgroundColor: 'rgba(255,255,255,0.07)' },
                  ]}
                >
                  <View
                    style={[
                      styles.driverRowAvatar,
                      { backgroundColor: isSelf ? accentColor : '#374151' },
                    ]}
                  >
                    <Text style={styles.driverRowInitials}>
                      {driver.name
                        .split(' ')
                        .map((p) => p[0]?.toUpperCase() ?? '')
                        .slice(0, 2)
                        .join('')}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverRowName}>
                      {driver.name}
                      {isSelf ? ' (you)' : ''}
                    </Text>
                    <Text style={styles.driverRowStatus}>
                      {presenceLabel(driver)}
                      {' '}
                      {getDriverPresenceStatus(driver).replace('_', ' ')}
                      {speedLabel(driver)}
                    </Text>
                  </View>
                  {isAdmin && !isSelf ? (
                    <TouchableOpacity
                      onPress={() => onRemoveDriver(driver.id)}
                      style={styles.removeBtn}
                      testID={`button-remove-driver-${driver.id}`}
                    >
                      <Text style={styles.removeBtnText}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}

            {isAdmin && hazards.length > 0 ? (
              <View style={{ paddingTop: 8 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 6 }}>Active hazards</Text>
                {hazards.map((hazard) => (
                  <View key={hazard.id} style={[styles.driverRow, { justifyContent: 'space-between' }]}>
                    <Text style={{ color: '#FFFFFF', fontSize: 13 }}>
                      {HAZARD_EMOJI[hazard.type as HazardType] ?? '⚠️'} {hazard.reporterName} · ×{hazard.reportCount}
                    </Text>
                    <TouchableOpacity
                      onPress={() => onDismissHazard(hazard)}
                      style={styles.removeBtn}
                      testID={`button-dismiss-hazard-${hazard.id}`}
                    >
                      <Text style={styles.removeBtnText}>Dismiss</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            {isAdmin ? (
              <View style={styles.endRunRow}>
                <AppButton
                  label={isEndingRun ? 'Ending Run…' : 'End Run'}
                  onPress={onEndRun}
                  testID="button-end-run"
                />
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ─── Tracking enable modal ────────────────────────────────────────────────────

function TrackingModal({
  trackingMode,
  trackingDetail,
  onEnable,
  onOpenSettings,
}: {
  trackingMode: TrackingMode;
  trackingDetail: string | null;
  onEnable: () => void;
  onOpenSettings: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.trackingModal, { paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.trackingModalTitle} testID="text-enable-tracking-title">
        Enable location tracking
      </Text>
      <Text style={styles.trackingModalBody} testID="text-enable-tracking-body">
        Turn on location sharing so ClubRun can place you on the convoy map, keep the roster
        current, and continue updating while your screen is locked when Always access is available.
      </Text>
      <AppButton
        label={trackingMode === 'starting' ? 'Starting Tracking…' : 'Enable Location Tracking'}
        onPress={onEnable}
        testID="button-enable-location-tracking"
      />
      {trackingMode === 'denied' ? (
        <AppButton
          label="Open Settings"
          onPress={onOpenSettings}
          testID="button-open-location-settings"
          variant="secondary"
        />
      ) : null}
      {trackingDetail ? (
        <Text style={styles.trackingModalDetail} testID="text-tracking-detail-modal">{trackingDetail}</Text>
      ) : null}
    </View>
  );
}

function formatTrackingMode(mode: TrackingMode) {
  if (mode === 'background') return 'background enabled';
  if (mode === 'foreground') return 'foreground only';
  if (mode === 'starting') return 'starting';
  return 'disabled';
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RunMapScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const session = useRunSessionStore();
  const setRunSnapshot = useRunSessionStore((state) => state.setRunSnapshot);
  const updateNetworkAvailability = useRunSessionStore((state) => state.updateNetworkAvailability);
  const markRealtimeSynced = useRunSessionStore((state) => state.markRealtimeSynced);

  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<LiveDriver[]>([]);
  const [hazards, setHazards] = useState<LiveHazard[]>([]);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('idle');
  const [trackingDetail, setTrackingDetail] = useState<string | null>(null);
  const [hazardAlert, setHazardAlert] = useState<string | null>(null);
  const [currentRun, setCurrentRun] = useState<Run | null>(null);
  const [isEndingRun, setIsEndingRun] = useState(false);
  const [isStartingDrive, setIsStartingDrive] = useState(false);
  const [userPanned, setUserPanned] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);

  const previousHazardsRef = useRef<LiveHazard[] | null>(null);
  const stopForegroundTrackingRef = useRef<(() => void) | null>(null);

  const mapMode = session.status === 'active' ? 'navigation' : 'lobby';

  // Derive current driver location for distance calculations
  const currentDriver = drivers.find((d) => d.id === session.driverId);

  // ── Run subscription ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;

    return subscribeToRunWithFirebase(
      id,
      (run) => {
        markRealtimeSynced();
        setCurrentRun(run);
        setRunSnapshot(
          run
            ? { name: run.name, status: run.status, route: run.route ?? null }
            : null
        );
      },
      (nextError) => setError(nextError.message)
    );
  }, [id, markRealtimeSynced, setRunSnapshot]);

  // ── Redirect to summary when ended ───────────────────────────────────────
  useEffect(() => {
    if (id && session.status === 'ended') {
      router.replace(`/run/${id}/summary`);
    }
  }, [id, router, session.status]);

  // ── Switch to navigation mode instantly when active ───────────────────────
  useEffect(() => {
    if (session.status === 'active') {
      setUserPanned(false);
      setRecenterToken((t) => t + 1);
    }
  }, [session.status]);

  // ── Driver subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;

    return subscribeToDriversWithFirebase(
      id,
      (nextDrivers) => {
        markRealtimeSynced();
        setDrivers(nextDrivers);
      },
      (nextError) => setError(nextError.message)
    );
  }, [id, markRealtimeSynced]);

  // ── Hazard subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;

    return subscribeToHazardsWithFirebase(
      id,
      (nextHazards) => {
        markRealtimeSynced();
        const visibleHazards = nextHazards.filter((hazard) => isVisibleHazard(hazard));

        if (previousHazardsRef.current) {
          const rawAlert = buildHazardToastMessage(
            previousHazardsRef.current,
            visibleHazards,
            session.driverId
          );
          if (rawAlert) {
            // Enhance with distance if we have current position
            let alertMessage = rawAlert;
            const latestNewHazard = visibleHazards
              .filter((h) => !previousHazardsRef.current?.find((p) => p.id === h.id))
              .sort((a, b) => b.timestamp - a.timestamp)[0];

            if (latestNewHazard && currentDriver?.location) {
              const distM = haversineDistanceMeters(
                [currentDriver.location.lat, currentDriver.location.lng],
                [latestNewHazard.lat, latestNewHazard.lng]
              );
              const distStr =
                distM < 1000 ? `${Math.round(distM)} m` : `${(distM / 1000).toFixed(1)} km`;
              alertMessage = `${rawAlert.split('reported ')[0]}reported ${rawAlert.split('reported ')[1]?.replace(' ahead.', '')} — ${distStr} away`;
            }

            setHazardAlert(alertMessage);
          }
        }

        previousHazardsRef.current = visibleHazards;
        setHazards(visibleHazards);
      },
      (nextError) => setError(nextError.message)
    );
  }, [id, markRealtimeSynced, session.driverId, currentDriver?.location]);

  // ── Cleanup tracking on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopForegroundTrackingRef.current?.();
      stopForegroundTrackingRef.current = null;
      void stopBackgroundTrackingWithExpo();
    };
  }, []);

  // ── Connectivity ──────────────────────────────────────────────────────────
  useEffect(() => {
    return subscribeToConnectivityWithFirebase((isOnline) => {
      updateNetworkAvailability(isOnline);
    });
  }, [updateNetworkAvailability]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleEnableTracking() {
    if (!id || !session.driverId) {
      setError('Join the run before enabling location tracking.');
      setTrackingMode('denied');
      return;
    }

    setError(null);
    setTrackingMode('starting');
    setTrackingDetail('Requesting location access…');

    try {
      stopForegroundTrackingRef.current?.();
      const stopTracking = await startForegroundTrackingWithExpo({
        runId: id,
        driverId: session.driverId,
      });
      stopForegroundTrackingRef.current = stopTracking;
      setTrackingMode('foreground');
      setTrackingDetail('GPS active while app is open.');

      const backgroundResult = await startBackgroundTrackingWithExpo({
        runId: id,
        driverId: session.driverId,
      });

      if (backgroundResult.enabled) {
        setTrackingMode('background');
        setTrackingDetail('Background tracking on — sharing continues when screen is locked.');
        return;
      }

      setTrackingMode('foreground');
      setTrackingDetail('Allow Always for locked-screen updates.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to start tracking.');
      setTrackingMode('denied');
      setTrackingDetail('Open settings to allow location access.');
    }
  }

  async function handleOpenLocationSettings() {
    try {
      await Linking.openSettings();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to open settings.');
    }
  }

  async function handleStartDrive() {
    if (!id) return;
    setIsStartingDrive(true);
    try {
      await startDriveWithFirebase(id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to start the drive.');
    } finally {
      setIsStartingDrive(false);
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

  async function handleReportHazard(type: HazardType) {
    if (!id || !session.driverId || !session.driverName) {
      setError('Join the run before reporting a hazard.');
      return;
    }

    if (!currentDriver?.location) {
      setError('Waiting for GPS before you can report a hazard.');
      return;
    }

    try {
      await reportHazardWithFirebase({
        runId: id,
        reportedBy: session.driverId,
        reporterName: session.driverName,
        type,
        point: [currentDriver.location.lat, currentDriver.location.lng],
        existingHazards: hazards,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to report hazard.');
    }
  }

  async function handleDismissHazard(hazard: LiveHazard) {
    if (!id) return;
    try {
      await dismissHazardWithFirebase(id, hazard);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to dismiss hazard.');
    }
  }

  async function handleRemoveDriver(driverId: string) {
    if (!id) return;
    try {
      await removeDriverWithFirebase(id, driverId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to remove driver.');
    }
  }

  function handleRecenter() {
    setUserPanned(false);
    setRecenterToken((t) => t + 1);
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const driversWithGps = drivers.filter((d) => d.location).length;
  const canStartDrive = session.role === 'admin' && driversWithGps >= 1;
  const showTrackingPrompt =
    trackingMode === 'idle' || trackingMode === 'starting' || trackingMode === 'denied';
  const connectivityOffline = session.connectivityStatus !== 'online';

  const adminName = currentRun
    ? drivers.find((d) => d.id === currentRun.adminId)?.name ?? 'the organiser'
    : 'the organiser';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container} testID="screen-run-map">
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* ── Full-screen map ── */}
      {session.isRunLoaded ? (
        <ClubRunMap
          currentDriverId={session.driverId}
          drivers={drivers}
          edgeToEdge
          hazards={hazards}
          mapMode={mapMode}
          onUserPanned={() => setUserPanned(true)}
          recenterToken={recenterToken}
          routePoints={session.route?.points ?? []}
          testID="live-run-map"
        />
      ) : (
        <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }]}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 16 }}>Loading run…</Text>
        </View>
      )}

      {/* ── Top overlay: status banner + error + connectivity ── */}
      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        {/* Run name pill */}
        <View style={styles.runNamePill} pointerEvents="none">
          <Text style={styles.runNameText} numberOfLines={1} testID="text-run-name">
            {session.runName ?? 'Live Run'}
          </Text>
        </View>

        {/* Lobby waiting banner */}
        {mapMode === 'lobby' ? (
          <View style={styles.lobbyBanner} pointerEvents="none">
            <Text style={styles.lobbyBannerTitle}>
              {session.role === 'admin'
                ? '🏁 Ready to start'
                : `⏳ Waiting for ${adminName} to start the run…`}
            </Text>
            <Text style={styles.lobbyBannerSubtitle}>
              {driversWithGps} / {drivers.length} drivers with GPS active
            </Text>
          </View>
        ) : null}

        {/* Connectivity warning */}
        {connectivityOffline ? (
          <View style={[styles.connectivityBanner, {
            backgroundColor: session.connectivityStatus === 'offline' ? '#7C2D12' : '#78350F',
          }]} pointerEvents="none">
            <Text style={styles.connectivityText} testID="text-connectivity-banner">
              {session.connectivityStatus === 'offline'
                ? 'Offline. Live updates are paused until your connection returns.'
                : 'Reconnecting… syncing live convoy updates.'}
            </Text>
          </View>
        ) : null}

        {/* Error banner */}
        {error ? (
          <TouchableOpacity
            style={styles.errorBanner}
            onPress={() => setError(null)}
            activeOpacity={0.8}
          >
            <Text style={styles.errorText} testID="text-run-error">{error} · tap to dismiss</Text>
          </TouchableOpacity>
        ) : null}

        {/* Hidden accessibility data view for tests */}
        <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} accessible={false}>
          <Text testID="text-run-status">{session.status ?? 'Unknown'}</Text>
          <Text testID="text-run-route-points">{`Route points: ${session.route?.points.length ?? 0}`}</Text>
          <Text testID="text-driver-count">{`Drivers: ${drivers.length}`}</Text>
          <Text testID="text-hazard-count">{`Hazards: ${hazards.length}`}</Text>
          <Text testID="text-tracking-state">{`Tracking: ${formatTrackingMode(trackingMode)}`}</Text>
          {trackingDetail ? (
            <Text testID="text-tracking-detail">{trackingDetail}</Text>
          ) : null}
          {drivers.map((driver) => (
            <Text key={driver.id} testID={`text-driver-presence-${driver.id}`}>
              {`${driver.name} • ${getDriverPresenceStatus(driver).replace('_', ' ')}`}
            </Text>
          ))}
        </View>
      </View>

      {/* ── Incoming hazard alert ── */}
      {hazardAlert ? (
        <View style={[styles.hazardAlertWrapper, { top: insets.top + 80 }]} pointerEvents="box-none">
          <HazardAlert message={hazardAlert} onDismiss={() => setHazardAlert(null)} />
        </View>
      ) : null}

      {/* ── Navigation: recenter button ── */}
      {mapMode === 'navigation' && userPanned ? (
        <TouchableOpacity
          style={[styles.recenterButton, { bottom: insets.bottom + 180 }]}
          onPress={handleRecenter}
          activeOpacity={0.85}
        >
          <Text style={styles.recenterText}>⊕ Recenter</Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Navigation: hazard quick-report buttons (bottom-right) ── */}
      {mapMode === 'navigation' ? (
        <View
          style={[styles.hazardButtons, { bottom: insets.bottom + 170 }]}
          pointerEvents="box-none"
        >
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
            <TouchableOpacity
              key={type}
              style={styles.hazardButton}
              onPress={() => {
                void handleReportHazard(type);
              }}
              activeOpacity={0.8}
              testID={`button-hazard-${type}`}
            >
              <Text style={styles.hazardButtonEmoji}>{HAZARD_EMOJI[type]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* ── Navigation: driver awareness panel (bottom sheet) ── */}
      {mapMode === 'navigation' && session.isRunLoaded ? (
        <DriverPanel
          drivers={drivers}
          currentDriverId={session.driverId}
          hazards={hazards}
          isAdmin={session.role === 'admin'}
          isEndingRun={isEndingRun}
          onDismissHazard={(hazard) => { void handleDismissHazard(hazard); }}
          onEndRun={() => { void handleEndRun(); }}
          onRemoveDriver={(driverId) => { void handleRemoveDriver(driverId); }}
          accentColor={theme.colors.accent}
        />
      ) : null}

      {/* ── Lobby: Start Drive button + admin hazard panel ── */}
      {mapMode === 'lobby' ? (
        <View
          style={[styles.lobbyBottom, { paddingBottom: insets.bottom + 16 }]}
          pointerEvents="box-none"
        >
          {session.role === 'admin' ? (
            <TouchableOpacity
              style={[
                styles.startDriveButton,
                !canStartDrive && styles.startDriveButtonDisabled,
              ]}
              onPress={() => { void handleStartDrive(); }}
              disabled={!canStartDrive || isStartingDrive}
              activeOpacity={0.85}
            >
              <Text style={styles.startDriveText}>
                {isStartingDrive ? '🚀 Starting…' : '🚀 Start Drive'}
              </Text>
              {!canStartDrive ? (
                <Text style={styles.startDriveHint}>
                  Waiting for at least 1 driver with GPS
                </Text>
              ) : null}
            </TouchableOpacity>
          ) : (
            <View style={styles.lobbyWaitCard} pointerEvents="none">
              <Text style={styles.lobbyWaitText}>
                🗺️ Explore the route while you wait. The drive will begin automatically.
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {/* ── Tracking enable prompt (modal overlay) ── */}
      {showTrackingPrompt ? (
        <View style={[styles.trackingModalWrapper, { paddingBottom: insets.bottom }]}>
          <TrackingModal
            trackingMode={trackingMode}
            trackingDetail={trackingDetail}
            onEnable={() => { void handleEnableTracking(); }}
            onOpenSettings={() => { void handleOpenLocationSettings(); }}
          />
        </View>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },

  // Top overlay
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    gap: 6,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  runNamePill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  runNameText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  lobbyBanner: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  lobbyBannerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  lobbyBannerSubtitle: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  connectivityBanner: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  connectivityText: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(185,28,28,0.92)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Hazard alert
  hazardAlertWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
  },
  hazardAlert: {
    backgroundColor: '#1C1917',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    overflow: 'hidden',
  },
  hazardAlertInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  hazardAlertText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  hazardAlertDismiss: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Recenter
  recenterButton: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 15,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  recenterText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },

  // Hazard quick-report buttons (navigation)
  hazardButtons: {
    position: 'absolute',
    right: 12,
    flexDirection: 'column',
    gap: 8,
    zIndex: 15,
  },
  hazardButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: { elevation: 3 },
    }),
  },
  hazardButtonEmoji: {
    fontSize: 22,
  },

  // Driver panel (bottom sheet)
  driverPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(17,24,39,0.96)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 15,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  driverPanelHandle: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  driverPanelHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4B5563',
  },

  // Driver strip (collapsed)
  driverStrip: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 14,
    flexDirection: 'row',
  },
  driverStripItem: {
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  },
  driverStripAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverStripInitials: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  driverStatusDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(17,24,39,0.96)',
  },
  driverStripName: {
    color: '#D1D5DB',
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 46,
    textAlign: 'center',
  },

  // Driver list (expanded)
  driverList: {
    maxHeight: 320,
    paddingHorizontal: 16,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 12,
    marginBottom: 4,
  },
  driverRowAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverRowInitials: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  driverRowName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  driverRowStatus: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 1,
  },
  removeBtn: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  endRunRow: {
    paddingVertical: 12,
  },

  // Lobby bottom
  lobbyBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    gap: 10,
    zIndex: 15,
  },
  startDriveButton: {
    backgroundColor: '#22C55E',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  startDriveButtonDisabled: {
    backgroundColor: '#374151',
  },
  startDriveText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  startDriveHint: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '500',
  },
  lobbyWaitCard: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  lobbyWaitText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Tracking modal
  trackingModalWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  trackingModal: {
    backgroundColor: 'rgba(17,24,39,0.97)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 10 },
    }),
  },
  trackingModalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  trackingModalBody: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 22,
  },
  trackingModalDetail: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 18,
  },
});
