import { Camera, LineLayer, MapView, PointAnnotation, ShapeSource } from '@maplibre/maplibre-react-native';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/contexts/ThemeContext';
import { RoutePoint } from '@/lib/geo';
import { LiveDriver } from '@/lib/driverRealtime';
import { LiveHazard, formatHazardLabel } from '@/lib/hazardRealtime';

type ClubRunMapProps = {
  drivers?: LiveDriver[];
  hazards?: LiveHazard[];
  waypoints?: RoutePoint[];
  routePoints?: RoutePoint[];
  testID?: string;
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

export function ClubRunMap({
  drivers = [],
  hazards = [],
  routePoints = [],
  testID,
  waypoints = [],
}: ClubRunMapProps) {
  const { theme } = useAppTheme();
  const initialPoint =
    waypoints[0] ??
    routePoints[0] ??
    (drivers.find((driver) => driver.location)?.location
      ? [drivers.find((driver) => driver.location)?.location?.lat ?? -26.2041, drivers.find((driver) => driver.location)?.location?.lng ?? 28.0473]
      : [-26.2041, 28.0473]);

  return (
    <View
      style={{
        minHeight: 320,
        overflow: 'hidden',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
      testID={testID}
    >
      <MapView style={{ flex: 1 }}>
        <Camera
          centerCoordinate={[initialPoint[1], initialPoint[0]]}
          zoomLevel={routePoints.length > 1 ? 9 : 5}
        />
        {routePoints.length > 1 ? (
          <ShapeSource id="route-shape" shape={toGeoJsonLine(routePoints)}>
            <LineLayer
              id="route-line"
              style={{
                lineColor: theme.colors.accent,
                lineWidth: 4,
                lineOpacity: 0.9,
              }}
            />
          </ShapeSource>
        ) : null}
        {waypoints.map(([lat, lng], index) => (
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
