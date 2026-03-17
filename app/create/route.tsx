import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { ClubRunMap } from '@/components/map/ClubRunMap';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAppTheme } from '@/contexts/ThemeContext';
import { RoutePoint } from '@/lib/geo';
import { fetchRoadRoute, saveRouteToRunWithFirebase } from '@/lib/routeService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { RouteData } from '@/types/domain';

type WaypointDraft = {
  lat: string;
  lng: string;
};

function createEmptyWaypoint(): WaypointDraft {
  return { lat: '', lng: '' };
}

function parseWaypoints(drafts: WaypointDraft[]): RoutePoint[] {
  return drafts
    .filter((draft) => draft.lat.trim() || draft.lng.trim())
    .map((draft) => [Number(draft.lat), Number(draft.lng)] as RoutePoint);
}

export default function RoutePlanningScreen() {
  const router = useRouter();
  const { runId, joinCode } = useLocalSearchParams<{ runId?: string; joinCode?: string }>();
  const { theme } = useAppTheme();
  const setRunSnapshot = useRunSessionStore((state) => state.setRunSnapshot);
  const [waypoints, setWaypoints] = useState<WaypointDraft[]>([
    { lat: '-26.2041', lng: '28.0473' },
    { lat: '-25.7479', lng: '28.2293' },
  ]);
  const [routePreview, setRoutePreview] = useState<RouteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const parsedWaypoints = useMemo(() => parseWaypoints(waypoints), [waypoints]);

  function updateWaypoint(index: number, patch: Partial<WaypointDraft>) {
    setWaypoints((current) =>
      current.map((waypoint, currentIndex) =>
        currentIndex === index ? { ...waypoint, ...patch } : waypoint
      )
    );
  }

  function addWaypoint() {
    setWaypoints((current) => [...current, createEmptyWaypoint()]);
  }

  function removeWaypoint(index: number) {
    setWaypoints((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handlePreviewRoute() {
    setError(null);
    setSaved(false);
    setIsPreviewing(true);

    try {
      const route = await fetchRoadRoute(parsedWaypoints);
      setRoutePreview(route);
    } catch (nextError) {
      setRoutePreview(null);
      setError(nextError instanceof Error ? nextError.message : 'Unable to preview route.');
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSaveRoute() {
    if (!routePreview) {
      setError('Preview the route before saving it.');
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await saveRouteToRunWithFirebase(runId ?? '', routePreview);
      setRunSnapshot({
        status: 'active',
        route: routePreview,
      });
      setSaved(true);
      router.push(`/run/${runId}/map`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save the route.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen scrollable testID="screen-route-planning" contentContainerStyle={{ gap: 16, paddingBottom: 48 }}>
      <AppCard>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: 28,
            fontWeight: '800',
          }}
        >
          Plan Route
        </Text>
        <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
          Run {runId ?? 'unknown'} {joinCode ? `• join code ${joinCode}` : ''}. Add latitude and
          longitude waypoints, preview the OSRM road route, then save it to activate the run.
        </Text>
      </AppCard>

      <ClubRunMap
        routePoints={routePreview?.points ?? []}
        testID="route-planning-map"
        waypoints={parsedWaypoints}
      />

      <AppCard>
        {waypoints.map((waypoint, index) => (
          <View key={`waypoint-${index}`} style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>
              Waypoint {index + 1}
            </Text>
            <AppTextInput
              label="Latitude"
              value={waypoint.lat}
              onChangeText={(value) => updateWaypoint(index, { lat: value })}
              placeholder="-26.2041"
              testID={`input-waypoint-lat-${index}`}
            />
            <AppTextInput
              label="Longitude"
              value={waypoint.lng}
              onChangeText={(value) => updateWaypoint(index, { lng: value })}
              placeholder="28.0473"
              testID={`input-waypoint-lng-${index}`}
            />
            {waypoints.length > 2 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => removeWaypoint(index)}
                testID={`button-remove-waypoint-${index}`}
              >
                <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>Remove waypoint</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <AppButton label="Add Waypoint" onPress={addWaypoint} testID="button-add-waypoint" variant="secondary" />
        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
        {isPreviewing || isSaving ? <LoadingSpinner /> : null}
        <AppButton label="Preview Route" onPress={handlePreviewRoute} testID="button-preview-route" />
        <AppButton
          label="Save Route and Activate Run"
          onPress={handleSaveRoute}
          testID="button-save-route"
          variant="secondary"
        />
      </AppCard>

      {routePreview ? (
        <AppCard>
          <Text style={{ color: theme.colors.textSecondary }}>Preview ready</Text>
          <Text style={{ color: theme.colors.textPrimary }} testID="text-route-distance">
            Distance: {(routePreview.distanceMetres / 1000).toFixed(1)} km
          </Text>
          <Text style={{ color: theme.colors.textPrimary }} testID="text-route-points">
            Route points: {routePreview.points.length}
          </Text>
        </AppCard>
      ) : null}

      {saved ? (
        <AppCard>
          <Text style={{ color: theme.colors.success, fontWeight: '700' }} testID="text-route-saved">
            Route saved and run activated.
          </Text>
        </AppCard>
      ) : null}
    </Screen>
  );
}
