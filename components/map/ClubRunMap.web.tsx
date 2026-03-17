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

export function ClubRunMap({
  drivers = [],
  hazards = [],
  routePoints = [],
  testID,
  waypoints = [],
}: ClubRunMapProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        minHeight: 320,
        overflow: 'hidden',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: theme.colors.border,
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
          Drivers with GPS: {drivers.filter((driver) => driver.location).length}
        </Text>
        <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
          Visible hazards: {hazards.length}
        </Text>
      </View>
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
