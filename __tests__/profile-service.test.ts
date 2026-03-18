import { loadDriverProfileDraft, saveDriverProfile, saveDriverProfileDraft, validateDriverProfileInput } from '@/lib/profileService';
import { Run } from '@/types/domain';

function createRunFixture(partial: Partial<Run> = {}): Run {
  return {
    name: 'Sunrise Run',
    joinCode: '123456',
    adminId: 'admin_1',
    status: 'draft',
    createdAt: 1,
    startedAt: null,
    endedAt: null,
    maxDrivers: 15,
    ...partial,
  };
}

describe('profileService', () => {
  it('validates the driver profile payload', () => {
    expect(() =>
      validateDriverProfileInput({
        name: '',
        carMake: 'BMW',
        carModel: 'M3',
        fuelType: 'petrol',
      })
    ).toThrow('Display name is required.');

    expect(
      validateDriverProfileInput({
        name: 'Jamie',
        carMake: 'BMW',
        carModel: 'M3 Competition',
        fuelType: 'petrol',
        fuelEfficiency: '28',
      })
    ).toEqual(
      expect.objectContaining({
        name: 'Jamie',
        carMake: 'BMW',
        carModel: 'M3 Competition',
        fuelType: 'petrol',
        fuelEfficiency: 28,
        fuelUnit: 'mpg',
      })
    );
  });

  it('caches and reloads a profile draft', async () => {
    const storage = {
      value: null as string | null,
      async getItem() {
        return this.value;
      },
      async setItem(_key: string, nextValue: string) {
        this.value = nextValue;
      },
    };

    const profile = validateDriverProfileInput({
      name: 'Ava',
      carMake: 'Toyota',
      carModel: 'GR Yaris',
      fuelType: 'petrol',
    });

    await saveDriverProfileDraft(profile, storage);
    await expect(loadDriverProfileDraft(storage)).resolves.toEqual(profile);
  });

  it('writes the validated driver payload', async () => {
    const claimDriverSlot = jest.fn(async () => ({ joined: true }));
    const readRun = jest.fn(async () => createRunFixture({ drivers: {} }));

    const result = await saveDriverProfile(
      { claimDriverSlot, readRun },
      'run_123',
      {
        name: 'Liam',
        carMake: 'Ford',
        carModel: 'Mustang GT',
        fuelType: 'petrol',
        fuelEfficiency: '24',
      },
      {
        now: () => 555,
        random: () => 0.123456,
      }
    );

    expect(result.driverId).toContain('driver_');
    expect(readRun).toHaveBeenCalledWith('run_123');
    expect(claimDriverSlot).toHaveBeenCalledWith(
      'run_123',
      result.driverId,
      expect.objectContaining({
        joinedAt: 555,
        leftAt: null,
        profile: expect.objectContaining({
          name: 'Liam',
          fuelEfficiency: 24,
        }),
      })
    );
  });

  it('uses the authenticated driver uid when one is provided', async () => {
    const claimDriverSlot = jest.fn(async () => ({ joined: true }));
    const readRun = jest.fn(async () => createRunFixture({ drivers: {} }));

    const result = await saveDriverProfile(
      { claimDriverSlot, readRun },
      'run_123',
      {
        name: 'Liam',
        carMake: 'Ford',
        carModel: 'Mustang GT',
        fuelType: 'petrol',
      },
      {
        now: () => 777,
        driverId: 'uid_driver_2',
      }
    );

    expect(result.driverId).toBe('uid_driver_2');
    expect(claimDriverSlot).toHaveBeenCalledWith(
      'run_123',
      'uid_driver_2',
      expect.objectContaining({
        joinedAt: 777,
      })
    );
  });

  it('rejects joining when the run is already full', async () => {
    await expect(
      saveDriverProfile(
        {
          readRun: jest.fn(async () =>
            createRunFixture({
              maxDrivers: 1,
            drivers: {
              driver_existing: {
                profile: {
                  name: 'Ava',
                  carMake: 'Toyota',
                  carModel: 'GR86',
                  fuelType: 'petrol',
                },
                joinedAt: 1,
                leftAt: null,
              },
            },
            })
          ),
          claimDriverSlot: jest.fn(async () => ({ joined: false, reason: 'full' as const })),
        },
        'run_123',
        {
          name: 'Liam',
          carMake: 'Ford',
          carModel: 'Mustang GT',
          fuelType: 'petrol',
        }
      )
    ).rejects.toThrow('This run is full.');
  });

  it('rejects joining when the run has already ended', async () => {
    await expect(
      saveDriverProfile(
        {
          readRun: jest.fn(async () => createRunFixture({ status: 'ended', drivers: {} })),
          claimDriverSlot: jest.fn(async () => ({ joined: false, reason: 'ended' as const })),
        },
        'run_123',
        {
          name: 'Liam',
          carMake: 'Ford',
          carModel: 'Mustang GT',
          fuelType: 'petrol',
        }
      )
    ).rejects.toThrow('This run has already ended.');
  });

  it('rejects joining when the run no longer exists', async () => {
    await expect(
      saveDriverProfile(
        {
          readRun: jest.fn(async () => null),
          claimDriverSlot: jest.fn(async () => ({ joined: false, reason: 'missing' as const })),
        },
        'run_123',
        {
          name: 'Liam',
          carMake: 'Ford',
          carModel: 'Mustang GT',
          fuelType: 'petrol',
        }
      )
    ).rejects.toThrow('This run is no longer available.');
  });

  it('shows a rules-focused error when join permissions are blocked', async () => {
    await expect(
      saveDriverProfile(
        {
          readRun: jest.fn(async () => createRunFixture({ drivers: {} })),
          claimDriverSlot: jest.fn(async () => ({ joined: false, reason: 'missing' as const })),
          inspectRunForJoin: jest.fn(async () => 'forbidden' as const),
        },
        'run_123',
        {
          name: 'Liam',
          carMake: 'Ford',
          carModel: 'Mustang GT',
          fuelType: 'petrol',
        }
      )
    ).rejects.toThrow(
      'Join permissions are blocked. Deploy the latest Firebase Realtime Database rules and try again.'
    );
  });

  it('shows a retry message when the run still exists but the join transaction does not commit', async () => {
    await expect(
      saveDriverProfile(
        {
          readRun: jest.fn(async () => createRunFixture({ drivers: {} })),
          claimDriverSlot: jest.fn(async () => ({ joined: false, reason: 'missing' as const })),
          inspectRunForJoin: jest.fn(async () => 'exists' as const),
        },
        'run_123',
        {
          name: 'Liam',
          carMake: 'Ford',
          carModel: 'Mustang GT',
          fuelType: 'petrol',
        }
      )
    ).rejects.toThrow('Unable to join this run right now. Refresh and try again.');
  });

  it('treats an existing driver slot for the same uid as a successful join', async () => {
    const result = await saveDriverProfile(
      {
        readRun: jest.fn(async () =>
          createRunFixture({
          drivers: {
            uid_driver_2: {
              profile: {
                name: 'Liam',
                carMake: 'Ford',
                carModel: 'Mustang GT',
                fuelType: 'petrol',
              },
              joinedAt: 1,
              leftAt: null,
            },
          },
          })
        ),
        claimDriverSlot: jest.fn(async () => ({ joined: false, reason: 'exists' as const })),
      },
      'run_123',
      {
        name: 'Liam',
        carMake: 'Ford',
        carModel: 'Mustang GT',
        fuelType: 'petrol',
      },
      {
        driverId: 'uid_driver_2',
      }
    );

    expect(result.driverId).toBe('uid_driver_2');
  });
});
