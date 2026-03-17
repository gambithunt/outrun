import { removeDriver } from '@/lib/driverManagementService';

describe('driverManagementService', () => {
  it('removes a driver from a run', async () => {
    const client = {
      removeDriver: jest.fn(async () => undefined),
    };

    await removeDriver(client, 'run_1', 'driver_2');

    expect(client.removeDriver).toHaveBeenCalledWith('run_1', 'driver_2');
  });

  it('rejects missing identifiers', async () => {
    await expect(
      removeDriver({ removeDriver: jest.fn() }, '', 'driver_2')
    ).rejects.toThrow('Run id and driver id are required to remove a driver.');
  });
});
