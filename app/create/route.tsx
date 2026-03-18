import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import { ClubRunMap } from '@/components/map/ClubRunMap';
import { AppButton } from '@/components/ui/AppButton';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAppTheme } from '@/contexts/ThemeContext';
import { RoutePoint } from '@/lib/geo';
import { PlaceSearchResult, searchPlacesWithProvider } from '@/lib/placeSearchService';
import {
  clearRoutePlannerDraft,
  loadRoutePlannerDraft,
  RoutePlannerSheetState,
  saveRoutePlannerDraft,
} from '@/lib/routePlannerDraftService';
import {
  buildRouteWaypointsFromStops,
  countWaypointStops,
  createRouteStop,
  formatStopCoordinateLabel,
  getRoutePlannerStage,
  isRouteStopComplete,
  parseCoordinateInput,
  reorderWaypointStopToIndex,
  reorderWaypointStopToEnd,
  removeWaypointStop,
  swapStartAndDestinationStops,
} from '@/lib/routePlanner';
import {
  fetchRoadRouteFromStops,
  saveRouteDraftToRunWithFirebase,
  startRunWithSavedRouteWithFirebase,
} from '@/lib/routeService';
import { useDeviceLocationStore } from '@/stores/deviceLocationStore';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { RouteData, RouteStopDraft } from '@/types/domain';

const FALLBACK_POINT: RoutePoint = [-26.2041, 28.0473];
const REORDER_ROW_HEIGHT = 88;
const SHEET_EXPANDED_BOTTOM = 468;
const SHEET_MINIMIZED_BOTTOM = 112;

type VisibleSheetState = Exclude<RoutePlannerSheetState, 'hidden'>;
type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];
type ReorderDragState = {
  stopId: string;
  initialIndex: number;
  targetIndex: number;
  dy: number;
};

export default function RoutePlanningScreen() {
  const router = useRouter();
  const { runId, joinCode } = useLocalSearchParams<{ runId?: string; joinCode?: string }>();
  const { theme } = useAppTheme();
  const setRunSnapshot = useRunSessionStore((state) => state.setRunSnapshot);
  const savedRoute = useRunSessionStore((state) => state.route);
  const currentLocation = useDeviceLocationStore((state) => state.currentLocation);
  const bootstrapLocation = useDeviceLocationStore((state) => state.bootstrapLocation);
  const refreshLocation = useDeviceLocationStore((state) => state.refreshLocation);

  const [stops, setStops] = useState<RouteStopDraft[]>(() => createInitialPlannerStops());
  const [selectedStopId, setSelectedStopId] = useState<string>('start');
  const [searchInput, setSearchInput] = useState('');
  const [routePreview, setRoutePreview] = useState<RouteData | null>(savedRoute ?? null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRouteSaved, setIsRouteSaved] = useState(Boolean(savedRoute?.points.length));
  const [sheetState, setSheetState] = useState<VisibleSheetState>('main');
  const [isPickMode, setIsPickMode] = useState(false);
  const [pendingPickedPoint, setPendingPickedPoint] = useState<RoutePoint | null>(null);
  const [focusPoint, setFocusPoint] = useState<RoutePoint | null>(null);
  const [mapCenterPoint, setMapCenterPoint] = useState<RoutePoint>(FALLBACK_POINT);
  const [reorderDragState, setReorderDragState] = useState<ReorderDragState | null>(null);
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const hasAutoCentered = useRef(false);
  const previousVisibleSheetStateRef = useRef<VisibleSheetState>('main');
  const stopsRef = useRef(stops);
  const waypointStopsRef = useRef<RouteStopDraft[]>([]);
  const reorderDragStateRef = useRef<ReorderDragState | null>(null);

  const selectedStop = useMemo(
    () => stops.find((stop) => stop.id === selectedStopId) ?? stops[0],
    [selectedStopId, stops]
  );
  const completeWaypoints = useMemo(() => buildRouteWaypointsFromStops(stops), [stops]);
  const plannerStage = useMemo(() => getRoutePlannerStage(stops), [stops]);
  const waypointStops = useMemo(() => stops.filter((stop) => stop.kind === 'waypoint'), [stops]);
  const routeDuration = formatRouteDuration(routePreview?.durationSeconds);
  const routeDistance = routePreview ? `${(routePreview.distanceMetres / 1000).toFixed(1)} km` : null;
  const routeStats = useMemo(
    () => [
      { key: 'distance', label: 'Distance', value: routeDistance ?? 'Route TBD' },
      { key: 'duration', label: 'Drive time', value: routePreview ? routeDuration : 'Time TBD' },
      { key: 'stops', label: 'Stops', value: `${countWaypointStops(stops)} stops` },
    ],
    [routeDistance, routeDuration, routePreview, stops]
  );
  const hasMeaningfulDraft = useMemo(
    () => stops.some((stop) => isRouteStopComplete(stop)) || waypointStops.length > 0,
    [stops, waypointStops.length]
  );
  const routeSaveStateLabel = isRouteSaved
    ? 'Ready to start'
    : hasMeaningfulDraft
      ? 'Draft changed'
      : 'Draft in progress';
  const sheetPrompt =
    plannerStage === 'start'
      ? 'Choose start'
      : plannerStage === 'destination'
        ? 'Choose destination'
        : 'Add stops or save route';
  const currentSheetState: RoutePlannerSheetState = isPickMode ? 'hidden' : sheetState;
  const isMainSheet = sheetState === 'main';
  const isMinimizedSheet = sheetState === 'minimized';
  const isReorderSheet = sheetState === 'reorder';
  const mapButtonBottom = isPickMode ? 148 : isMinimizedSheet ? SHEET_MINIMIZED_BOTTOM : SHEET_EXPANDED_BOTTOM;
  const shouldShowNoMatches =
    !isPickMode &&
    searchInput.trim().length >= 3 &&
    !parseCoordinateInput(searchInput) &&
    !isSearchingPlaces &&
    placeResults.length === 0;

  useEffect(() => {
    stopsRef.current = stops;
  }, [stops]);

  useEffect(() => {
    waypointStopsRef.current = waypointStops;
  }, [waypointStops]);

  useEffect(() => {
    reorderDragStateRef.current = reorderDragState;
  }, [reorderDragState]);

  useEffect(() => {
    void bootstrapLocation();
  }, [bootstrapLocation]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDraft() {
      const localDraft = await loadRoutePlannerDraft(runId ?? '');
      if (cancelled) {
        return;
      }

      if (localDraft) {
        const nextStops = normalizePlannerStops(localDraft.stops);
        setStops(nextStops);
        setSelectedStopId(resolveSelectedStopId(nextStops, localDraft.selectedStopId));
        applySheetState(localDraft.sheetState);
        setIsRouteSaved(localDraft.isRouteSaved);
        setStatusMessage('Route draft restored.');
      } else if (savedRoute?.stops?.length) {
        const nextStops = normalizePlannerStops(savedRoute.stops);
        setStops(nextStops);
        setSelectedStopId(getDefaultSelectedStopId(nextStops));
        setIsRouteSaved(true);
        setStatusMessage('Saved route restored.');
      }

      setHasHydratedDraft(true);
    }

    void hydrateDraft();

    return () => {
      cancelled = true;
    };
  }, [runId, savedRoute]);

  useEffect(() => {
    if (!runId || !hasHydratedDraft) {
      return;
    }

    void saveRoutePlannerDraft(runId, {
      stops,
      selectedStopId,
      sheetState: currentSheetState,
      isRouteSaved,
    });
  }, [currentSheetState, hasHydratedDraft, isRouteSaved, runId, selectedStopId, stops]);

  useEffect(() => {
    if (!currentLocation || hasAutoCentered.current) {
      return;
    }

    hasAutoCentered.current = true;
    setFocusPoint(currentLocation);
    setMapCenterPoint(currentLocation);
  }, [currentLocation]);

  useEffect(() => {
    if (completeWaypoints.length < 2) {
      setRoutePreview(null);
      return;
    }

    let cancelled = false;
    setIsPreviewing(true);
    setError(null);

    void fetchRoadRouteFromStops(stops)
      .then((route) => {
        if (cancelled) {
          return;
        }
        setRoutePreview(route);
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : 'Unable to preview route.');
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreviewing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [completeWaypoints.length, stops]);

  useEffect(() => {
    const trimmed = searchInput.trim();

    if (!trimmed || isPickMode) {
      setPlaceResults([]);
      setIsSearchingPlaces(false);
      return;
    }

    const parsedCoordinates = parseCoordinateInput(trimmed);
    if (parsedCoordinates) {
      let cancelled = false;
      setPlaceResults([]);
      setIsSearchingPlaces(false);

      const timeout = setTimeout(() => {
        if (cancelled) {
          return;
        }

        void applyPointToSelectedStop(
          [parsedCoordinates.lat, parsedCoordinates.lng],
          'coordinates',
          formatStopCoordinateLabel(parsedCoordinates.lat, parsedCoordinates.lng)
        );
      }, 180);

      return () => {
        cancelled = true;
        clearTimeout(timeout);
      };
    }

    if (trimmed.length < 3) {
      setPlaceResults([]);
      setIsSearchingPlaces(false);
      return;
    }

    let cancelled = false;
    setIsSearchingPlaces(true);

    const timeout = setTimeout(() => {
      void searchPlacesWithProvider(trimmed)
        .then((results) => {
          if (!cancelled) {
            setPlaceResults(results);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPlaceResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsSearchingPlaces(false);
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [isPickMode, searchInput, selectedStopId]);

  function setVisibleSheetState(nextState: VisibleSheetState) {
    previousVisibleSheetStateRef.current = nextState;
    setSheetState(nextState);
  }

  function applySheetState(nextState: RoutePlannerSheetState) {
    const normalizedState =
      nextState === 'hidden'
        ? 'minimized'
        : nextState === 'minimized'
          ? 'minimized'
        : nextState === 'reorder'
          ? 'reorder'
          : 'main';

    previousVisibleSheetStateRef.current =
      normalizedState === 'minimized' ? 'main' : normalizedState;
    setSheetState(normalizedState);
  }

  function restoreVisibleSheet() {
    setSheetState(previousVisibleSheetStateRef.current);
  }

  function minimizeSheet() {
    previousVisibleSheetStateRef.current = sheetState === 'minimized' ? 'main' : sheetState;
    setSheetState('minimized');
  }

  function restoreSheetFromSummary() {
    setSheetState(previousVisibleSheetStateRef.current);
  }

  const focusStop = useCallback((stopId: string, nextStops: RouteStopDraft[] = stopsRef.current) => {
    const stop = nextStops.find((item) => item.id === stopId);
    if (!stop) {
      return;
    }

    setSelectedStopId(stopId);
    setSearchInput('');
    setPlaceResults([]);
    setError(null);

    if (typeof stop.lat === 'number' && typeof stop.lng === 'number') {
      const point: RoutePoint = [stop.lat, stop.lng];
      setFocusPoint(point);
      setMapCenterPoint(point);
    }
  }, []);

  function updateStop(stopId: string, patch: Partial<RouteStopDraft>) {
    const nextStops = stops.map((stop) => (stop.id === stopId ? { ...stop, ...patch } : stop));
    setStops(nextStops);
    setIsRouteSaved(false);
    return nextStops;
  }

  async function describePoint(point: RoutePoint) {
    try {
      const [address] = await Location.reverseGeocodeAsync({
        latitude: point[0],
        longitude: point[1],
      });

      if (address) {
        const parts = [
          address.name,
          address.street,
          address.city,
          address.region,
          address.country,
        ].filter(Boolean);

        if (parts.length > 0) {
          return parts.join(', ');
        }
      }
    } catch {
      return formatStopCoordinateLabel(point[0], point[1]);
    }

    return formatStopCoordinateLabel(point[0], point[1]);
  }

  async function applyPointToSelectedStop(
    point: RoutePoint,
    source: RouteStopDraft['source'],
    label?: string
  ) {
    const activeStop = selectedStop;
    const resolvedLabel = label ?? (await describePoint(point));
    const nextStops = updateStop(activeStop.id, {
      label: resolvedLabel,
      lat: point[0],
      lng: point[1],
      source,
    });

    setSearchInput('');
    setPlaceResults([]);
    setPendingPickedPoint(null);
    setIsPickMode(false);
    setMapCenterPoint(point);
    setFocusPoint(point);

    const nextStage = getRoutePlannerStage(nextStops);

    if (activeStop.kind === 'start' && nextStage === 'destination') {
      setSelectedStopId('destination');
      if (source === 'current_location') {
        minimizeSheet();
      } else {
        setVisibleSheetState('main');
      }
      setStatusMessage('Start locked in. Choose destination.');
      return;
    }

    if (activeStop.kind === 'destination' && nextStage === 'stops') {
      setSelectedStopId('destination');
      setVisibleSheetState('main');
      setStatusMessage('Destination locked in. Add stops or save the route.');
      return;
    }

    restoreVisibleSheet();
    focusStop(activeStop.id, nextStops);
    setStatusMessage(`${getStopTitle(activeStop)} updated.`);
  }

  async function handleSelectPlaceResult(result: PlaceSearchResult) {
    setError(null);
    setStatusMessage(null);
    setIsResolving(true);

    try {
      await applyPointToSelectedStop([result.lat, result.lng], 'search', result.label);
    } finally {
      setIsResolving(false);
    }
  }

  async function handleUseCurrentLocation() {
    let nextCurrentLocation =
      (await refreshLocation()) ?? currentLocation ?? useDeviceLocationStore.getState().currentLocation;

    if (!nextCurrentLocation) {
      setError('Current location is not ready yet.');
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsResolving(true);

    try {
      await applyPointToSelectedStop(nextCurrentLocation, 'current_location', 'Your location');
    } finally {
      setIsResolving(false);
    }
  }

  function handleMapPress(point: RoutePoint) {
    if (!isPickMode) {
      return;
    }

    setPendingPickedPoint(point);
    setFocusPoint(point);
    setMapCenterPoint(point);
    setError(null);
  }

  function handleAddStop() {
    const nextCount = countWaypointStops(stops) + 1;
    const waypoint = createRouteStop('waypoint', {
      label: `Stop ${nextCount}`,
      source: 'coordinates',
    });
    const destinationIndex = stops.findIndex((stop) => stop.kind === 'destination');
    const nextStops = [...stops];
    nextStops.splice(destinationIndex, 0, waypoint);
    setStops(nextStops);
    setIsRouteSaved(false);
    setVisibleSheetState('main');
    setError(null);
    setStatusMessage('Choose a location for the new stop.');
    focusStop(waypoint.id, nextStops);
  }

  const handleRemoveWaypoint = useCallback((stopId: string) => {
    const nextStops = removeWaypointStop(stopsRef.current, stopId);
    setStops(nextStops);
    setIsRouteSaved(false);
    setReorderDragState((currentState) => (currentState?.stopId === stopId ? null : currentState));
    focusStop('destination', nextStops);
    setStatusMessage('Stop removed.');
  }, [focusStop]);

  function handleSwapStartAndDestination() {
    const nextStops = swapStartAndDestinationStops(stops);
    setStops(nextStops);
    setIsRouteSaved(false);
    focusStop(selectedStopId, nextStops);
    setStatusMessage('Start and destination swapped.');
  }

  function handleRecenterOnUser() {
    setError(null);

    void refreshLocation().then((nextLocation) => {
      if (!nextLocation) {
        setError('Current location is not ready yet.');
        return;
      }

      setFocusPoint(nextLocation);
      setMapCenterPoint(nextLocation);
    });
  }

  function handleFitRoute() {
    if (!routePreview?.points.length) {
      setError('Add at least a start and destination before fitting the route.');
      return;
    }

    setError(null);
    setFocusPoint(routePreview.points[0] ?? null);
  }

  function handleEnterReorderMode(stopId?: string) {
    if (!waypointStops.length) {
      setStatusMessage('Add a stop before reordering the drive.');
      return;
    }

    if (stopId) {
      setSelectedStopId(stopId);
    }

    setReorderDragState(null);
    setVisibleSheetState('reorder');
    setStatusMessage('Drag stops to shape the drive.');
  }

  function handleExitReorderMode() {
    setReorderDragState(null);
    setVisibleSheetState('main');
    setStatusMessage('Back to route editing.');
  }

  const handleStartDraggingStop = useCallback((stopId: string, dy = 0) => {
    const currentStops = stopsRef.current;
    const currentWaypointStops = waypointStopsRef.current;
    const stop = currentStops.find((item) => item.id === stopId);
    if (stop?.kind !== 'waypoint') {
      return;
    }

    const waypointIndex = currentWaypointStops.findIndex((item) => item.id === stopId);
    if (waypointIndex < 0) {
      return;
    }

    setSelectedStopId(stopId);
    setReorderDragState({
      stopId,
      initialIndex: waypointIndex,
      targetIndex: waypointIndex,
      dy,
    });
  }, []);

  const handleUpdateDraggedStop = useCallback((dy: number) => {
    setReorderDragState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      const nextTargetIndex = Math.max(
        0,
        Math.min(
          currentState.initialIndex + Math.round(dy / REORDER_ROW_HEIGHT),
          Math.max(waypointStopsRef.current.length - 1, 0)
        )
      );

      return {
        ...currentState,
        dy,
        targetIndex: nextTargetIndex,
      };
    });
  }, []);

  const handleFinishDraggingStop = useCallback(() => {
    const currentDragState = reorderDragStateRef.current;
    const currentStops = stopsRef.current;
    const currentWaypointStops = waypointStopsRef.current;

    if (!currentDragState) {
      return;
    }

    const nextStops =
      currentDragState.targetIndex === currentWaypointStops.length - 1
        ? reorderWaypointStopToEnd(currentStops, currentDragState.stopId)
        : reorderWaypointStopToIndex(
            currentStops,
            currentDragState.stopId,
            currentDragState.targetIndex
          );

    setReorderDragState(null);

    if (nextStops === currentStops) {
      setStatusMessage('Stop order unchanged.');
      return;
    }

    setStops(nextStops);
    setIsRouteSaved(false);
    focusStop(currentDragState.stopId, nextStops);
    setStatusMessage('Stop order updated.');
  }, [focusStop]);

  const handleCancelDraggingStop = useCallback(() => {
    setReorderDragState(null);
    setStatusMessage('Drag cancelled.');
  }, []);

  function handleEnterPickMode() {
    previousVisibleSheetStateRef.current = isMinimizedSheet ? 'main' : sheetState;
    setIsPickMode(true);
    setPendingPickedPoint(null);
    setSearchInput('');
    setPlaceResults([]);
    setError(null);
    setStatusMessage(null);
  }

  async function handleConfirmMapPick() {
    if (!pendingPickedPoint) {
      setError('Tap the map to drop a pin first.');
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsResolving(true);

    try {
      await applyPointToSelectedStop(pendingPickedPoint, 'pin');
    } finally {
      setIsResolving(false);
    }
  }

  function handleCancelMapPick() {
    setIsPickMode(false);
    setPendingPickedPoint(null);
    restoreVisibleSheet();
    setStatusMessage('Map pick cancelled.');
  }

  async function handleSaveRoute() {
    if (!routePreview) {
      setError('Add at least a start and destination before saving.');
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsSaving(true);

    try {
      await saveRouteDraftToRunWithFirebase(runId ?? '', routePreview);
      setRunSnapshot({
        route: routePreview,
        status: 'draft',
      });
      setIsRouteSaved(true);
      setStatusMessage('Route draft saved. You can come back later or start the run when ready.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save route draft.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStartRun() {
    if (!routePreview || !isRouteSaved) {
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsStarting(true);

    try {
      await startRunWithSavedRouteWithFirebase(runId ?? '');
      await clearRoutePlannerDraft(runId ?? '');
      setRunSnapshot({
        route: routePreview,
        status: 'active',
      });
      router.push(`/run/${runId}/map`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to start this run.');
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      testID="screen-route-planning"
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ClubRunMap
          currentLocation={currentLocation ?? mapCenterPoint}
          edgeToEdge
          focusPoint={focusPoint}
          onMapPress={handleMapPress}
          onRegionDidChange={setMapCenterPoint}
          routePoints={routePreview?.points ?? []}
          selectedStopId={selectedStopId}
          showUserLocation
          stops={stops}
          testID="route-planning-map"
        />

        <View
          style={{
            position: 'absolute',
            top: 20,
            left: 20,
            right: 20,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={floatingTopButtonStyle(theme.colors.border)}
            testID="button-back-route-planner"
          >
            <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '700' }}>
              ‹
            </Text>
          </Pressable>

          <View
            style={{
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderWidth: 1,
              borderColor: theme.colors.border,
              minWidth: 178,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>
              Route Draft {joinCode ? `• ${joinCode}` : ''}
            </Text>
            <Text style={{ color: theme.colors.textSecondary, marginTop: 2, fontWeight: '600' }}>
              {routeSaveStateLabel}
            </Text>
          </View>
        </View>

        <View
          style={{
            position: 'absolute',
            right: 20,
            bottom: mapButtonBottom,
            gap: 10,
            alignItems: 'flex-end',
          }}
        >
          {routePreview ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleFitRoute}
              style={floatingMapButtonStyle(theme.colors.border)}
              testID="button-fit-route"
            >
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>□</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={handleRecenterOnUser}
            style={floatingMapButtonStyle(theme.colors.border)}
            testID="button-center-on-user"
          >
            <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>◎</Text>
          </Pressable>
        </View>

        {isPickMode ? (
          <>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: '50%',
                top: '40%',
                marginLeft: -26,
                marginTop: -26,
                width: 52,
                height: 52,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: `${theme.colors.surface}EE`,
                  borderWidth: 2,
                  borderColor: theme.colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: theme.colors.accent,
                  }}
                />
              </View>
            </View>

            <View
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                bottom: 16,
                borderRadius: 24,
                backgroundColor: 'rgba(255,255,255,0.95)',
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 16,
                gap: 12,
                shadowColor: '#000000',
                shadowOpacity: 0.12,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
              }}
            >
              <Text
                style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '800' }}
                testID="text-map-pick-mode"
              >
                {`Choose ${getStopTitle(selectedStop)} On The Map`}
              </Text>
              <Text style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
                Pan around, tap once to drop a pin, and confirm when the location feels right for
                the club route.
              </Text>
              {pendingPickedPoint ? (
                <Text
                  style={{ color: theme.colors.textPrimary, fontWeight: '700' }}
                  testID="text-map-pick-selection"
                >
                  {`Pin ready for ${getStopTitle(selectedStop)}`}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {pendingPickedPoint ? (
                  <AppButton
                    label="Confirm Pin"
                    onPress={handleConfirmMapPick}
                    testID="button-confirm-map-pick"
                  />
                ) : null}
                <AppButton
                  label="Cancel"
                  onPress={handleCancelMapPick}
                  testID="button-cancel-map-pick"
                  variant="secondary"
                />
              </View>
            </View>
          </>
        ) : isMinimizedSheet ? (
          <Pressable
            accessibilityRole="button"
            onPress={restoreSheetFromSummary}
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 16,
              borderRadius: 22,
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 18,
              paddingVertical: 14,
              shadowColor: '#000000',
              shadowOpacity: 0.12,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 10,
            }}
            testID="route-summary-chip"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              {routeStats.map((stat) => (
                <View key={stat.key} style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700' }}>
                    {stat.label}
                  </Text>
                  <Text
                    style={{ color: theme.colors.textPrimary, fontSize: 16, fontWeight: '800' }}
                    testID={
                      stat.key === 'distance'
                        ? 'text-route-summary-distance'
                        : stat.key === 'duration'
                          ? 'text-route-summary-duration'
                          : 'text-route-summary-stops'
                    }
                  >
                    {stat.value}
                  </Text>
                </View>
              ))}
            </View>
          </Pressable>
        ) : isReorderSheet ? (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 16,
              borderRadius: 30,
              backgroundColor: 'rgba(255,255,255,0.97)',
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: 18,
              gap: 14,
              maxHeight: '70%',
              shadowColor: '#000000',
              shadowOpacity: 0.14,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 10 },
              elevation: 12,
            }}
            testID="route-reorder-sheet"
          >
            <Pressable
              accessibilityRole="button"
              onPress={minimizeSheet}
              style={{ gap: 10 }}
              testID="button-minimize-route-sheet"
            >
              <View
                style={{
                  alignSelf: 'center',
                  width: 48,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: theme.colors.border,
                }}
              />
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ gap: 4 }}>
                <Text style={{ color: theme.colors.textPrimary, fontSize: 20, fontWeight: '800' }}>
                  Reorder Stops
                </Text>
                <Text style={{ color: theme.colors.textSecondary }} testID="text-sheet-state">
                  Reorder
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={handleExitReorderMode}
                style={miniActionButtonStyle(theme.colors.border)}
                testID="button-exit-reorder-mode"
              >
                <Text style={{ color: theme.colors.textPrimary, fontSize: 20, fontWeight: '800' }}>
                  ‹
                </Text>
              </Pressable>
            </View>

            <Text style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
              Drag a stop up or down to reshape the drive between the locked start and destination.
            </Text>

            <ScrollView
              scrollEnabled={!reorderDragState}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              {stops.map((stop) => {
                const waypointIndex = waypointStops.findIndex((item) => item.id === stop.id);
                const isWaypoint = stop.kind === 'waypoint';
                const isDragging = reorderDragState?.stopId === stop.id;
                const isDragTarget =
                  isWaypoint &&
                  !isDragging &&
                  typeof waypointIndex === 'number' &&
                  waypointIndex >= 0 &&
                  reorderDragState?.targetIndex === waypointIndex;

                return (
                  <ReorderStopRow
                    key={stop.id}
                    colors={theme.colors}
                    dragOffset={isDragging ? reorderDragState?.dy ?? 0 : 0}
                    isDragTarget={isDragTarget}
                    isDragging={isDragging}
                    onCancelDrag={handleCancelDraggingStop}
                    onFinishDrag={handleFinishDraggingStop}
                    onRemoveWaypoint={handleRemoveWaypoint}
                    onStartDrag={handleStartDraggingStop}
                    onUpdateDrag={handleUpdateDraggedStop}
                    stop={stop}
                    waypointIndex={waypointIndex}
                  />
                );
              })}
            </ScrollView>

            {reorderDragState ? (
              <Text style={{ color: theme.colors.textSecondary }}>
                Release to place the stop in its new slot.
              </Text>
            ) : null}
          </View>
        ) : (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 16,
              borderRadius: 30,
              backgroundColor: 'rgba(255,255,255,0.97)',
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: 18,
              gap: 14,
              maxHeight: '72%',
              shadowColor: '#000000',
              shadowOpacity: 0.14,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 10 },
              elevation: 12,
            }}
            testID="route-planner-sheet"
          >
            <Pressable
              accessibilityRole="button"
              onPress={minimizeSheet}
              style={{ gap: 10 }}
              testID="button-minimize-route-sheet"
            >
              <View
                style={{
                  alignSelf: 'center',
                  width: 48,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: theme.colors.border,
                }}
              />
            </Pressable>

            <View style={{ gap: 4 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ color: theme.colors.textPrimary, fontSize: 20, fontWeight: '800' }}>
                  {routeDistance ?? 'Route Builder'}
                </Text>
                <Text
                  style={{ color: theme.colors.textSecondary, fontWeight: '700' }}
                  testID="text-sheet-state"
                >
                  Main
                </Text>
              </View>
              <Text
                style={{ color: theme.colors.textSecondary, fontWeight: '600' }}
                testID="text-guided-step"
              >
                {sheetPrompt}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {routeStats.map((stat) => (
                <View
                  key={stat.key}
                  style={{
                    flex: 1,
                    borderRadius: 18,
                    padding: 12,
                    backgroundColor: theme.colors.surfaceElevated,
                    gap: 4,
                  }}
                >
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700' }}>
                    {stat.label}
                  </Text>
                  <Text
                    style={{ color: theme.colors.textPrimary, fontSize: 17, fontWeight: '800' }}
                    testID={
                      stat.key === 'distance'
                        ? 'text-route-distance'
                        : stat.key === 'duration'
                          ? 'text-route-duration'
                          : 'text-route-stop-count'
                    }
                  >
                    {stat.value}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={{ color: theme.colors.textSecondary }} testID="text-route-save-state">
              {routeSaveStateLabel}
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              {plannerStage === 'stops' ? (
                <AppButton
                  label="+ Add Stop"
                  onPress={handleAddStop}
                  testID="button-add-stop"
                  variant="secondary"
                />
              ) : (
                <View />
              )}
              <AppButton
                label="Swap"
                onPress={handleSwapStartAndDestination}
                testID="button-swap-start-destination"
                variant="ghost"
              />
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 210 }}
              contentContainerStyle={{ gap: 8 }}
            >
              {stops.map((stop) => {
                const waypointIndex = waypointStops.findIndex((item) => item.id === stop.id) + 1;
                const isWaypoint = stop.kind === 'waypoint';
                const rowTestId =
                  stop.kind === 'waypoint'
                    ? `route-stop-row-waypoint-${waypointIndex}`
                    : `route-stop-row-${stop.kind}`;

                return (
                  <Pressable
                    key={stop.id}
                    accessibilityRole="button"
                    onPress={() => focusStop(stop.id)}
                    style={{
                      borderRadius: 18,
                      padding: 14,
                      backgroundColor:
                        selectedStopId === stop.id
                          ? theme.colors.accentMuted
                          : theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                    testID={rowTestId}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{
                          color: theme.colors.textSecondary,
                          fontSize: 12,
                          fontWeight: '700',
                        }}
                      >
                        {stop.kind === 'start'
                          ? 'START'
                          : stop.kind === 'destination'
                            ? 'DESTINATION'
                            : `STOP ${waypointIndex}`}
                      </Text>
                      <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>
                        {stop.label}
                      </Text>
                      <Text style={{ color: theme.colors.textSecondary }} numberOfLines={1}>
                        {typeof stop.lat === 'number' && typeof stop.lng === 'number'
                          ? formatStopCoordinateLabel(stop.lat, stop.lng)
                          : 'Search, use current location, or pick on map'}
                      </Text>
                    </View>

                    {isWaypoint ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => handleRemoveWaypoint(stop.id)}
                          style={miniActionButtonStyle(theme.colors.border)}
                          testID={`button-remove-waypoint-${waypointIndex}`}
                        >
                          <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>
                            ×
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => handleEnterReorderMode(stop.id)}
                          style={miniActionButtonStyle(theme.colors.border)}
                          testID={`drag-handle-waypoint-${waypointIndex}`}
                        >
                          <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>
                            ≡
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ gap: 8 }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 12,
                  fontWeight: '700',
                  letterSpacing: 0.5,
                }}
              >
                ACTIVE STOP
              </Text>
              <Text
                style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '800' }}
                testID="text-selected-stop-label"
              >
                {getStopTitle(selectedStop)}
              </Text>
            </View>

            <AppTextInput
              label={`Search ${getStopTitle(selectedStop)}`}
              onChangeText={(text) => {
                setError(null);
                setStatusMessage(null);
                setSearchInput(text);
              }}
              placeholder="Search address or paste -26.2041, 28.0473"
              testID="input-stop-search"
              value={searchInput}
            />

            {isSearchingPlaces ? (
              <Text style={{ color: theme.colors.textSecondary }}>Searching places...</Text>
            ) : null}

            {placeResults.length > 0 ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 152 }}
                contentContainerStyle={{ gap: 8 }}
              >
                {placeResults.map((result) => (
                  <Pressable
                    key={result.id}
                    accessibilityRole="button"
                    onPress={() => {
                      void handleSelectPlaceResult(result);
                    }}
                    style={{
                      borderRadius: 16,
                      padding: 14,
                      backgroundColor: theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                    testID={`place-result-${result.id}`}
                  >
                    <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
                      {result.label}
                    </Text>
                    <Text style={{ color: theme.colors.textSecondary, marginTop: 4 }}>
                      {formatStopCoordinateLabel(result.lat, result.lng)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {shouldShowNoMatches ? (
              <Text style={{ color: theme.colors.textSecondary }}>
                No search matches yet. You can still use current location, paste coordinates, or
                pick on the map.
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <AppButton
                label="Use Current"
                onPress={handleUseCurrentLocation}
                testID="button-use-current-location"
                variant="secondary"
              />
              <AppButton
                label="Pick On Map"
                onPress={handleEnterPickMode}
                testID="button-enter-pick-mode"
                variant="secondary"
              />
              {plannerStage === 'stops' ? (
                <AppButton
                  label="Reorder"
                  onPress={() => handleEnterReorderMode()}
                  testID="button-enter-reorder-mode"
                  variant="ghost"
                />
              ) : null}
            </View>

            {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
            {statusMessage ? (
              <Text style={{ color: theme.colors.success }}>{statusMessage}</Text>
            ) : null}
            {isResolving || isPreviewing || isSaving || isStarting ? <LoadingSpinner /> : null}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <AppButton
                disabled={!routePreview}
                label="Save Route"
                onPress={handleSaveRoute}
                testID="button-save-route"
              />
              <AppButton
                disabled={!routePreview || !isRouteSaved}
                label="Start Run"
                onPress={handleStartRun}
                testID="button-start-run"
                variant="secondary"
              />
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

type ReorderStopRowProps = {
  colors: ThemeColors;
  dragOffset: number;
  isDragTarget: boolean;
  isDragging: boolean;
  onCancelDrag: () => void;
  onFinishDrag: () => void;
  onRemoveWaypoint: (stopId: string) => void;
  onStartDrag: (stopId: string, dy?: number) => void;
  onUpdateDrag: (dy: number) => void;
  stop: RouteStopDraft;
  waypointIndex: number;
};

function ReorderStopRow({
  colors,
  dragOffset,
  isDragTarget,
  isDragging,
  onCancelDrag,
  onFinishDrag,
  onRemoveWaypoint,
  onStartDrag,
  onUpdateDrag,
  stop,
  waypointIndex,
}: ReorderStopRowProps) {
  const isWaypoint = stop.kind === 'waypoint';
  const panResponder = useMemo(
    () =>
      isWaypoint
        ? PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onPanResponderGrant: () => onStartDrag(stop.id),
            onPanResponderMove: (_event, gestureState) => onUpdateDrag(gestureState.dy),
            onPanResponderRelease: () => onFinishDrag(),
            onPanResponderTerminate: () => onCancelDrag(),
            onPanResponderTerminationRequest: () => false,
            onShouldBlockNativeResponder: () => true,
          })
        : null,
    [isWaypoint, onCancelDrag, onFinishDrag, onStartDrag, onUpdateDrag, stop.id]
  );

  return (
    <View
      style={[
        {
          minHeight: REORDER_ROW_HEIGHT,
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: isDragging
            ? colors.accentMuted
            : isDragTarget
              ? `${colors.accentMuted}DD`
              : colors.surfaceElevated,
          borderWidth: 1,
          borderColor: isDragging || isDragTarget ? colors.accent : colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          zIndex: isDragging ? 2 : 0,
          elevation: isDragging ? 6 : 0,
        },
        isDragging ? { transform: [{ translateY: dragOffset }] } : null,
      ]}
      testID={
        isWaypoint
          ? `route-reorder-row-waypoint-${waypointIndex + 1}`
          : `route-reorder-row-${stop.kind}`
      }
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
        }}
      >
        <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>
          {stop.kind === 'start'
            ? 'S'
            : stop.kind === 'destination'
              ? 'E'
              : waypointIndex + 1}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{stop.label}</Text>
        <Text style={{ color: colors.textSecondary }} numberOfLines={1}>
          {typeof stop.lat === 'number' && typeof stop.lng === 'number'
            ? formatStopCoordinateLabel(stop.lat, stop.lng)
            : 'Location still needed'}
        </Text>
      </View>

      {isWaypoint ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onRemoveWaypoint(stop.id)}
            style={miniActionButtonStyle(colors.border)}
            testID={`button-remove-waypoint-reorder-${waypointIndex + 1}`}
          >
            <MaterialIcons color={colors.textPrimary} name="delete-outline" size={20} />
          </Pressable>
          <View
            {...(panResponder?.panHandlers ?? {})}
            style={miniActionButtonStyle(colors.border)}
            testID={`reorder-handle-waypoint-${waypointIndex + 1}`}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>≡</Text>
          </View>
        </View>
      ) : (
        <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Locked</Text>
      )}
    </View>
  );
}

function createInitialPlannerStops() {
  return [
    createRouteStop('start', { id: 'start', label: 'Start', source: 'current_location' }),
    createRouteStop('destination', {
      id: 'destination',
      label: 'Destination',
      source: 'coordinates',
    }),
  ];
}

function normalizePlannerStops(stops?: RouteStopDraft[]) {
  if (!stops?.length) {
    return createInitialPlannerStops();
  }

  const start =
    stops.find((stop) => stop.kind === 'start') ??
    createRouteStop('start', { id: 'start', label: 'Start', source: 'current_location' });
  const destination =
    stops.find((stop) => stop.kind === 'destination') ??
    createRouteStop('destination', {
      id: 'destination',
      label: 'Destination',
      source: 'coordinates',
    });

  return [
    { ...start, id: start.id || 'start' },
    ...stops.filter((stop) => stop.kind === 'waypoint').map((stop) => ({ ...stop })),
    { ...destination, id: destination.id || 'destination' },
  ];
}

function resolveSelectedStopId(stops: RouteStopDraft[], selectedStopId?: string) {
  if (selectedStopId && stops.some((stop) => stop.id === selectedStopId)) {
    return selectedStopId;
  }

  return getDefaultSelectedStopId(stops);
}

function getDefaultSelectedStopId(stops: RouteStopDraft[]) {
  const plannerStage = getRoutePlannerStage(stops);
  if (plannerStage === 'start') {
    return 'start';
  }

  if (plannerStage === 'destination') {
    return 'destination';
  }

  return stops.find((stop) => stop.kind === 'waypoint')?.id ?? 'destination';
}

function getStopTitle(stop: RouteStopDraft) {
  return stop.kind === 'waypoint' ? stop.label : stop.kind === 'start' ? 'Start' : 'Destination';
}

function formatRouteDuration(durationSeconds?: number) {
  if (!durationSeconds || durationSeconds <= 0) {
    return 'Duration unavailable';
  }

  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours} hr ${minutes} min`;
}

function floatingMapButtonStyle(borderColor: string) {
  return {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  };
}

function floatingTopButtonStyle(borderColor: string) {
  return {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  };
}

function miniActionButtonStyle(borderColor: string) {
  return {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
}
