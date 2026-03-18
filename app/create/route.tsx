import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import { ClubRunMap } from '@/components/map/ClubRunMap';
import { AppButton } from '@/components/ui/AppButton';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAppTheme } from '@/contexts/ThemeContext';
import { RoutePoint } from '@/lib/geo';
import { PlaceSearchResult, searchPlacesWithProvider } from '@/lib/placeSearchService';
import {
  buildRouteWaypointsFromStops,
  countWaypointStops,
  createRouteStop,
  formatStopCoordinateLabel,
  getRoutePlannerStage,
  parseCoordinateInput,
  reorderWaypointStopBefore,
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

export default function RoutePlanningScreen() {
  const router = useRouter();
  const { runId, joinCode } = useLocalSearchParams<{ runId?: string; joinCode?: string }>();
  const { theme } = useAppTheme();
  const setRunSnapshot = useRunSessionStore((state) => state.setRunSnapshot);
  const currentLocation = useDeviceLocationStore((state) => state.currentLocation);
  const bootstrapLocation = useDeviceLocationStore((state) => state.bootstrapLocation);

  const [stops, setStops] = useState<RouteStopDraft[]>([
    createRouteStop('start', { id: 'start', label: 'Start', source: 'current_location' }),
    createRouteStop('destination', {
      id: 'destination',
      label: 'Destination',
      source: 'coordinates',
    }),
  ]);
  const [selectedStopId, setSelectedStopId] = useState<string>('start');
  const [searchInput, setSearchInput] = useState('');
  const [routePreview, setRoutePreview] = useState<RouteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRouteSaved, setIsRouteSaved] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [fitToRouteToken, setFitToRouteToken] = useState(0);
  const [focusPoint, setFocusPoint] = useState<RoutePoint | null>(null);
  const [mapCenterPoint, setMapCenterPoint] = useState<RoutePoint>(FALLBACK_POINT);
  const [pendingPickedPoint, setPendingPickedPoint] = useState<RoutePoint | null>(null);
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null);
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const hasAutoCentered = useRef(false);

  const selectedStop = useMemo(
    () => stops.find((stop) => stop.id === selectedStopId) ?? stops[0],
    [selectedStopId, stops]
  );
  const completeWaypoints = useMemo(() => buildRouteWaypointsFromStops(stops), [stops]);
  const plannerStage = useMemo(() => getRoutePlannerStage(stops), [stops]);
  const waypointStops = useMemo(() => stops.filter((stop) => stop.kind === 'waypoint'), [stops]);
  const routeDuration = formatRouteDuration(routePreview?.durationSeconds);
  const routeDistance = routePreview ? `${(routePreview.distanceMetres / 1000).toFixed(1)} km` : null;

  useEffect(() => {
    void bootstrapLocation();
  }, [bootstrapLocation]);

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
        setFitToRouteToken((current) => current + 1);
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

    if (!trimmed || pickMode) {
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
  }, [pickMode, searchInput, selectedStopId]);

  function focusStop(stopId: string, nextStops: RouteStopDraft[] = stops) {
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
  }

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
    const resolvedLabel = label ?? (await describePoint(point));
    const nextStops = updateStop(selectedStop.id, {
      label: resolvedLabel,
      lat: point[0],
      lng: point[1],
      source,
    });

    setSearchInput('');
    setPlaceResults([]);
    setPickMode(false);
    setPendingPickedPoint(null);
    setMapCenterPoint(point);
    setFocusPoint(point);

    if (selectedStop.kind === 'start' && getRoutePlannerStage(nextStops) === 'destination') {
      focusStop('destination', nextStops);
      setStatusMessage('Start set. Choose destination.');
      return;
    }

    if (selectedStop.kind === 'destination' && getRoutePlannerStage(nextStops) === 'stops') {
      focusStop('destination', nextStops);
      setStatusMessage('Destination set. Add stops or save the route.');
      return;
    }

    focusStop(selectedStop.id, nextStops);
    setStatusMessage(`${getStopTitle(selectedStop)} updated.`);
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
    let nextCurrentLocation = currentLocation;
    if (!nextCurrentLocation) {
      await bootstrapLocation();
      nextCurrentLocation = useDeviceLocationStore.getState().currentLocation;
    }

    if (!nextCurrentLocation) {
      setError('Current location is not ready yet.');
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsResolving(true);

    try {
      await applyPointToSelectedStop(nextCurrentLocation, 'current_location', 'Current location');
    } finally {
      setIsResolving(false);
    }
  }

  function handleMapPress(point: RoutePoint) {
    if (!pickMode) {
      return;
    }

    setPendingPickedPoint(point);
    setFocusPoint(point);
    setMapCenterPoint(point);
    setStatusMessage(`${getStopTitle(selectedStop)} pin selected. Confirm this location.`);
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
    setIsSheetExpanded(true);
    setError(null);
    setStatusMessage('Add a location for the new stop.');
    focusStop(waypoint.id, nextStops);
  }

  function handleRemoveWaypoint(stopId: string) {
    const nextStops = removeWaypointStop(stops, stopId);
    setStops(nextStops);
    setIsRouteSaved(false);
    focusStop('destination', nextStops);
    setStatusMessage('Stop removed.');
  }

  function handleSwapStartAndDestination() {
    const nextStops = swapStartAndDestinationStops(stops);
    setStops(nextStops);
    setIsRouteSaved(false);
    focusStop(selectedStopId, nextStops);
    setStatusMessage('Start and destination swapped.');
  }

  function handleRecenterOnUser() {
    if (!currentLocation) {
      setError('Current location is not ready yet.');
      return;
    }

    setError(null);
    setFocusPoint(currentLocation);
    setMapCenterPoint(currentLocation);
  }

  function handleFitRoute() {
    if (!routePreview?.points.length) {
      setError('Add at least a start and destination before fitting the route.');
      return;
    }

    setError(null);
    setFitToRouteToken((current) => current + 1);
  }

  function handleStartDraggingStop(stopId: string) {
    const stop = stops.find((item) => item.id === stopId);
    if (stop?.kind !== 'waypoint') {
      return;
    }

    setDraggedStopId(stopId);
    setStatusMessage('Choose where to drop this stop.');
  }

  function handleDropWaypointBefore(targetStopId: string) {
    if (!draggedStopId) {
      return;
    }

    const nextStops = reorderWaypointStopBefore(stops, draggedStopId, targetStopId);
    setStops(nextStops);
    setDraggedStopId(null);
    setIsRouteSaved(false);
    setStatusMessage('Stop order updated.');
  }

  function handleDropWaypointToEnd() {
    if (!draggedStopId) {
      return;
    }

    const nextStops = reorderWaypointStopToEnd(stops, draggedStopId);
    setStops(nextStops);
    setDraggedStopId(null);
    setIsRouteSaved(false);
    setStatusMessage('Stop moved to the final waypoint slot.');
  }

  function handleCancelDraggingStop() {
    setDraggedStopId(null);
    setStatusMessage('Reorder cancelled.');
  }

  function handleEnterPickMode() {
    setPickMode(true);
    setPendingPickedPoint(null);
    setSearchInput('');
    setPlaceResults([]);
    setIsSheetExpanded(false);
    setError(null);
    setStatusMessage(`Tap the map to choose ${getStopTitle(selectedStop)}.`);
  }

  async function handleConfirmMapPick() {
    if (!pendingPickedPoint) {
      setError('Tap the map to choose a location first.');
      return;
    }

    setError(null);
    setStatusMessage(null);
    setIsResolving(true);

    try {
      await applyPointToSelectedStop(pendingPickedPoint, 'pin');
      setStatusMessage(`${getStopTitle(selectedStop)} updated from the map.`);
    } finally {
      setIsResolving(false);
    }
  }

  function handleCancelMapPick() {
    setPickMode(false);
    setPendingPickedPoint(null);
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
      setStatusMessage('Route draft saved. You can keep editing or start the run.');
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

  const sheetPrompt =
    pickMode
      ? `Tap the map to choose ${getStopTitle(selectedStop)}`
      : plannerStage === 'start'
        ? 'Choose start'
        : plannerStage === 'destination'
          ? 'Choose destination'
          : 'Add stops or save route';

  const mapButtonBottom = pickMode ? 112 : isSheetExpanded ? 432 : 240;
  const shouldShowNoMatches =
    !pickMode && searchInput.trim().length >= 3 && !parseCoordinateInput(searchInput) && !isSearchingPlaces && placeResults.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} testID="screen-route-planning">
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ClubRunMap
          currentLocation={currentLocation ?? FALLBACK_POINT}
          edgeToEdge
          fitToRouteToken={fitToRouteToken}
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
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: 'rgba(255,255,255,0.94)',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>
              Route Draft {joinCode ? `• ${joinCode}` : ''}
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

        {pickMode ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: '50%',
              top: '38%',
              marginLeft: -24,
              marginTop: -24,
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: `${theme.colors.surface}DD`,
                borderWidth: 2,
                borderColor: theme.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: theme.colors.accent,
                }}
              />
            </View>
          </View>
        ) : null}

        {pickMode ? (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 16,
              borderRadius: 24,
              backgroundColor: 'rgba(255,255,255,0.96)',
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 16,
              gap: 10,
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
              Tap the map to choose {getStopTitle(selectedStop)}
            </Text>
            <Text style={{ color: theme.colors.textSecondary }}>
              After tapping, confirm the selected location for {getStopTitle(selectedStop).toLowerCase()}.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <AppButton
                label="Confirm Pin"
                onPress={handleConfirmMapPick}
                testID="button-confirm-map-pick"
              />
              <AppButton
                label="Cancel"
                onPress={handleCancelMapPick}
                testID="button-cancel-map-pick"
                variant="secondary"
              />
            </View>
          </View>
        ) : (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 16,
              borderRadius: 28,
              backgroundColor: 'rgba(255,255,255,0.96)',
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: 18,
              gap: 12,
              maxHeight: isSheetExpanded ? '64%' : undefined,
              shadowColor: '#000000',
              shadowOpacity: 0.14,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 10 },
              elevation: 12,
            }}
          >
            <View style={{ gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsSheetExpanded((current) => !current)}
                style={{ gap: 10 }}
                testID={isSheetExpanded ? 'button-collapse-route-sheet' : 'button-expand-route-sheet'}
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
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '800' }}>
                    {routeDistance ?? sheetPrompt}
                  </Text>
                  <Text
                    style={{ color: theme.colors.textSecondary, fontWeight: '700' }}
                    testID="text-sheet-state"
                  >
                    {isSheetExpanded ? 'Expanded' : 'Collapsed'}
                  </Text>
                </View>
                <Text
                  style={{ color: theme.colors.textSecondary, fontWeight: '600' }}
                  testID="text-guided-step"
                >
                  {sheetPrompt}
                </Text>
              </Pressable>
            </View>

            {isSheetExpanded ? (
              <View style={{ gap: 12 }}>
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
                  style={{ maxHeight: 220 }}
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
                      <View key={stop.id} style={{ gap: 6 }}>
                        {draggedStopId && isWaypoint && draggedStopId !== stop.id ? (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => handleDropWaypointBefore(stop.id)}
                            style={{
                              borderRadius: 12,
                              borderWidth: 1,
                              borderStyle: 'dashed',
                              borderColor: theme.colors.accent,
                              paddingVertical: 8,
                              alignItems: 'center',
                            }}
                            testID={`drop-target-before-waypoint-${waypointIndex}`}
                          >
                            <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>
                              Drop here
                            </Text>
                          </Pressable>
                        ) : null}

                        <Pressable
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
                            borderColor:
                              draggedStopId === stop.id ? theme.colors.accent : theme.colors.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                          testID={rowTestId}
                        >
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                              {stop.kind === 'start'
                                ? 'START'
                                : stop.kind === 'destination'
                                  ? 'END'
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
                                onLongPress={() => handleStartDraggingStop(stop.id)}
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
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {draggedStopId ? (
              <View
                style={{
                  borderRadius: 16,
                  padding: 12,
                  backgroundColor: theme.colors.accentMuted,
                  borderWidth: 1,
                  borderColor: theme.colors.accent,
                  gap: 8,
                }}
              >
                <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
                  Drag mode active
                </Text>
                <Text style={{ color: theme.colors.textSecondary }}>
                  Tap a drop target or send this stop to the final waypoint slot.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <AppButton
                    label="Move To End"
                    onPress={handleDropWaypointToEnd}
                    testID="button-drop-waypoint-to-end"
                    variant="secondary"
                  />
                  <AppButton
                    label="Cancel"
                    onPress={handleCancelDraggingStop}
                    testID="button-cancel-drag"
                    variant="ghost"
                  />
                </View>
              </View>
            ) : null}

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
                No search matches yet. You can still use current location, paste coordinates, or pick on the map.
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
              {plannerStage === 'stops' && !isSheetExpanded ? (
                <AppButton
                  label="+ Add Stop"
                  onPress={handleAddStop}
                  testID="button-add-stop-collapsed"
                  variant="ghost"
                />
              ) : null}
            </View>

            {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
            {statusMessage ? <Text style={{ color: theme.colors.success }}>{statusMessage}</Text> : null}
            {isResolving || isPreviewing || isSaving || isStarting ? <LoadingSpinner /> : null}

            {routePreview ? (
              <View
                style={{
                  borderRadius: 18,
                  padding: 16,
                  backgroundColor: theme.colors.surfaceElevated,
                  gap: 8,
                }}
              >
                <Text style={{ color: theme.colors.textSecondary, fontWeight: '700' }}>
                  Route ready
                </Text>
                <Text
                  style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '800' }}
                  testID="text-route-distance"
                >
                  {routeDistance}
                </Text>
                <Text style={{ color: theme.colors.textSecondary }} testID="text-route-duration">
                  {routeDuration}
                </Text>
                <Text style={{ color: theme.colors.textSecondary }}>
                  {countWaypointStops(stops)} stops between start and destination
                </Text>
              </View>
            ) : null}

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
