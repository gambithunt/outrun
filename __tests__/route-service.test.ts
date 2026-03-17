import { buildOsrmRouteUrl, fetchRoadRoute, saveRouteToRun, validateWaypoints } from '@/lib/routeService';

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

  it('fetches and normalizes an OSRM route', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
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
  });

  it('persists a route and activates the run', async () => {
    const client = {
      writeRoute: jest.fn(),
      writeStatus: jest.fn(),
      writeStartedAt: jest.fn(),
    };

    await saveRouteToRun(
      client,
      'run_123',
      {
        points: [
          [-26.2041, 28.0473],
          [-25.7479, 28.2293],
        ],
        distanceMetres: 54000,
        source: 'drawn',
      },
      1234
    );

    expect(client.writeRoute).toHaveBeenCalledWith(
      'run_123',
      expect.objectContaining({ distanceMetres: 54000 })
    );
    expect(client.writeStartedAt).toHaveBeenCalledWith('run_123', 1234);
    expect(client.writeStatus).toHaveBeenCalledWith('run_123', 'active');
  });
});
