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
  waypoints?: RoutePoint[];
  routePoints?: RoutePoint[];
  selectedStopId?: string | null;
  showUserLocation?: boolean;
  stops?: RouteStopDraft[];
  testID?: string;
};

export function ClubRunMap({
  currentLocation,
  drivers = [],
  edgeToEdge = false,
  hazards = [],
  onMapPress,
  onRegionDidChange,
  routePoints = [],
  selectedStopId,
  showUserLocation,
  stops = [],
  testID,
  waypoints = [],
}: ClubRunMapProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        minHeight: 320,
        overflow: 'hidden',
        borderRadius: edgeToEdge ? 0 : 24,
        borderWidth: edgeToEdge ? 0 : 1,
        borderColor: edgeToEdge ? 'transparent' : theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 20,
        gap: 12,
        justifyContent: 'center',
      }}
      testID={testID}
    >
      <Text style={{ color: theme.colors.textPrimary, fontSize: 20, fontWeight: '800' }}>
        Map preview unavailable on web
      </Text>
      <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
        ClubRun uses MapLibre native rendering for iOS and Android development builds. The browser
        can still preview route and convoy data, but the interactive map is available in the native
        app.
      </Text>
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
          padding: 16,
          gap: 8,
        }}
      >
        <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
          Route points: {routePoints.length}
        </Text>
        <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
          Waypoints: {waypoints.length}
        </Text>
        <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
          Planned stops: {stops.length}
        </Text>
        <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
          Drivers with GPS: {drivers.filter((driver) => driver.location).length}
        </Text>
        <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
          Visible hazards: {hazards.length}
        </Text>
      </View>
      {currentLocation ? (
        <Text style={{ color: theme.colors.textSecondary }}>
          Current location: {currentLocation[0].toFixed(4)}, {currentLocation[1].toFixed(4)}
        </Text>
      ) : null}
      {selectedStopId ? (
        <Text style={{ color: theme.colors.textSecondary }}>Selected stop: {selectedStopId}</Text>
      ) : null}
      {showUserLocation ? (
        <Text style={{ color: theme.colors.textSecondary }}>User location puck enabled</Text>
      ) : null}
      {onMapPress ? (
        <Text style={{ color: theme.colors.textSecondary }}>
          Native map press placement is available in the iOS and Android development build.
        </Text>
      ) : null}
      {onRegionDidChange ? (
        <Text style={{ color: theme.colors.textSecondary }}>
          Route planner camera tracking is active for native pin-pick mode.
        </Text>
      ) : null}
      {drivers.length > 0 ? (
        <Text style={{ color: theme.colors.textSecondary }}>
          Drivers: {drivers.map((driver) => driver.name).join(', ')}
        </Text>
      ) : null}
      {hazards.length > 0 ? (
        <Text style={{ color: theme.colors.textSecondary }}>
          Hazards: {hazards.map((hazard) => formatHazardLabel(hazard.type)).join(', ')}
        </Text>
      ) : null}
    </View>
  );
}
