import { onValue } from 'firebase/database';

import { createRealtimeHazardsClient, formatHazardLabel, normalizeHazardsSnapshot } from '@/lib/hazardRealtime';

describe('hazardRealtime', () => {
  it('normalizes realtime hazard snapshots', () => {
    const hazards = normalizeHazardsSnapshot({
      hazard_1: {
        type: 'pothole',
        reportedBy: 'driver_1',
        reporterName: 'Jamie',
        lat: -26.2,
        lng: 28.0,
        timestamp: 1,
        dismissed: false,
        reportCount: 1,
      },
    });

    expect(hazards[0]).toEqual(
      expect.objectContaining({
        id: 'hazard_1',
        type: 'pothole',
      })
    );
    expect(formatHazardLabel('broken_down_car')).toBe('Broken Down Car');
  });

  it('subscribes to realtime hazards', () => {
    const unsubscribe = jest.fn();
    (onValue as jest.Mock).mockImplementationOnce((_path, onData) => {
      onData({
        exists: () => true,
        val: () => ({
          hazard_1: {
            type: 'pothole',
            reportedBy: 'driver_1',
            reporterName: 'Jamie',
            lat: -26.2,
            lng: 28.0,
            timestamp: 1,
            dismissed: false,
            reportCount: 1,
          },
        }),
      });
      return unsubscribe;
    });

    const client = createRealtimeHazardsClient({} as never);
    const handleData = jest.fn();
    const result = client.subscribeToHazards('run_1', handleData);

    expect(handleData).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'hazard_1',
        type: 'pothole',
      }),
    ]);
    expect(result).toBe(unsubscribe);
  });
});
