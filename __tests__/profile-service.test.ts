import { loadDriverProfileDraft, saveDriverProfile, saveDriverProfileDraft, validateDriverProfileInput } from '@/lib/profileService';

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

    const result = await saveDriverProfile(
      { claimDriverSlot },
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

    const result = await saveDriverProfile(
      { claimDriverSlot },
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
});
