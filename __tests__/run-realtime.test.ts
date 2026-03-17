import { onValue } from 'firebase/database';

import { createRealtimeRunClient, normalizeRunSnapshot } from '@/lib/runRealtime';

describe('runRealtime', () => {
  it('normalizes invalid values to null', () => {
    expect(normalizeRunSnapshot(null)).toBeNull();
    expect(normalizeRunSnapshot(undefined)).toBeNull();
  });

  it('subscribes to a run and emits normalized data', () => {
    const unsubscribe = jest.fn();

    (onValue as jest.Mock).mockImplementationOnce((_path, onData) => {
      onData({
        exists: () => true,
        val: () => ({
          name: 'Sunrise Run',
          status: 'active',
        }),
      });

      return unsubscribe;
    });

    const client = createRealtimeRunClient({} as never);
    const handleData = jest.fn();
    const result = client.subscribeToRun('run_123', handleData);

    expect(handleData).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Sunrise Run',
        status: 'active',
      })
    );
    expect(result).toBe(unsubscribe);
  });

  it('rejects empty run ids', () => {
    const client = createRealtimeRunClient({} as never);

    expect(() => client.subscribeToRun('', jest.fn())).toThrow(
      'Run id is required for realtime subscription.'
    );
  });
});
