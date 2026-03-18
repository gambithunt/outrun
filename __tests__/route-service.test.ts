import {
  buildOsrmRouteUrl,
  fetchRoadRoute,
  saveRouteDraftToRun,
  sanitizeRouteData,
  startRunWithSavedRoute,
  validateWaypoints,
} from '@/lib/routeService';

describe('routeService', () => {
  it('validates waypoint counts and builds an OSRM url', () => {
    expect(() => validateWaypoints([[-26.2, 28.0]])).toThrow(
      'Add at least two waypoints before previewing a route.'
    );

    const url = buildOsrmRouteUrl([
      [-26.2041, 28.0473],
      [-25.7479, 28.2293],
    ]);
    expect(url).toContain('28.0473,-26.2041;28.2293,-25.7479');
  });

  it('fetches and normalizes an OSRM route with distance and duration', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
            duration: 3600.2,
            geometry: {
              coordinates: [
                [28.0473, -26.2041],
                [28.2293, -25.7479],
              ],
            },
          },
        ],
      }),
    });

    const route = await fetchRoadRoute(
      [
        [-26.2041, 28.0473],
        [-25.7479, 28.2293],
      ],
      fetchImpl
    );

    expect(route.source).toBe('drawn');
    expect(route.points[0]).toEqual([-26.2041, 28.0473]);
    expect(route.distanceMetres).toBeGreaterThan(0);
    expect(route.durationSeconds).toBe(3600);
  });

  it('persists a route draft without activating the run', async () => {
    const client = {
      writeRoute: jest.fn(),
      writeStatus: jest.fn(),
      writeStartedAt: jest.fn(),
    };

    await saveRouteDraftToRun(
      client,
      'run_123',
      {
        points: [
          [-26.2041, 28.0473],
          [-25.7479, 28.2293],
        ],
        distanceMetres: 54000,
        durationSeconds: 3600,
        source: 'drawn',
        stops: [],
      },
      1234
    );

    expect(client.writeRoute).toHaveBeenCalledWith(
      'run_123',
      expect.objectContaining({ distanceMetres: 54000 })
    );
    expect(client.writeStartedAt).not.toHaveBeenCalled();
    expect(client.writeStatus).not.toHaveBeenCalled();
  });

  it('removes undefined properties before persisting route data', async () => {
    const cleaned = sanitizeRouteData({
      points: [
        [-26.2041, 28.0473],
        [-25.7479, 28.2293],
      ],
      distanceMetres: 54000,
      durationSeconds: undefined,
      source: 'drawn',
      stops: [
        {
          id: 'start',
          kind: 'start',
          label: 'Your location',
          lat: -26.2041,
          lng: 28.0473,
          source: 'current_location',
          placeId: undefined,
        },
      ],
    });

    expect(cleaned).toEqual({
      points: [
        [-26.2041, 28.0473],
        [-25.7479, 28.2293],
      ],
      distanceMetres: 54000,
      source: 'drawn',
      stops: [
        {
          id: 'start',
          kind: 'start',
          label: 'Your location',
          lat: -26.2041,
          lng: 28.0473,
          source: 'current_location',
        },
      ],
    });
  });

  it('starts a run from a saved route by setting status to ready', async () => {
    const client = {
      writeRoute: jest.fn(),
      writeStatus: jest.fn(),
      writeStartedAt: jest.fn(),
    };

    await startRunWithSavedRoute(client, 'run_123', 1234);

    expect(client.writeStartedAt).toHaveBeenCalledWith('run_123', 1234);
    expect(client.writeStatus).toHaveBeenCalledWith('run_123', 'ready');
    expect(client.writeRoute).not.toHaveBeenCalled();
  });
});
