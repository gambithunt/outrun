import { useEffect, useMemo, useRef } from 'react';
import {
  Camera,
  LineLayer,
  MapView,
  PointAnnotation,
  ShapeSource,
  UserLocation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';
import { RoutePoint } from '@/lib/geo';
import { LiveDriver } from '@/lib/driverRealtime';
import { LiveHazard, formatHazardLabel } from '@/lib/hazardRealtime';
import { RouteStopDraft } from '@/types/domain';

type ClubRunMapProps = {
  currentLocation?: RoutePoint | null;
  drivers?: LiveDriver[];
  edgeToEdge?: boolean;
  fitToRouteToken?: number;
  focusPoint?: RoutePoint | null;
  hazards?: LiveHazard[];
  onMapPress?: (point: RoutePoint) => void;
  onRegionDidChange?: (point: RoutePoint) => void;
  routePoints?: RoutePoint[];
  selectedStopId?: string | null;
  showUserLocation?: boolean;
  stops?: RouteStopDraft[];
  testID?: string;
  waypoints?: RoutePoint[];
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

function getRouteBounds(points: RoutePoint[]) {
  const lats = points.map(([lat]) => lat);
  const lngs = points.map(([, lng]) => lng);
  return {
    ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
    sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
  };
}

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

export function ClubRunMap({
  currentLocation = null,
  drivers = [],
  edgeToEdge = false,
  fitToRouteToken = 0,
  focusPoint = null,
  hazards = [],
  onMapPress,
  onRegionDidChange,
  routePoints = [],
  selectedStopId = null,
  showUserLocation = false,
  stops = [],
  testID,
  waypoints = [],
}: ClubRunMapProps) {
  const { theme } = useAppTheme();
  const cameraRef = useRef<CameraRef>(null);

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

  useEffect(() => {
    if (fitToRouteToken > 0 && routePoints.length > 1) {
      const bounds = getRouteBounds(routePoints);
      cameraRef.current?.fitBounds(bounds.ne, bounds.sw, [84, 48, 320, 48], 600);
    }
  }, [fitToRouteToken, routePoints]);

  useEffect(() => {
    if (focusPoint) {
      cameraRef.current?.moveTo([focusPoint[1], focusPoint[0]], 450);
    }
  }, [focusPoint]);

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
        rotateEnabled={false}
        style={{ flex: 1 }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [initialPoint[1], initialPoint[0]],
            zoomLevel: routePoints.length > 1 ? 8 : 11,
          }}
        />
        {showUserLocation ? <UserLocation animated visible /> : null}
        {routePoints.length > 1 ? (
          <ShapeSource id="route-shape" shape={toGeoJsonLine(routePoints)}>
            <LineLayer
              id="route-line-casing"
              style={{
                lineColor: '#FFFFFF',
                lineWidth: 8,
                lineOpacity: 0.95,
              }}
            />
            <LineLayer
              id="route-line"
              style={{
                lineColor: theme.colors.accent,
                lineWidth: 5,
                lineOpacity: 0.95,
              }}
            />
          </ShapeSource>
        ) : null}
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
                    backgroundColor: getStopColor(stop.kind, theme.colors.accent),
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: selectedStopId === stop.id ? 3 : 2,
                    borderColor: selectedStopId === stop.id ? '#FFFFFF' : 'rgba(255,255,255,0.8)',
                    paddingHorizontal: 8,
                  }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 12,
                      fontWeight: '800',
                    }}
                  >
                    {stop.kind === 'waypoint'
                      ? String(stops.filter((item) => item.kind === 'waypoint').findIndex((item) => item.id === stop.id) + 1)
                      : stop.kind === 'start'
                        ? 'S'
                        : 'E'}
                  </Text>
                </View>
              </PointAnnotation>
            ))
          : waypoints.map(([lat, lng], index) => (
              <PointAnnotation id={`waypoint-${index}`} key={`waypoint-${index}`} coordinate={[lng, lat]}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: theme.colors.accent,
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
        {drivers
          .filter((driver) => driver.location)
          .map((driver) => (
            <PointAnnotation
              id={`driver-${driver.id}`}
              key={`driver-${driver.id}`}
              coordinate={[driver.location!.lng, driver.location!.lat]}
            >
              <View
                style={{
                  minWidth: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: theme.colors.accent,
                  paddingHorizontal: 6,
                }}
              >
                <Text style={{ color: theme.colors.textPrimary, fontSize: 11, fontWeight: '700' }}>
                  {getDriverInitials(driver.name)}
                </Text>
              </View>
            </PointAnnotation>
          ))}
        {hazards.map((hazard) => (
          <PointAnnotation
            id={`hazard-${hazard.id}`}
            key={`hazard-${hazard.id}`}
            coordinate={[hazard.lng, hazard.lat]}
          >
            <View
              style={{
                minWidth: 40,
                minHeight: 30,
                borderRadius: 15,
                backgroundColor: theme.colors.warning,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: theme.colors.surface,
                paddingHorizontal: 8,
              }}
            >
              <Text style={{ color: theme.colors.textPrimary, fontSize: 10, fontWeight: '700' }}>
                {getHazardGlyph(hazard.type)}
              </Text>
              <Text style={{ color: theme.colors.textPrimary, fontSize: 8 }}>
                {hazard.reportCount > 1 ? `x${hazard.reportCount}` : ''}
              </Text>
            </View>
          </PointAnnotation>
        ))}
      </MapView>
    </View>
  );
}

function isCompleteStopPoint(stop: RouteStopDraft) {
  return typeof stop.lat === 'number' && typeof stop.lng === 'number';
}

function getStopColor(kind: RouteStopDraft['kind'], accent: string) {
  if (kind === 'start') {
    return '#22C55E';
  }

  if (kind === 'destination') {
    return '#EF4444';
  }

  return accent;
}

function getDriverInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getHazardGlyph(type: LiveHazard['type']) {
  return formatHazardLabel(type)
    .split(' ')
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3);
}
