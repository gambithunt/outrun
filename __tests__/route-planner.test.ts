import {
  buildRouteWaypointsFromStops,
  getRoutePlannerStage,
  moveWaypointStop,
  parseCoordinateInput,
  reorderWaypointStopBefore,
  reorderWaypointStopToEnd,
  swapStartAndDestinationStops,
} from '@/lib/routePlanner';
import { RouteStopDraft } from '@/types/domain';

function createStop(
  id: string,
  kind: RouteStopDraft['kind'],
  lat: number,
  lng: number
): RouteStopDraft {
  return {
    id,
    kind,
    label: id,
    lat,
    lng,
    source: 'coordinates',
  };
}

describe('routePlanner helpers', () => {
  it('parses a coordinate string', () => {
    expect(parseCoordinateInput('-26.2041, 28.0473')).toEqual({
      lat: -26.2041,
      lng: 28.0473,
    });
    expect(parseCoordinateInput('hello world')).toBeNull();
  });

  it('builds ordered waypoints from complete stops', () => {
    const stops = [
      createStop('start', 'start', -26.2041, 28.0473),
      createStop('waypoint-1', 'waypoint', -26.1, 28.1),
      createStop('destination', 'destination', -25.7479, 28.2293),
    ];

    expect(buildRouteWaypointsFromStops(stops)).toEqual([
      [-26.2041, 28.0473],
      [-26.1, 28.1],
      [-25.7479, 28.2293],
    ]);
  });

  it('derives the guided planner stage from stop completeness', () => {
    expect(
      getRoutePlannerStage([
        createStop('start', 'start', -26.2041, 28.0473),
        {
          id: 'destination',
          kind: 'destination',
          label: 'destination',
          lat: null,
          lng: null,
          source: 'coordinates',
        },
      ])
    ).toBe('destination');

    expect(
      getRoutePlannerStage([
        createStop('start', 'start', -26.2041, 28.0473),
        createStop('destination', 'destination', -25.7479, 28.2293),
      ])
    ).toBe('stops');
  });

  it('reorders only waypoint stops', () => {
    const stops = [
      createStop('start', 'start', -26.2041, 28.0473),
      createStop('waypoint-1', 'waypoint', -26.1, 28.1),
      createStop('waypoint-2', 'waypoint', -26.0, 28.2),
      createStop('destination', 'destination', -25.7479, 28.2293),
    ];

    expect(moveWaypointStop(stops, 'waypoint-2', 'up').map((stop) => stop.id)).toEqual([
      'start',
      'waypoint-2',
      'waypoint-1',
      'destination',
    ]);

    expect(moveWaypointStop(stops, 'start', 'down').map((stop) => stop.id)).toEqual([
      'start',
      'waypoint-1',
      'waypoint-2',
      'destination',
    ]);
  });

  it('swaps start and destination values without changing their roles', () => {
    const stops = [
      createStop('start', 'start', -26.2041, 28.0473),
      createStop('destination', 'destination', -25.7479, 28.2293),
    ];

    const swapped = swapStartAndDestinationStops(stops);

    expect(swapped[0]).toMatchObject({
      id: 'start',
      kind: 'start',
      lat: -25.7479,
      lng: 28.2293,
    });
    expect(swapped[1]).toMatchObject({
      id: 'destination',
      kind: 'destination',
      lat: -26.2041,
      lng: 28.0473,
    });
  });

  it('reorders a waypoint before another waypoint', () => {
    const stops = [
      createStop('start', 'start', -26.2041, 28.0473),
      createStop('waypoint-1', 'waypoint', -26.1, 28.1),
      createStop('waypoint-2', 'waypoint', -26.0, 28.2),
      createStop('destination', 'destination', -25.7479, 28.2293),
    ];

    expect(reorderWaypointStopBefore(stops, 'waypoint-2', 'waypoint-1').map((stop) => stop.id)).toEqual([
      'start',
      'waypoint-2',
      'waypoint-1',
      'destination',
    ]);
  });

  it('reorders a waypoint to the final slot before destination', () => {
    const stops = [
      createStop('start', 'start', -26.2041, 28.0473),
      createStop('waypoint-1', 'waypoint', -26.1, 28.1),
      createStop('waypoint-2', 'waypoint', -26.0, 28.2),
      createStop('destination', 'destination', -25.7479, 28.2293),
    ];

    expect(reorderWaypointStopToEnd(stops, 'waypoint-1').map((stop) => stop.id)).toEqual([
      'start',
      'waypoint-2',
      'waypoint-1',
      'destination',
    ]);
  });
});
