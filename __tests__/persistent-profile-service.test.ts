import {
  createEmptyUserStats,
  applyCompletedRunStats,
  saveGarageCar,
  saveUserProfile,
  validateGarageCarInput,
  validateUserProfileInput,
} from '@/lib/userProfileService';

describe('userProfileService', () => {
  it('validates the persistent user profile payload', () => {
    expect(() =>
      validateUserProfileInput({
        displayName: '',
        homeClub: 'Night Shift',
      })
    ).toThrow('Display name is required.');

    expect(
      validateUserProfileInput({
        displayName: 'Jamie',
        homeClub: 'Night Shift',
      })
    ).toEqual({
      displayName: 'Jamie',
      homeClub: 'Night Shift',
    });
  });

  it('validates a garage car payload', () => {
    expect(() =>
      validateGarageCarInput({
        nickname: '',
        make: 'Toyota',
        model: 'GR Yaris',
        fuelType: 'petrol',
      })
    ).toThrow('Car nickname is required.');

    expect(
      validateGarageCarInput({
        nickname: 'Weekend car',
        make: 'Toyota',
        model: 'GR Yaris',
        fuelType: 'petrol',
      })
    ).toEqual(
      expect.objectContaining({
        nickname: 'Weekend car',
        make: 'Toyota',
        model: 'GR Yaris',
        fuelType: 'petrol',
      })
    );
  });

  it('writes a normalized persistent profile with default stats', async () => {
    const writeUserProfile = jest.fn(async () => undefined);

    const result = await saveUserProfile(
      { writeUserProfile },
      'uid_123',
      {
        displayName: 'Jamie',
        homeClub: 'Night Shift',
      },
      {
        now: () => 1234,
      }
    );

    expect(result.stats).toEqual(createEmptyUserStats());
    expect(writeUserProfile).toHaveBeenCalledWith(
      'uid_123',
      expect.objectContaining({
        displayName: 'Jamie',
        homeClub: 'Night Shift',
        createdAt: 1234,
        updatedAt: 1234,
      })
    );
  });

  it('writes a normalized garage car for the current user', async () => {
    const writeGarageCar = jest.fn(async () => undefined);

    const result = await saveGarageCar(
      { writeGarageCar },
      'uid_123',
      {
        nickname: 'Daily',
        make: 'BMW',
        model: 'M2',
        fuelType: 'petrol',
      },
      {
        now: () => 555,
        random: () => 0.123456,
      }
    );

    expect(result.id).toMatch(/^car_/);
    expect(writeGarageCar).toHaveBeenCalledWith(
      'uid_123',
      result.id,
      expect.objectContaining({
        nickname: 'Daily',
        make: 'BMW',
        model: 'M2',
        createdAt: 555,
        updatedAt: 555,
      })
    );
  });

  it('applies completed run stats to the persistent profile totals', () => {
    const updated = applyCompletedRunStats(
      {
        displayName: 'Jamie',
        createdAt: 1,
        updatedAt: 1,
        stats: createEmptyUserStats(),
      },
      {
        userId: 'uid_123',
        totalDistanceKm: 84.2,
        hazardsReported: 2,
        mostUsedCarId: 'car_1',
      },
      999
    );

    expect(updated.stats).toEqual({
      totalRuns: 1,
      totalDistanceKm: 84.2,
      hazardsReported: 2,
      mostUsedCarId: 'car_1',
    });
    expect(updated.updatedAt).toBe(999);
  });
});
