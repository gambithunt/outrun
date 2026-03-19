jest.mock('@/lib/auth', () => ({
  requireAuthenticatedUserIdWithFirebase: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  getFirebaseDatabase: jest.fn(() => 'mock-db'),
}));

jest.mock('firebase/database', () => ({
  child: jest.fn((_, path: string) => path),
  get: jest.fn(),
  ref: jest.fn(() => 'root-ref'),
  set: jest.fn(),
}));

import { requireAuthenticatedUserIdWithFirebase } from '@/lib/auth';
import { reopenRoutePlannerFromLobbyWithFirebase } from '@/lib/routeService';
import { set } from 'firebase/database';

describe('routeService firebase writes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAuthenticatedUserIdWithFirebase as jest.Mock).mockResolvedValue('driver_admin');
  });

  it('ensures Firebase auth before reopening route planning from the lobby', async () => {
    await reopenRoutePlannerFromLobbyWithFirebase('run_123');

    expect(requireAuthenticatedUserIdWithFirebase).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('runs/run_123/status', 'draft');
  });
});
