import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClubRunMap } from '@/components/map/ClubRunMap';
import { AppButton } from '@/components/ui/AppButton';
import { useAuthSession } from '@/contexts/AuthContext';
import {
  startBackgroundTrackingWithExpo,
  stopBackgroundTrackingWithExpo,
} from '@/lib/backgroundTracking';
import { updateAdminRunStatusInHistory } from '@/lib/adminRunHistory';
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
import { reopenRoutePlannerFromLobbyWithFirebase } from '@/lib/routeService';
import { startDriveWithFirebase } from '@/lib/runService';
import { subscribeToRunWithFirebase } from '@/lib/runRealtime';
import { endRunWithFirebase } from '@/lib/summaryService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { HazardType, Run } from '@/types/domain';

type TrackingMode = 'idle' | 'starting' | 'foreground' | 'background' | 'denied';

const HAZARD_EMOJI: Record<HazardType, keyof typeof MaterialIcons.glyphMap> = {
  pothole: 'trip-origin',
  roadworks: 'construction',
  police: 'local-police',
  debris: 'warning-amber',
  animal: 'pets',
  broken_down_car: 'car-crash',
};

const LIVE_MAP_TINT = '#0A84FF';
const LIVE_MAP_ROUTE = '#FF3B30';
const ANIMATIONS_ENABLED = !process.env.JEST_WORKER_ID;

function getPresenceMeta(driver: LiveDriver) {
  const status = getDriverPresenceStatus(driver);
  if (status === 'active') {
    return { color: '#16A34A', label: 'active' };
  }
  if (status === 'stale') {
    return { color: '#D97706', label: 'checking in' };
  }
  if (status === 'lost_signal') {
    return { color: '#DC2626', label: 'lost signal' };
  }
  return { color: '#64748B', label: 'waiting for GPS' };
}

function getSelfDriverLabel(name: string) {
  return name.trim().toLowerCase() === 'you' ? 'You' : `${name} (you)`;
}

// ─── Incoming hazard alert (Waze-style slide from top) ───────────────────────

function HazardAlert({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (!ANIMATIONS_ENABLED) {
      translateY.setValue(0);
      return;
    }

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

    let dismissTimer: ReturnType<typeof setTimeout> | null = null;
    slideIn.start(() => {
      dismissTimer = setTimeout(() => {
        slideOut.start(() => onDismiss());
      }, 4500);
    });

    return () => {
      slideIn.stop();
      slideOut.stop();
      if (dismissTimer) {
        clearTimeout(dismissTimer);
      }
    };
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
  onExpandedChange,
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
  onExpandedChange?: (expanded: boolean) => void;
  onDismissHazard: (hazard: LiveHazard) => void;
  onEndRun: () => void;
  onRemoveDriver: (id: string) => void;
  accentColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingEndRun, setConfirmingEndRun] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

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
          setConfirmingEndRun(false);
        }
        if (!ANIMATIONS_ENABLED) {
          panY.setValue(0);
          return;
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

  function speedLabel(driver: LiveDriver) {
    if (!driver.location?.speed || driver.location.speed < 0.5) return '';
    const kmh = Math.round(driver.location.speed * 3.6);
    return ` · ${kmh} km/h`;
  }

  function toggleExpanded() {
    setExpanded((current) => {
      const nextExpanded = !current;
      if (current) {
        setConfirmingEndRun(false);
      }
      return nextExpanded;
    });
  }

  return (
    <Animated.View
      style={[
        styles.driverPanel,
        {
          paddingBottom: insets.bottom + 6,
          transform: [{ translateY: panY }],
        },
      ]}
    >
      <TouchableOpacity
        onPress={toggleExpanded}
        style={styles.driverPanelHandle}
      >
        <View style={styles.driverPanelHandleBar} />
      </TouchableOpacity>

      {!expanded ? (
        <TouchableOpacity onPress={toggleExpanded} activeOpacity={0.88} testID="button-driver-panel-toggle">
          <View style={styles.driverStripHeader}>
            <View>
              <Text style={styles.driverStripTitle}>Drivers</Text>
              <Text style={styles.driverStripSubtitle}>
                {drivers.filter((driver) => getDriverPresenceStatus(driver) === 'active').length} live
                {' · '}
                {drivers.length} in convoy
              </Text>
            </View>
            <MaterialIcons color="#475569" name="keyboard-arrow-up" size={22} />
          </View>
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
                        backgroundColor: isSelf ? accentColor : '#CBD5E1',
                        borderColor: isSelf ? '#DBEAFE' : '#FFFFFF',
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.driverStripInitials,
                        { color: isSelf ? '#FFFFFF' : '#0F172A' },
                      ]}
                    >
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
        <Animated.View {...panResponder.panHandlers}>
          <View style={styles.driverListHeader}>
            <View>
              <Text style={styles.driverListTitle}>Convoy</Text>
              <Text style={styles.driverListSubtitle}>
                {drivers.filter((driver) => getDriverPresenceStatus(driver) === 'active').length} live
                {' · '}
                {drivers.length} total
              </Text>
            </View>
            <TouchableOpacity
              onPress={toggleExpanded}
              activeOpacity={0.8}
              testID="button-driver-panel-toggle"
            >
              <MaterialIcons color="#64748B" name="keyboard-arrow-down" size={22} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.driverList} showsVerticalScrollIndicator={false}>
            {sortedDrivers.map((driver) => {
              const isSelf = driver.id === currentDriverId;
              const presence = getPresenceMeta(driver);
              return (
                <View
                  key={driver.id}
                  style={[
                    styles.driverRow,
                    isSelf && { backgroundColor: 'rgba(10,132,255,0.12)' },
                  ]}
                >
                  <View
                    style={[
                      styles.driverRowAvatar,
                      { backgroundColor: isSelf ? accentColor : '#CBD5E1' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.driverRowInitials,
                        { color: isSelf ? '#FFFFFF' : '#0F172A' },
                      ]}
                    >
                      {driver.name
                        .split(' ')
                        .map((p) => p[0]?.toUpperCase() ?? '')
                        .slice(0, 2)
                        .join('')}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverRowName}>
                      {isSelf ? getSelfDriverLabel(driver.name) : driver.name}
                    </Text>
                    <Text style={[styles.driverRowStatus, { color: presence.color }]}>
                      {presence.label}
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
                <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                  Active hazards
                </Text>
                {hazards.map((hazard) => (
                  <View key={hazard.id} style={[styles.driverRow, styles.activeHazardRow]}>
                    <View style={styles.activeHazardMeta}>
                      <View style={styles.activeHazardIcon}>
                        <MaterialIcons
                          color="#0F172A"
                          name={HAZARD_EMOJI[hazard.type as HazardType] ?? 'warning-amber'}
                          size={18}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.activeHazardTitle}>
                          {HAZARD_LABELS[hazard.type as HazardType] ?? 'Hazard'}
                        </Text>
                        <Text style={styles.activeHazardDetail}>
                          {hazard.reporterName} · {hazard.reportCount} report
                          {hazard.reportCount === 1 ? '' : 's'}
                        </Text>
                      </View>
                    </View>
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
                {confirmingEndRun ? (
                  <View style={styles.endRunConfirmCard}>
                    <Text style={styles.endRunConfirmTitle}>End this run for everyone?</Text>
                    <Text style={styles.endRunConfirmBody}>
                      This moves the convoy to the summary screen and stops the live drive.
                    </Text>
                    <View style={styles.endRunConfirmActions}>
                      <TouchableOpacity
                        onPress={() => setConfirmingEndRun(false)}
                        style={styles.endRunCancelButton}
                        activeOpacity={0.82}
                        testID="button-cancel-end-run"
                      >
                        <Text style={styles.endRunCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={onEndRun}
                        style={styles.endRunConfirmButton}
                        activeOpacity={0.82}
                        testID="button-confirm-end-run"
                      >
                        <Text style={styles.endRunConfirmButtonText}>
                          {isEndingRun ? 'Ending…' : 'Confirm End'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => setConfirmingEndRun(true)}
                    style={styles.endRunSubtleButton}
                    activeOpacity={0.82}
                    testID="button-end-run"
                  >
                    <MaterialIcons color="#DC2626" name="stop-circle" size={18} />
                    <Text style={styles.endRunSubtleText}>End Run</Text>
                  </TouchableOpacity>
                )}
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

function HazardActionRail({
  bottom,
  disabled,
  onSelectHazard,
}: {
  bottom: number;
  disabled: boolean;
  onSelectHazard: (type: HazardType) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ANIMATIONS_ENABLED) {
      progress.setValue(expanded ? 1 : 0);
      return;
    }

    Animated.spring(progress, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
      bounciness: 8,
      speed: 16,
    }).start();
  }, [expanded, progress]);

  const railWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 206],
  });
  const railOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const railTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  function handleSelect(type: HazardType) {
    onSelectHazard(type);
    setExpanded(false);
  }

  return (
    <View style={[styles.actionRailWrapper, { bottom }]} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.actionRailPanel,
          {
            width: railWidth,
            opacity: railOpacity,
            transform: [{ translateX: railTranslate }],
          },
        ]}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        <View style={styles.actionRailGrid}>
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
            <Pressable
              key={type}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => handleSelect(type)}
              style={({ pressed }) => [
                styles.actionRailButton,
                disabled && styles.actionRailButtonDisabled,
                pressed && !disabled && styles.actionRailButtonPressed,
              ]}
              testID={`button-hazard-${type}`}
            >
              <MaterialIcons
                color="#0F172A"
                name={HAZARD_EMOJI[type]}
                size={18}
              />
              <Text style={styles.actionRailLabel} numberOfLines={1}>
                {type === 'broken_down_car'
                  ? 'Breakdown'
                  : HAZARD_LABELS[type]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.actionRailToggle,
          expanded && styles.actionRailToggleActive,
          pressed && styles.actionRailTogglePressed,
        ]}
        testID="button-open-hazard-actions"
      >
        <MaterialIcons
          color={expanded ? '#FFFFFF' : '#0F172A'}
          name={expanded ? 'close' : 'report-problem'}
          size={24}
        />
      </Pressable>
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
  const auth = useAuthSession();
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
  const [isConfirmingRouteEdit, setIsConfirmingRouteEdit] = useState(false);
  const [isEndingRun, setIsEndingRun] = useState(false);
  const [isReopeningRoute, setIsReopeningRoute] = useState(false);
  const [isStartingDrive, setIsStartingDrive] = useState(false);
  const [isDriverPanelExpanded, setIsDriverPanelExpanded] = useState(false);
  const [userPanned, setUserPanned] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);

  const previousHazardsRef = useRef<LiveHazard[] | null>(null);
  const stopForegroundTrackingRef = useRef<(() => void) | null>(null);

  const mapMode = session.status === 'active' ? 'navigation' : 'lobby';
  const displayDrivers = useMemo(
    () =>
      drivers.map((driver) =>
        driver.id === session.driverId &&
        driver.name === 'Unknown driver' &&
        session.driverName
          ? {
              ...driver,
              name: session.driverName,
            }
          : driver
      ),
    [drivers, session.driverId, session.driverName]
  );

  // Derive current driver location for distance calculations
  const currentDriver = displayDrivers.find((d) => d.id === session.driverId);

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
      setIsDriverPanelExpanded(false);
      setIsConfirmingRouteEdit(false);
      setUserPanned(false);
      setRecenterToken((t) => t + 1);
    }
  }, [session.status]);

  useEffect(() => {
    if (session.status !== 'ready') {
      setIsConfirmingRouteEdit(false);
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
    if (!hasAdminAuthority) {
      setError(
        auth.status === 'loading'
          ? 'Still confirming organiser access. Try again in a moment.'
          : 'Only the organiser can start the drive.'
      );
      return;
    }
    setIsStartingDrive(true);
    try {
      await startDriveWithFirebase(id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to start the drive.');
    } finally {
      setIsStartingDrive(false);
    }
  }

  async function handleConfirmEditRoute() {
    if (!id) {
      return;
    }

    if (!hasAdminAuthority || currentRun?.status !== 'ready' || typeof currentRun?.driveStartedAt === 'number') {
      setIsConfirmingRouteEdit(false);
      setError(
        auth.status === 'loading'
          ? 'Still confirming organiser access. Try again in a moment.'
          : 'Route editing is only available to the organiser before the drive has started.'
      );
      return;
    }

    setError(null);
    setIsReopeningRoute(true);

    try {
      await reopenRoutePlannerFromLobbyWithFirebase(id);
      void updateAdminRunStatusInHistory(id, 'draft');
      setRunSnapshot({
        name: currentRun?.name ?? session.runName ?? undefined,
        route: currentRun?.route ?? session.route ?? null,
        status: 'draft',
      });
      setIsConfirmingRouteEdit(false);
      const routePlannerHref = (
        session.joinCode
          ? `/create/route?runId=${encodeURIComponent(id)}&joinCode=${encodeURIComponent(session.joinCode)}`
          : `/create/route?runId=${encodeURIComponent(id)}`
      ) as `/create/route?${string}`;
      router.replace(routePlannerHref);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to reopen the route planner.');
    } finally {
      setIsReopeningRoute(false);
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
  const driversWithGps = displayDrivers.filter((d) => d.location).length;
  const runAdminId = currentRun?.adminId ?? (session.role === 'admin' ? session.driverId : null);
  const isOrganiserSession = session.role === 'admin';
  const hasAdminAuthority =
    isOrganiserSession &&
    auth.status === 'ready' &&
    Boolean(auth.userId) &&
    Boolean(runAdminId) &&
    auth.userId === runAdminId;
  const canStartDrive = hasAdminAuthority && driversWithGps >= 1;
  const hasDriveStarted = typeof currentRun?.driveStartedAt === 'number';
  const canEditRoute = hasAdminAuthority && currentRun?.status === 'ready' && !hasDriveStarted;
  const showTrackingPrompt =
    trackingMode === 'idle' || trackingMode === 'starting' || trackingMode === 'denied';
  const connectivityOffline = session.connectivityStatus !== 'online';

  const adminName = currentRun
    ? displayDrivers.find((d) => d.id === currentRun.adminId)?.name ?? 'the organiser'
    : 'the organiser';
  const runSubtitle =
    mapMode === 'lobby'
      ? session.role === 'admin'
        ? `${driversWithGps}/${displayDrivers.length} ready to start`
        : `Waiting for ${adminName}`
      : `${driversWithGps}/${displayDrivers.length} live · ${hazards.length} hazards`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container} testID="screen-run-map">
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="dark-content"
      />

      {/* ── Full-screen map ── */}
      {session.isRunLoaded ? (
        <ClubRunMap
          accentColorOverride={LIVE_MAP_TINT}
          currentDriverId={session.driverId}
          drivers={displayDrivers}
          edgeToEdge
          hazards={hazards}
          mapMode={mapMode}
          onUserPanned={() => setUserPanned(true)}
          recenterToken={recenterToken}
          routeColorOverride={LIVE_MAP_ROUTE}
          routePoints={session.route?.points ?? []}
          testID="live-run-map"
        />
      ) : (
        <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }]}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 16 }}>Loading run…</Text>
        </View>
      )}

      {/* ── Top overlay: compact chrome + status banners ── */}
      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.topBar}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.topIconButton}
            activeOpacity={0.86}
            testID="button-back-live-map"
          >
            <MaterialIcons color="#0F172A" name="arrow-back-ios-new" size={22} />
          </TouchableOpacity>

          <View style={styles.runHeaderCard}>
            <View style={styles.runHeaderCopy}>
              <Text style={styles.runHeaderTitle} numberOfLines={1} testID="text-run-name">
                {session.runName ?? 'Live Run'}
              </Text>
              <Text style={styles.runHeaderSubtitle} numberOfLines={1}>
                {runSubtitle}
              </Text>
            </View>
          </View>
        </View>

        {/* Connectivity warning */}
        {connectivityOffline ? (
          <View
            style={[
              styles.connectivityBanner,
              {
                backgroundColor:
                  session.connectivityStatus === 'offline'
                    ? 'rgba(153, 27, 27, 0.94)'
                    : 'rgba(185, 28, 28, 0.88)',
              },
            ]}
            pointerEvents="none"
          >
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
          <Text testID="text-driver-count">{`Drivers: ${displayDrivers.length}`}</Text>
          <Text testID="text-hazard-count">{`Hazards: ${hazards.length}`}</Text>
          <Text testID="text-tracking-state">{`Tracking: ${formatTrackingMode(trackingMode)}`}</Text>
          {trackingDetail ? (
            <Text testID="text-tracking-detail">{trackingDetail}</Text>
          ) : null}
          {displayDrivers.map((driver) => (
            <Text key={driver.id} testID={`text-driver-presence-${driver.id}`}>
              {`${driver.name} • ${getDriverPresenceStatus(driver).replace('_', ' ')}`}
            </Text>
          ))}
        </View>
      </View>

      {/* ── Incoming hazard alert ── */}
      {hazardAlert ? (
        <View style={[styles.hazardAlertWrapper, { top: insets.top + 62 }]} pointerEvents="box-none">
          <HazardAlert message={hazardAlert} onDismiss={() => setHazardAlert(null)} />
        </View>
      ) : null}

      {/* ── Navigation: recenter button ── */}
      {mapMode === 'navigation' && userPanned ? (
        <TouchableOpacity
          style={[styles.recenterButton, { bottom: insets.bottom + 182 }]}
          onPress={handleRecenter}
          activeOpacity={0.85}
          testID="button-recenter-map"
        >
          <MaterialIcons color={LIVE_MAP_TINT} name="my-location" size={17} />
          <Text style={styles.recenterText}>Recenter</Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Navigation: expandable quick actions ── */}
      {mapMode === 'navigation' && !isDriverPanelExpanded ? (
        <HazardActionRail
          bottom={insets.bottom + 144}
          disabled={!currentDriver?.location}
          onSelectHazard={(type) => {
            void handleReportHazard(type);
          }}
        />
      ) : null}

      {/* ── Navigation: driver awareness panel (bottom sheet) ── */}
      {mapMode === 'navigation' && session.isRunLoaded ? (
        <DriverPanel
          drivers={displayDrivers}
          currentDriverId={session.driverId}
          hazards={hazards}
          isAdmin={hasAdminAuthority}
          isEndingRun={isEndingRun}
          onExpandedChange={setIsDriverPanelExpanded}
          onDismissHazard={(hazard) => { void handleDismissHazard(hazard); }}
          onEndRun={() => { void handleEndRun(); }}
          onRemoveDriver={(driverId) => { void handleRemoveDriver(driverId); }}
          accentColor={LIVE_MAP_TINT}
        />
      ) : null}

      {/* ── Lobby: Start Drive button + admin hazard panel ── */}
      {mapMode === 'lobby' ? (
        <View
          style={[styles.lobbyBottom, { paddingBottom: insets.bottom + 16 }]}
          pointerEvents="box-none"
        >
          <View style={styles.lobbyCard}>
            {isOrganiserSession ? (
              <>
                <Text style={styles.lobbyCardEyebrow}>Lobby</Text>
                <Text style={styles.lobbyCardTitle}>Ready to roll when the convoy is ready</Text>
                <Text style={styles.lobbyCardBody}>
                  {auth.status === 'loading'
                    ? 'Confirming organiser access before lobby controls unlock.'
                    : canStartDrive
                    ? `${driversWithGps} driver${driversWithGps === 1 ? '' : 's'} with GPS are ready.`
                    : hasAdminAuthority
                    ? 'Ask one driver to enable location so the live drive can begin cleanly.'
                    : 'Sign in with the organiser account to manage this lobby.'}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.startDriveButton,
                    (!canStartDrive || isStartingDrive) && styles.startDriveButtonDisabled,
                  ]}
                  onPress={() => {
                    void handleStartDrive();
                  }}
                  disabled={!canStartDrive || isStartingDrive}
                  activeOpacity={0.86}
                >
                  <Text style={styles.startDriveText}>
                    {isStartingDrive ? 'Starting…' : 'Start Drive'}
                  </Text>
                  <MaterialIcons color="#FFFFFF" name="navigation" size={18} />
                </TouchableOpacity>
                {canEditRoute ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isReopeningRoute}
                    onPress={() => setIsConfirmingRouteEdit(true)}
                    style={({ pressed }) => [
                      styles.editRouteSecondaryButton,
                      pressed && styles.editRouteSecondaryButtonPressed,
                    ]}
                    testID="button-edit-route"
                  >
                    <Text style={styles.editRouteSecondaryText}>
                      {isReopeningRoute ? 'Opening…' : 'Edit Route'}
                    </Text>
                  </Pressable>
                ) : null}
                {!canStartDrive ? (
                  <Text style={styles.startDriveHint}>
                    {auth.status === 'loading'
                      ? 'Checking organiser access…'
                      : hasAdminAuthority
                      ? 'Waiting for at least 1 driver with GPS'
                      : 'Lobby controls unlock once organiser access is confirmed.'}
                  </Text>
                ) : null}
                {hasDriveStarted ? (
                  <Text style={styles.startDriveHint}>Route editing is unavailable after launch.</Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.lobbyCardEyebrow}>Live Lobby</Text>
                <Text style={styles.lobbyCardTitle}>Take in the route while everyone joins</Text>
                <Text style={styles.lobbyCardBody}>
                  The organiser will start the drive once the convoy is ready.
                </Text>
              </>
            )}
          </View>
        </View>
      ) : null}

      {isConfirmingRouteEdit ? (
        <View style={styles.routeEditConfirmOverlay}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsConfirmingRouteEdit(false)}
            style={styles.routeEditConfirmBackdrop}
            testID="button-cancel-edit-route-backdrop"
          />
          <View style={[styles.routeEditConfirmSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.routeEditConfirmEyebrow}>Edit Route</Text>
            <Text style={styles.routeEditConfirmTitle}>Return to the route planner?</Text>
            <Text style={styles.routeEditConfirmBody}>
              You&apos;ll leave the lobby and reopen the planner. Drivers stay joined and you can
              open the lobby again when your edits are done.
            </Text>
            <View style={styles.routeEditConfirmActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isReopeningRoute}
                onPress={() => setIsConfirmingRouteEdit(false)}
                style={({ pressed }) => [
                  styles.routeEditCancelButton,
                  pressed && styles.routeEditCancelButtonPressed,
                ]}
                testID="button-cancel-edit-route"
              >
                <Text style={styles.routeEditCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isReopeningRoute}
                onPress={() => {
                  void handleConfirmEditRoute();
                }}
                style={({ pressed }) => [
                  styles.routeEditConfirmButton,
                  pressed && styles.routeEditConfirmButtonPressed,
                  isReopeningRoute && styles.routeEditConfirmButtonDisabled,
                ]}
                testID="button-confirm-edit-route"
              >
                <Text style={styles.routeEditConfirmText}>
                  {isReopeningRoute ? 'Opening…' : 'Edit Route'}
                </Text>
              </Pressable>
            </View>
          </View>
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
    gap: 10,
    paddingHorizontal: 14,
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
  },
  topIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
      android: { elevation: 5 },
    }),
  },
  runHeaderCard: {
    maxWidth: 248,
    minWidth: 164,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
      android: { elevation: 5 },
    }),
  },
  runHeaderCopy: {
    gap: 2,
  },
  runHeaderTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  runHeaderSubtitle: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  connectivityBanner: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  connectivityText: {
    color: '#FFF7ED',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(220,38,38,0.94)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 11,
    zIndex: 15,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
    }),
  },
  recenterText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },

  // Expandable action rail
  actionRailWrapper: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    zIndex: 15,
  },
  actionRailPanel: {
    overflow: 'hidden',
    borderRadius: 22,
    marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.74)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
    }),
  },
  actionRailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: 200,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  actionRailButton: {
    width: 54,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  actionRailButtonDisabled: {
    opacity: 0.42,
  },
  actionRailButtonPressed: {
    opacity: 0.86,
  },
  actionRailLabel: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '700',
  },
  actionRailToggle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
    }),
  },
  actionRailToggleActive: {
    backgroundColor: LIVE_MAP_TINT,
  },
  actionRailTogglePressed: {
    opacity: 0.86,
  },

  // Driver panel (bottom sheet)
  driverPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    zIndex: 15,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.76)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
    }),
  },
  driverPanelHandle: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  driverPanelHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  driverStripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  driverStripTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  driverStripSubtitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

  // Driver strip (collapsed)
  driverStrip: {
    paddingHorizontal: 16,
    paddingBottom: 14,
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
    borderColor: '#FFFFFF',
  },
  driverStripName: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 46,
    textAlign: 'center',
  },

  // Driver list (expanded)
  driverListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  driverListTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
  },
  driverListSubtitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  driverList: {
    maxHeight: 360,
    paddingHorizontal: 16,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 12,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
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
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '600',
  },
  driverRowStatus: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  activeHazardRow: {
    justifyContent: 'space-between',
  },
  activeHazardMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activeHazardIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeHazardTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  activeHazardDetail: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  removeBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  endRunRow: {
    paddingVertical: 12,
  },
  endRunSubtleButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(220,38,38,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  endRunSubtleText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  endRunConfirmCard: {
    borderRadius: 18,
    backgroundColor: '#FFF7F7',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.18)',
    padding: 14,
    gap: 12,
  },
  endRunConfirmTitle: {
    color: '#7F1D1D',
    fontSize: 15,
    fontWeight: '700',
  },
  endRunConfirmBody: {
    color: '#7F1D1D',
    fontSize: 13,
    lineHeight: 19,
  },
  endRunConfirmActions: {
    flexDirection: 'row',
    gap: 10,
  },
  endRunCancelButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endRunCancelText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  endRunConfirmButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endRunConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Lobby bottom
  lobbyBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 15,
  },
  lobbyCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.76)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
    }),
  },
  lobbyCardEyebrow: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  lobbyCardTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  lobbyCardBody: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 12,
  },
  startDriveButton: {
    backgroundColor: LIVE_MAP_TINT,
    borderRadius: 18,
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startDriveButtonDisabled: {
    backgroundColor: 'rgba(148,163,184,0.94)',
  },
  startDriveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  editRouteSecondaryButton: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editRouteSecondaryButtonPressed: {
    opacity: 0.7,
  },
  editRouteSecondaryText: {
    color: LIVE_MAP_TINT,
    fontSize: 13,
    fontWeight: '700',
  },
  startDriveHint: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },

  // Route edit confirmation
  routeEditConfirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 24,
    justifyContent: 'flex-end',
  },
  routeEditConfirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
  },
  routeEditConfirmSheet: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: 18,
    paddingTop: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
      },
      android: { elevation: 10 },
    }),
  },
  routeEditConfirmEyebrow: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  routeEditConfirmTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 6,
  },
  routeEditConfirmBody: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  routeEditConfirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  routeEditCancelButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeEditCancelButtonPressed: {
    opacity: 0.78,
  },
  routeEditCancelText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '700',
  },
  routeEditConfirmButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: LIVE_MAP_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeEditConfirmButtonPressed: {
    opacity: 0.86,
  },
  routeEditConfirmButtonDisabled: {
    opacity: 0.6,
  },
  routeEditConfirmText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 10 },
    }),
  },
  trackingModalTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
  },
  trackingModalBody: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 22,
  },
  trackingModalDetail: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
  },
});
