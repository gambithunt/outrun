import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  Camera,
  LineLayer,
  MapView,
  PointAnnotation,
  ShapeSource,
  UserLocation,
  UserTrackingMode,
  type CameraRef,
} from '@maplibre/maplibre-react-native';

import { useAppTheme } from '@/contexts/ThemeContext';
import { RoutePoint } from '@/lib/geo';
import { LiveDriver, DriverPresenceStatus, getDriverPresenceStatus } from '@/lib/driverRealtime';
import { LiveHazard } from '@/lib/hazardRealtime';
import { RouteStopDraft } from '@/types/domain';

type MapMode = 'planning' | 'lobby' | 'navigation';

type ClubRunMapProps = {
  accentColorOverride?: string;
  currentDriverId?: string | null;
  currentLocation?: RoutePoint | null;
  drivers?: LiveDriver[];
  edgeToEdge?: boolean;
  fitToRouteToken?: number;
  focusPoint?: RoutePoint | null;
  hazards?: LiveHazard[];
  mapMode?: MapMode;
  onMapPress?: (point: RoutePoint) => void;
  onRegionDidChange?: (point: RoutePoint) => void;
  onUserPanned?: () => void;
  recenterToken?: number;
  routeColorOverride?: string;
  routePoints?: RoutePoint[];
  selectedStopId?: string | null;
  showUserLocation?: boolean;
  stops?: RouteStopDraft[];
  testID?: string;
  waypoints?: RoutePoint[];
};

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const MAP_ANIMATIONS_ENABLED = !process.env.JEST_WORKER_ID;

const HAZARD_EMOJI: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  pothole: 'trip-origin',
  roadworks: 'construction',
  police: 'local-police',
  debris: 'warning-amber',
  animal: 'pets',
  broken_down_car: 'car-crash',
};

const PRESENCE_COLORS: Record<DriverPresenceStatus, string> = {
  active: '',      // filled in from theme.colors.accent at render time
  stale: '#F59E0B',
  lost_signal: '#6B7280',
  awaiting_gps: '#6B7280',
};

function toGeoJsonLine(points: RoutePoint[]) {
  return {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates: points.map(([lat, lng]) => [lng, lat]),
    },
    properties: {},
  };
}

function getRouteBoundsForCamera(points: RoutePoint[]) {
  const lats = points.map(([lat]) => lat);
  const lngs = points.map(([, lng]) => lng);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
    sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
  };
}

function getFirstName(name: string) {
  return name.split(' ')[0] ?? name;
}

function getSelfLabel(name: string) {
  const firstName = getFirstName(name);
  return firstName.toLowerCase() === 'you' ? 'You' : `${firstName} (you)`;
}

function getDriverInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function isCompleteStopPoint(stop: RouteStopDraft) {
  return typeof stop.lat === 'number' && typeof stop.lng === 'number';
}

function getStopColor(kind: RouteStopDraft['kind'], accent: string) {
  if (kind === 'start') return '#22C55E';
  if (kind === 'destination') return '#EF4444';
  return accent;
}

// Pulsing ring shown behind a lobby driver pin
function LobbyPulseRing({ size, color }: { size: number; color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!MAP_ANIMATIONS_ENABLED) {
      scale.setValue(1);
      opacity.setValue(0.28);
      return;
    }

    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.9, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 900, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, scale]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

// Driver pin for lobby mode: large circle with name, pulsing ring, self-highlight
function LobbyDriverPin({
  driver,
  isSelf,
  accentColor,
}: {
  driver: LiveDriver;
  isSelf: boolean;
  accentColor: string;
}) {
  const size = isSelf ? 48 : 40;
  const color = isSelf ? accentColor : '#6B7280';

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <LobbyPulseRing size={size} color={color} />
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: isSelf ? accentColor : '#374151',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: isSelf ? 3 : 2,
            borderColor: isSelf ? '#FFFFFF' : color,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: isSelf ? 14 : 12, fontWeight: '800' }}>
            {getDriverInitials(driver.name)}
          </Text>
        </View>
      </View>
      <View
        style={{
          backgroundColor: isSelf ? accentColor : 'rgba(0,0,0,0.7)',
          borderRadius: 10,
          paddingHorizontal: 6,
          paddingVertical: 2,
          marginTop: 3,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
          {isSelf ? getSelfLabel(driver.name) : getFirstName(driver.name)}
        </Text>
      </View>
    </View>
  );
}

// Driver pin for navigation mode: heading arrow + circle + first name
function NavigationDriverPin({
  driver,
  isSelf,
  accentColor,
}: {
  driver: LiveDriver;
  isSelf: boolean;
  accentColor: string;
}) {
  const status = getDriverPresenceStatus(driver);
  const pinColor = isSelf ? accentColor : (PRESENCE_COLORS[status] || accentColor);
  const size = isSelf ? 44 : 36;
  const heading = driver.location?.heading ?? 0;

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Heading direction arrow */}
      <View style={{ transform: [{ rotate: `${heading}deg` }], marginBottom: -2 }}>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 5,
            borderRightWidth: 5,
            borderBottomWidth: 9,
            borderStyle: 'solid',
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: pinColor,
          }}
        />
      </View>
      {/* Circle with initials */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: pinColor,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: isSelf ? 3 : 2,
          borderColor: '#FFFFFF',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: isSelf ? 14 : 11, fontWeight: '800' }}>
          {getDriverInitials(driver.name)}
        </Text>
      </View>
      {/* Name label */}
      <View
        style={{
          backgroundColor: 'rgba(0,0,0,0.65)',
          borderRadius: 8,
          paddingHorizontal: 5,
          paddingVertical: 1,
          marginTop: 3,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
          {isSelf ? getSelfLabel(driver.name) : getFirstName(driver.name)}
        </Text>
      </View>
      {status === 'lost_signal' ? (
        <Text style={{ color: '#EF4444', fontSize: 9, fontWeight: '600', marginTop: 1 }}>
          Signal lost
        </Text>
      ) : null}
    </View>
  );
}

// Waze-style hazard pin with icon and count badge
function HazardPin({ hazard }: { hazard: LiveHazard }) {
  const iconName = HAZARD_EMOJI[hazard.type] ?? 'warning-amber';

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#FEF3C7',
          borderWidth: 2.5,
          borderColor: '#F59E0B',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialIcons color="#B45309" name={iconName} size={24} />
      </View>
      {hazard.reportCount > 1 ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            backgroundColor: '#EF4444',
            borderRadius: 9,
            minWidth: 18,
            height: 18,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>
            ×{hazard.reportCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function ClubRunMap({
  accentColorOverride,
  currentDriverId = null,
  currentLocation = null,
  drivers = [],
  edgeToEdge = false,
  fitToRouteToken = 0,
  focusPoint = null,
  hazards = [],
  mapMode,
  onMapPress,
  onRegionDidChange,
  onUserPanned,
  recenterToken = 0,
  routeColorOverride,
  routePoints = [],
  selectedStopId = null,
  showUserLocation = false,
  stops = [],
  testID,
  waypoints = [],
}: ClubRunMapProps) {
  const { theme } = useAppTheme();
  const cameraRef = useRef<CameraRef>(null);
  const [isFollowing, setIsFollowing] = useState(mapMode === 'navigation');

  // Re-enable following when recenterToken changes or mapMode enters navigation
  useEffect(() => {
    if (mapMode === 'navigation') {
      setIsFollowing(true);
    }
  }, [mapMode, recenterToken]);

  // Fit to route when entering lobby or on fitToRouteToken change
  useEffect(() => {
    if (mapMode === 'lobby' && routePoints.length > 1) {
      const bounds = getRouteBoundsForCamera(routePoints);
      cameraRef.current?.fitBounds(bounds.ne, bounds.sw, [80, 40, 80, 40], 600);
    }
  }, [mapMode, routePoints]);

  useEffect(() => {
    if (fitToRouteToken > 0 && routePoints.length > 1) {
      const bounds = getRouteBoundsForCamera(routePoints);
      cameraRef.current?.fitBounds(bounds.ne, bounds.sw, [84, 48, 320, 48], 600);
    }
  }, [fitToRouteToken, routePoints]);

  useEffect(() => {
    if (focusPoint) {
      cameraRef.current?.moveTo([focusPoint[1], focusPoint[0]], 450);
    }
  }, [focusPoint]);

  const fallbackDriverPoint = useMemo(() => {
    const driver = drivers.find((item) => item.location);
    return driver?.location ? ([driver.location.lat, driver.location.lng] as RoutePoint) : null;
  }, [drivers]);

  const firstStopPoint = useMemo(() => {
    const stop = stops.find(isCompleteStopPoint);
    return stop ? ([stop.lat as number, stop.lng as number] as RoutePoint) : null;
  }, [stops]);

  const initialPoint =
    focusPoint ??
    currentLocation ??
    firstStopPoint ??
    waypoints[0] ??
    routePoints[0] ??
    fallbackDriverPoint ??
    [-26.2041, 28.0473];

  const isNavigation = mapMode === 'navigation';
  const isLobby = mapMode === 'lobby';
  const accentColor = accentColorOverride ?? theme.colors.accent;
  const routeColor = routeColorOverride ?? accentColor;

  return (
    <View
      style={{
        flex: 1,
        overflow: 'hidden',
        borderRadius: edgeToEdge ? 0 : 28,
        borderWidth: edgeToEdge ? 0 : 1,
        borderColor: edgeToEdge ? 'transparent' : theme.colors.border,
      }}
      testID={testID}
    >
      <MapView
        attributionEnabled={false}
        compassEnabled={false}
        localizeLabels
        logoEnabled={false}
        mapStyle={MAP_STYLE}
        onPress={(feature) => {
          if (feature.geometry.type === 'Point') {
            const coordinates = feature.geometry.coordinates;
            if (Array.isArray(coordinates) && coordinates.length >= 2) {
              onMapPress?.([coordinates[1] as number, coordinates[0] as number]);
            }
          }
        }}
        onRegionDidChange={(feature) => {
          if (feature.geometry.type === 'Point') {
            const coordinates = feature.geometry.coordinates;
            if (Array.isArray(coordinates) && coordinates.length >= 2) {
              onRegionDidChange?.([coordinates[1] as number, coordinates[0] as number]);
            }
          }
        }}
        onRegionWillChange={(feature) => {
          if (
            isNavigation &&
            isFollowing &&
            (feature as { properties?: { isUserInteraction?: boolean } }).properties
              ?.isUserInteraction
          ) {
            setIsFollowing(false);
            onUserPanned?.();
          }
        }}
        rotateEnabled={isNavigation ? true : false}
        style={{ flex: 1 }}
      >
        {isNavigation ? (
          <Camera
            ref={cameraRef}
            followUserLocation={isFollowing}
            followUserMode={UserTrackingMode.FollowWithCourse}
            followZoomLevel={16}
            followPitch={45}
            animationMode="flyTo"
            animationDuration={300}
          />
        ) : (
          <Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: [initialPoint[1], initialPoint[0]],
              zoomLevel: routePoints.length > 1 ? 8 : 11,
            }}
          />
        )}

        {/* Always show user location puck */}
        {showUserLocation || isNavigation ? <UserLocation animated visible /> : null}

        {/* Route line */}
        {routePoints.length > 1 ? (
          <ShapeSource id="route-shape" shape={toGeoJsonLine(routePoints)}>
            <LineLayer
              id="route-line-casing"
              style={{ lineColor: '#FFFFFF', lineWidth: 8, lineOpacity: 0.95 }}
            />
            <LineLayer
              id="route-line"
              style={{ lineColor: routeColor, lineWidth: 5, lineOpacity: 0.95 }}
            />
          </ShapeSource>
        ) : null}

        {/* Route stops / waypoints */}
        {stops.length > 0
          ? stops.filter(isCompleteStopPoint).map((stop) => (
              <PointAnnotation
                id={`stop-${stop.id}`}
                key={`stop-${stop.id}`}
                coordinate={[stop.lng as number, stop.lat as number]}
              >
                <View
                  style={{
                    minWidth: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: getStopColor(stop.kind, accentColor),
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: selectedStopId === stop.id ? 3 : 2,
                    borderColor: selectedStopId === stop.id ? '#FFFFFF' : 'rgba(255,255,255,0.8)',
                    paddingHorizontal: 8,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
                    {stop.kind === 'waypoint'
                      ? String(
                          stops
                            .filter((item) => item.kind === 'waypoint')
                            .findIndex((item) => item.id === stop.id) + 1
                        )
                      : stop.kind === 'start'
                        ? 'S'
                        : 'E'}
                  </Text>
                </View>
              </PointAnnotation>
            ))
          : waypoints.map(([lat, lng], index) => (
              <PointAnnotation
                id={`waypoint-${index}`}
                key={`waypoint-${index}`}
                coordinate={[lng, lat]}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: accentColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: theme.colors.surface,
                  }}
                >
                  <Text style={{ color: theme.colors.onAccent, fontSize: 12, fontWeight: '700' }}>
                    {index + 1}
                  </Text>
                </View>
              </PointAnnotation>
            ))}

        {/* Driver pins */}
        {drivers
          .filter((driver) => driver.location)
          .map((driver) => {
            const isSelf = driver.id === currentDriverId;
            return (
              <PointAnnotation
                id={`driver-${driver.id}`}
                key={`driver-${driver.id}`}
                coordinate={[driver.location!.lng, driver.location!.lat]}
                anchor={isNavigation ? { x: 0.5, y: 0.85 } : { x: 0.5, y: 0.5 }}
              >
                {isLobby ? (
                  <LobbyDriverPin driver={driver} isSelf={isSelf} accentColor={accentColor} />
                ) : isNavigation ? (
                  <NavigationDriverPin driver={driver} isSelf={isSelf} accentColor={accentColor} />
                ) : (
                  // Planning mode fallback — simple initials pin
                  <View
                    style={{
                      minWidth: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: theme.colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: accentColor,
                      paddingHorizontal: 6,
                    }}
                  >
                    <Text
                      style={{ color: theme.colors.textPrimary, fontSize: 11, fontWeight: '700' }}
                    >
                      {getDriverInitials(driver.name)}
                    </Text>
                  </View>
                )}
              </PointAnnotation>
            );
          })}

        {/* Hazard pins — Waze style */}
        {hazards.map((hazard) => (
          <PointAnnotation
            id={`hazard-${hazard.id}`}
            key={`hazard-${hazard.id}`}
            coordinate={[hazard.lng, hazard.lat]}
          >
            <HazardPin hazard={hazard} />
          </PointAnnotation>
        ))}
      </MapView>
    </View>
  );
}
