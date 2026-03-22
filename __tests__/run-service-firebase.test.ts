jest.mock('@/lib/auth', () => ({
  requireAuthenticatedUserIdWithFirebase: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  getFirebaseDatabase: jest.fn(() => 'mock-db'),
}));

jest.mock('firebase/database', () => ({
  child: jest.fn((_, path: string) => path),
  get: jest.fn(),
  push: jest.fn(() => ({ key: 'run_generated' })),
  ref: jest.fn(() => 'root-ref'),
  set: jest.fn(),
}));

import { requireAuthenticatedUserIdWithFirebase } from '@/lib/auth';
import { createRunWithFirebase, resolveJoinCodeWithFirebase } from '@/lib/runService';
import { get } from 'firebase/database';

describe('runService firebase operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (requireAuthenticatedUserIdWithFirebase as jest.Mock).mockResolvedValue('uid_admin_1');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('times out createRunWithFirebase when Firebase does not respond', async () => {
    (get as jest.Mock).mockImplementation(() => new Promise(() => {}));

    const pending = createRunWithFirebase({
      name: 'Saturday Drive',
      description: '',
      maxDrivers: 5,
    });
    const expectation = expect(pending).rejects.toThrow(
      'ClubRun could not reach Firebase. Check your connection and Firebase setup, then try again.'
    );

    await jest.advanceTimersByTimeAsync(12_000);

    await expectation;
  });

  it('times out resolveJoinCodeWithFirebase when Firebase does not respond', async () => {
    (get as jest.Mock).mockImplementation(() => new Promise(() => {}));

    const pending = resolveJoinCodeWithFirebase('123456');
    const expectation = expect(pending).rejects.toThrow(
      'ClubRun could not reach Firebase. Check your connection and Firebase setup, then try again.'
    );

    await jest.advanceTimersByTimeAsync(12_000);

    await expectation;
  });
});
