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
import { LiveDriver, subscribeToDriversWithFirebase } from '@/lib/driverRealtime';
import { RoutePoint } from '@/lib/geo';
import { PlaceSearchResult, searchPlacesWithProvider } from '@/lib/placeSearchService';
import { updateAdminRunStatusInHistory } from '@/lib/adminRunHistory';
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
const SHEET_MINIMIZE_DRAG_THRESHOLD = 28;

type VisibleSheetState = Exclude<RoutePlannerSheetState, 'hidden'>;
type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];
type DriveComposerMode = 'summary' | 'reorder';
type ReorderDragState = {
  stopId: string;
  initialIndex: number;
  targetIndex: number;
  dy: number;
};

export default function RoutePlanningScreen() {
  const router = useRouter();
  const { runId } = useLocalSearchParams<{ runId?: string }>();
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
  const [driveComposerMode, setDriveComposerMode] = useState<DriveComposerMode>('summary');
  const [drivers, setDrivers] = useState<LiveDriver[]>([]);
  const hasAutoCentered = useRef(false);
  const previousVisibleSheetStateRef = useRef<VisibleSheetState>('main');
  const mainSheetScrollRef = useRef<ScrollView | null>(null);
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
    ? 'Saved'
    : hasMeaningfulDraft
      ? 'Unsaved changes'
      : 'Draft in progress';
  const driversJoinedCount = drivers.length;
  const driversReadyCount = drivers.filter((driver) => driver.location).length;
  const driverReadinessLabel = `${driversReadyCount}/${driversJoinedCount} ready`;
  const lobbyActionLabel = routePreview
    ? isRouteSaved
      ? 'Open Lobby'
      : 'Save + Open Lobby'
    : 'Open Lobby';
  const sheetPrompt =
    plannerStage === 'start'
      ? 'Choose start'
      : plannerStage === 'destination'
        ? 'Choose destination'
        : 'Add stops or save route';
  const currentSheetState: RoutePlannerSheetState = isPickMode ? 'hidden' : sheetState;
  const isMainSheet = sheetState === 'main';
  const isMinimizedSheet = sheetState === 'minimized';
  const hasRoutePreview = Boolean(routePreview);
  const isSelectedStopComplete = isRouteStopComplete(selectedStop);
  const isWaypointPlacementMode = selectedStop.kind === 'waypoint' && !isSelectedStopComplete;
  const isDriveComposerReorderMode = driveComposerMode === 'reorder';
  const shouldShowPlacementActions = !isDriveComposerReorderMode;
  const shouldShowPersistentLobbyCard = isMinimizedSheet && hasRoutePreview;
  const stageTitle = getPlannerStageTitle(plannerStage, selectedStop, isWaypointPlacementMode);
  const stageSubtitle = getPlannerStageSubtitle(
    plannerStage,
    selectedStop,
    isSelectedStopComplete,
    isWaypointPlacementMode
  );
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
    if (!runId) {
      setDrivers([]);
      return;
    }

    return subscribeToDriversWithFirebase(
      runId,
      (nextDrivers) => {
        setDrivers(nextDrivers);
      },
      (nextError) => {
        setError(nextError.message);
      }
    );
  }, [runId]);

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
          ? 'main'
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

  const sheetHandlePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dy) > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          Math.abs(gestureState.dy) > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dy > SHEET_MINIMIZE_DRAG_THRESHOLD) {
            minimizeSheet();
          }
        },
      }),
    [sheetState]
  );

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
    setDriveComposerMode('summary');
    setVisibleSheetState('main');
    setError(null);
    setStatusMessage('Choose a location for the new stop.');
    focusStop(waypoint.id, nextStops);
    setTimeout(() => {
      mainSheetScrollRef.current?.scrollTo({ y: 420, animated: true });
    }, 0);
  }

  const handleRemoveWaypoint = useCallback((stopId: string) => {
    const nextStops = removeWaypointStop(stopsRef.current, stopId);
    setStops(nextStops);
    setIsRouteSaved(false);
    setDriveComposerMode(nextStops.some((stop) => stop.kind === 'waypoint') ? 'reorder' : 'summary');
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
    setDriveComposerMode('reorder');
    setStatusMessage('Drag stops to shape the drive.');
  }

  function handleExitReorderMode() {
    setReorderDragState(null);
    setDriveComposerMode('summary');
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

  async function saveCurrentRouteDraft(nextRoute: RouteData) {
    await saveRouteDraftToRunWithFirebase(runId ?? '', nextRoute);
    setRunSnapshot({
      route: nextRoute,
      status: 'draft',
    });
    setIsRouteSaved(true);
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
      await saveCurrentRouteDraft(routePreview);
      setStatusMessage('Route saved. You can return later or open the lobby when you are ready.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save route draft.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleOpenLobby() {
    if (!routePreview || !isRouteSaved) {
      if (!routePreview) {
        return;
      }
    }

    setError(null);
    setStatusMessage(null);
    setIsStarting(true);

    try {
      if (!isRouteSaved) {
        await saveCurrentRouteDraft(routePreview);
      }

      await startRunWithSavedRouteWithFirebase(runId ?? '');
      await clearRoutePlannerDraft(runId ?? '');
      void updateAdminRunStatusInHistory(runId ?? '', 'ready');
      setRunSnapshot({
        route: routePreview,
        status: 'ready',
      });
      router.push(`/run/${runId}/map`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to open the lobby.');
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
            top: 18,
            left: 18,
            right: 18,
            gap: 14,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={floatingTopButtonStyle(theme.colors.border, theme.colors.surface)}
              testID="button-back-route-planner"
            >
              <MaterialIcons name="arrow-back" size={24} color={theme.colors.textPrimary} />
            </Pressable>

            <Text
              style={{
                flex: 1,
                color: theme.colors.textPrimary,
                fontSize: 26,
                fontWeight: '900',
                fontStyle: 'italic',
                letterSpacing: -0.9,
                textTransform: 'uppercase',
                textAlign: 'center',
              }}
            >
              ClubRun
            </Text>

            <View style={floatingTopButtonStyle(theme.colors.border, theme.colors.surface)}>
              <MaterialIcons name="wifi-tethering" size={22} color={theme.colors.accent} />
            </View>
          </View>

          {shouldShowPersistentLobbyCard ? (
            <View
              style={{
                borderRadius: 28,
                padding: 16,
                backgroundColor: `${theme.colors.panel}F2`,
                borderWidth: 1,
                borderColor: theme.colors.border,
                gap: 14,
                shadowColor: '#000000',
                shadowOpacity: 0.22,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 10 },
                elevation: 8,
              }}
              testID="route-planner-stats-card"
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      color: theme.colors.accent,
                      fontSize: 12,
                      fontWeight: '800',
                      letterSpacing: 1.8,
                      textTransform: 'uppercase',
                    }}
                  >
                    Open Lobby
                  </Text>
                  <Text
                    style={{ color: theme.colors.textPrimary, fontSize: 28, fontWeight: '900' }}
                    testID="text-driver-ready-count"
                  >
                    {driverReadinessLabel}
                  </Text>
                </View>
                <View
                  style={{
                    minWidth: 120,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 18,
                    backgroundColor: theme.colors.background,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.textPrimary,
                      fontSize: 12,
                      fontWeight: '800',
                      letterSpacing: 1.4,
                      textTransform: 'uppercase',
                      textAlign: 'center',
                    }}
                    testID="text-route-save-state"
                  >
                    {routeSaveStateLabel}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                }}
              >
                {routeStats.map((stat) => (
                  <View
                    key={stat.key}
                    style={{
                      flex: 1,
                      borderRadius: 20,
                      backgroundColor: theme.colors.surface,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.textSecondary,
                        fontSize: 10,
                        fontWeight: '800',
                        letterSpacing: 1.4,
                        textTransform: 'uppercase',
                      }}
                    >
                      {stat.label}
                    </Text>
                    <Text
                      style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '800' }}
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

              <AppButton
                disabled={!routePreview || isResolving || isPreviewing || isSaving || isStarting}
                label={isStarting ? 'Opening Lobby…' : lobbyActionLabel}
                onPress={handleOpenLobby}
                testID="button-open-lobby"
              />
            </View>
          ) : null}
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
            style={floatingMapButtonStyle(theme.colors.border, theme.colors.surface)}
            testID="button-fit-route"
          >
            <MaterialIcons name="layers" size={24} color={theme.colors.textPrimary} />
          </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={handleRecenterOnUser}
            style={floatingMapButtonStyle(theme.colors.border, theme.colors.surface)}
            testID="button-center-on-user"
          >
            <MaterialIcons name="my-location" size={22} color={theme.colors.textPrimary} />
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
                borderRadius: 28,
                backgroundColor: `${theme.colors.panel}F5`,
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 18,
                gap: 14,
                shadowColor: '#000000',
                shadowOpacity: 0.22,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 10 },
                elevation: 10,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textPrimary,
                  fontSize: 28,
                  fontWeight: '900',
                  fontStyle: 'italic',
                  textTransform: 'uppercase',
                }}
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
              borderRadius: 26,
              backgroundColor: `${theme.colors.panel}F2`,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 18,
              paddingVertical: 14,
              shadowColor: '#000000',
              shadowOpacity: 0.2,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
              elevation: 8,
            }}
            testID="route-summary-chip"
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              {routeStats.map((stat) => (
                <View key={stat.key} style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700' }}>
                    {stat.label}
                  </Text>
                  <Text
                    style={{ color: theme.colors.textPrimary, fontSize: 15, fontWeight: '800' }}
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
        ) : (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 16,
              borderRadius: 34,
              backgroundColor: `${theme.colors.backgroundAlt}F2`,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 18,
              gap: 16,
              maxHeight: isDriveComposerReorderMode ? '78%' : '66%',
              shadowColor: '#000000',
              shadowOpacity: 0.24,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 14 },
              elevation: 12,
            }}
            testID="route-planner-sheet"
          >
            <Pressable
              accessibilityRole="button"
              onPress={minimizeSheet}
              hitSlop={12}
              style={{ paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}
              testID="button-minimize-route-sheet"
              {...sheetHandlePanResponder.panHandlers}
            >
              <View
                style={{
                  width: 48,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: theme.colors.border,
                }}
              />
            </Pressable>
            <ScrollView
              ref={mainSheetScrollRef}
              scrollEnabled={!reorderDragState}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                gap: 16,
                paddingTop: 6,
                flexGrow: isDriveComposerReorderMode ? 1 : 0,
              }}
            >
            <View style={{ gap: 12 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: 12,
                      fontWeight: '800',
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                    }}
                  >
                    Route plan
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: 14,
                      fontWeight: '800',
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                    }}
                    testID="text-selected-stop-label"
                  >
                    {getStopTitle(selectedStop)}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textPrimary,
                      fontSize: 34,
                      fontWeight: '900',
                      fontStyle: 'italic',
                      letterSpacing: -1,
                      textTransform: 'uppercase',
                    }}
                    testID="text-stage-title"
                  >
                    {stageTitle}
                  </Text>
                  <Text
                    style={{ color: theme.colors.textSecondary, fontSize: 17, lineHeight: 24, fontWeight: '600' }}
                    testID="text-guided-step"
                  >
                    {sheetPrompt}
                  </Text>
                  <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
                    {stageSubtitle}
                  </Text>
                </View>
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    fontSize: 13,
                    fontWeight: '700',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: theme.colors.surface,
                  }}
                  testID="text-sheet-state"
                >
                  Main
                </Text>
              </View>

            </View>

            {error ? (
              <PlannerNotice tone="danger">{error}</PlannerNotice>
            ) : null}
            {statusMessage ? (
              <PlannerNotice tone="success">{statusMessage}</PlannerNotice>
            ) : null}
            {isResolving || isPreviewing || isSaving || isStarting ? <LoadingSpinner /> : null}

            {hasRoutePreview ? (
              <View
                style={{
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  {routeStats.map((stat, index) => (
                    <View
                      key={stat.key}
                      style={{
                        flex: 1,
                        gap: 3,
                        paddingLeft: index === 0 ? 0 : 12,
                        borderLeftWidth: index === 0 ? 0 : 1,
                        borderLeftColor: index === 0 ? 'transparent' : theme.colors.border,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.textSecondary,
                          fontSize: 11,
                          fontWeight: '800',
                          letterSpacing: 1.1,
                          textTransform: 'uppercase',
                        }}
                      >
                        {stat.label}
                      </Text>
                      <Text
                        style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '800' }}
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
                <View
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: theme.colors.surfaceElevated,
                  }}
                >
                  <Text
                    style={{ color: theme.colors.textSecondary, fontWeight: '700' }}
                    testID="text-route-save-state"
                  >
                    {routeSaveStateLabel}
                  </Text>
                </View>
              </View>
            ) : null}

            {shouldShowPlacementActions && !isDriveComposerReorderMode ? (
              <View style={{ gap: 12 }}>
                <View
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    padding: 16,
                    gap: 14,
                  }}
                  testID="planner-action-search"
                >
                  <PlannerActionHeader
                    icon="search"
                    title="Search"
                    subtitle={getSearchActionSubtitle(selectedStop, isWaypointPlacementMode)}
                  />

                  <AppTextInput
                    autoFocus={isWaypointPlacementMode}
                    label={
                      isWaypointPlacementMode
                        ? `Set ${getStopTitle(selectedStop)}`
                        : `Search ${getStopTitle(selectedStop)}`
                    }
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
                      No search matches yet. You can still paste coordinates or pick on the map.
                    </Text>
                  ) : null}
                </View>

                {selectedStop.kind === 'start' ? (
                  <View testID="planner-action-current">
                    <PlannerActionButton
                      icon="near-me"
                      onPress={handleUseCurrentLocation}
                      subtitle="Auto-detect your current GPS location."
                      testID="button-use-current-location"
                      title="Use Current"
                    />
                  </View>
                ) : null}

                <View testID="planner-action-pick">
                  <PlannerActionButton
                    icon="map"
                    onPress={handleEnterPickMode}
                    subtitle={
                      isWaypointPlacementMode
                        ? `Drop ${getStopTitle(selectedStop)} manually on the terrain.`
                        : 'Drop a pin manually on the terrain.'
                    }
                    testID="button-enter-pick-mode"
                    title={isWaypointPlacementMode ? `Place ${getStopTitle(selectedStop)} On Map` : 'Pick On Map'}
                  />
                </View>
              </View>
            ) : null}

            {plannerStage === 'stops' || waypointStops.length > 0 ? (
              <View
                style={{
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  padding: 16,
                  gap: 12,
                  flex: isDriveComposerReorderMode ? 1 : undefined,
                  minHeight: isDriveComposerReorderMode ? 420 : undefined,
                }}
                testID="route-flow-composer"
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: theme.colors.textPrimary, fontSize: 17, fontWeight: '800' }}>
                      Shape the drive
                    </Text>
                    <Text style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
                      {isDriveComposerReorderMode
                        ? 'Long press and drag stops to move them through the drive.'
                        : 'Add a waypoint into the route flow, then fine-tune it below.'}
                    </Text>
                  </View>
                  {waypointStops.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={
                        isDriveComposerReorderMode ? handleExitReorderMode : () => handleEnterReorderMode()
                      }
                      style={{
                        borderRadius: 14,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: theme.colors.surfaceElevated,
                      }}
                      testID={
                        isDriveComposerReorderMode
                          ? 'button-exit-drive-reorder-mode'
                          : 'button-enter-drive-reorder-mode'
                      }
                    >
                      <Text style={{ color: theme.colors.textSecondary, fontWeight: '700' }}>
                        {isDriveComposerReorderMode ? 'Done' : 'Reorder'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {isDriveComposerReorderMode ? (
                  <>
                    <ScrollView
                      scrollEnabled={!reorderDragState}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ gap: 10, paddingBottom: 8 }}
                      style={isDriveComposerReorderMode ? { flex: 1 } : { maxHeight: 288 }}
                      testID="route-flow-reorder-list"
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
                  </>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ alignItems: 'center', gap: 10, paddingRight: 8 }}
                  >
                    {stops.map((stop, index) => {
                      const waypointIndex =
                        stop.kind === 'waypoint'
                          ? waypointStops.findIndex((item) => item.id === stop.id) + 1
                          : -1;
                      const flowTestId =
                        stop.kind === 'waypoint'
                          ? `route-flow-stop-waypoint-${waypointIndex}`
                          : `route-flow-stop-${stop.kind}`;
                      const flowLabel =
                        stop.kind === 'start'
                          ? 'Start'
                          : stop.kind === 'destination'
                            ? 'Destination'
                            : `Stop ${waypointIndex}`;
                      const isSelected = selectedStopId === stop.id;

                      return (
                        <View
                          key={`flow-${stop.id}`}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                        >
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => focusStop(stop.id)}
                            style={{
                              borderRadius: 18,
                              paddingHorizontal: 14,
                              paddingVertical: 12,
                              borderWidth: 1,
                              borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                              backgroundColor: isSelected
                                ? theme.colors.accentMuted
                                : theme.colors.surfaceElevated,
                              minWidth: 98,
                              gap: 2,
                            }}
                            testID={flowTestId}
                          >
                            <Text
                              style={{ color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700' }}
                            >
                              {stop.kind === 'start'
                                ? 'START'
                                : stop.kind === 'destination'
                                  ? 'FINISH'
                                  : `STOP ${waypointIndex}`}
                            </Text>
                            <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>
                              {flowLabel}
                            </Text>
                          </Pressable>

                          {index < stops.length - 1 ? (
                            <>
                              <Text style={{ color: theme.colors.textSecondary, fontSize: 18 }}>→</Text>
                              {stops[index + 1]?.kind === 'destination' ? (
                                <>
                                  <Pressable
                                    accessibilityRole="button"
                                    onPress={handleAddStop}
                                    style={{
                                      borderRadius: 18,
                                      paddingHorizontal: 14,
                                      paddingVertical: 12,
                                      borderWidth: 1,
                                      borderColor: theme.colors.border,
                                      borderStyle: 'dashed',
                                      backgroundColor: theme.colors.surface,
                                      minWidth: 110,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                    testID="button-add-stop-inline"
                                  >
                                    <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
                                      + Add Stop
                                    </Text>
                                  </Pressable>
                                  <Text style={{ color: theme.colors.textSecondary, fontSize: 18 }}>→</Text>
                                </>
                              ) : null}
                              {stops[index + 1]?.kind !== 'destination' ? (
                                <Text style={{ color: theme.colors.textSecondary, fontSize: 18 }}>→</Text>
                              ) : null}
                            </>
                          ) : null}
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            ) : null}

            {!isDriveComposerReorderMode && (
              plannerStage === 'stops' && (
                <View
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    padding: 16,
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1, gap: 6 }}>
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
                      <Text style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
                        {selectedStop.kind === 'destination'
                          ? 'Choose where the drive finishes.'
                          : isWaypointPlacementMode
                            ? 'Search for a place or drop this stop directly on the map.'
                            : 'Dial in this stop or remove it from the route.'}
                      </Text>
                      {isWaypointPlacementMode ? (
                        <Text
                          style={{ color: theme.colors.textSecondary, fontWeight: '600', lineHeight: 20 }}
                          testID="text-waypoint-placement-helper"
                        >
                          Search for a place or drop this stop directly on the map.
                        </Text>
                      ) : null}
                    </View>
                    {(selectedStop.kind === 'start' || selectedStop.kind === 'destination') ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleSwapStartAndDestination}
                        style={{
                          borderRadius: 14,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                        testID="button-swap-start-destination"
                      >
                        <Text style={{ color: theme.colors.textSecondary, fontWeight: '700' }}>
                          Swap
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )
            )}

            {!isDriveComposerReorderMode ? (
              routePreview ? (
                <View
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    padding: 16,
                    gap: 12,
                  }}
                >
                  <Text style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
                    Save the route if you want to come back later. The lobby action stays pinned at
                    the sheet while you are editing, and the minimized map view keeps it one tap away.
                  </Text>
                  <View style={{ gap: 10 }}>
                    <AppButton
                      disabled={!routePreview}
                      label="Save Route"
                      onPress={handleSaveRoute}
                      testID="button-save-route"
                    />
                    <AppButton
                      disabled={!routePreview || isResolving || isPreviewing || isSaving || isStarting}
                      label={isStarting ? 'Opening Lobby…' : lobbyActionLabel}
                      onPress={handleOpenLobby}
                      testID="button-open-lobby"
                      variant="secondary"
                    />
                  </View>
                </View>
              ) : (
                <Text style={{ color: theme.colors.textSecondary, lineHeight: 20 }}>
                  Choose a start and destination to unlock the live route preview and save actions.
                </Text>
              )
            ) : null}
            </ScrollView>
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

function getPlannerStageTitle(
  plannerStage: ReturnType<typeof getRoutePlannerStage>,
  selectedStop: RouteStopDraft,
  isWaypointPlacementMode: boolean
) {
  if (plannerStage === 'start') {
    return 'Choose Start';
  }

  if (plannerStage === 'destination') {
    return 'Choose Destination';
  }

  if (isWaypointPlacementMode) {
    return `Place ${getStopTitle(selectedStop)}`;
  }

  return 'Shape the Drive';
}

function getPlannerStageSubtitle(
  plannerStage: ReturnType<typeof getRoutePlannerStage>,
  selectedStop: RouteStopDraft,
  isSelectedStopComplete: boolean,
  isWaypointPlacementMode: boolean
) {
  if (plannerStage === 'start') {
    return 'Select your departure point to lock in where the convoy begins.';
  }

  if (plannerStage === 'destination') {
    return 'Search for the finish, or drop a pin directly on the map.';
  }

  if (isWaypointPlacementMode) {
    return 'Search, drop a pin, or tune this stop before adding more to the route.';
  }

  if (selectedStop.kind === 'destination' && isSelectedStopComplete) {
    return 'Refine the finish point, then add stops, save the route, or open the lobby.';
  }

  return 'Add, reorder, or fine-tune stops before opening the lobby.';
}

function getSearchActionSubtitle(selectedStop: RouteStopDraft, isWaypointPlacementMode: boolean) {
  if (selectedStop.kind === 'start') {
    return 'Enter location or point of interest.';
  }

  if (selectedStop.kind === 'destination') {
    return 'Enter the place where the route should finish.';
  }

  if (isWaypointPlacementMode) {
    return `Enter the location for ${getStopTitle(selectedStop).toLowerCase()}.`;
  }

  return 'Search for a place and apply it to this stop.';
}

function PlannerActionHeader({
  icon,
  subtitle,
  title,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  subtitle: string;
  title: string;
}) {
  const { theme } = useAppTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 20,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialIcons name={icon} size={24} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 22,
            fontWeight: '900',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            lineHeight: 18,
          }}
        >
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function PlannerActionButton({
  icon,
  onPress,
  subtitle,
  testID,
  title,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  subtitle: string;
  testID: string;
  title: string;
}) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 26,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfaceElevated : theme.colors.panel,
        padding: 18,
      })}
      testID={testID}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialIcons name={icon} size={24} color={theme.colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.colors.textPrimary, fontSize: 22, fontWeight: '900' }}>
            {title}
          </Text>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              lineHeight: 18,
            }}
          >
            {subtitle}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={theme.colors.textSecondary} />
      </View>
    </Pressable>
  );
}

function PlannerNotice({
  children,
  tone,
}: {
  children: string;
  tone: 'danger' | 'success';
}) {
  const { theme } = useAppTheme();
  const borderColor = tone === 'danger' ? `${theme.colors.danger}33` : `${theme.colors.success}33`;
  const backgroundColor = tone === 'danger' ? `${theme.colors.danger}12` : `${theme.colors.success}10`;
  const textColor = tone === 'danger' ? theme.colors.danger : theme.colors.textPrimary;

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Text style={{ color: textColor, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

function floatingMapButtonStyle(borderColor: string, backgroundColor: string) {
  return {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor,
    borderWidth: 1,
    borderColor,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  };
}

function floatingTopButtonStyle(borderColor: string, backgroundColor: string) {
  return {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
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
