import { ensureAuthenticatedUser, requireAuthenticatedUserId } from '@/lib/auth';

describe('auth helpers', () => {
  it('returns the existing firebase user when one is already signed in', async () => {
    const signIn = jest.fn();

    const user = await ensureAuthenticatedUser(
      {
        currentUser: {
          uid: 'uid_existing',
        },
      },
      signIn
    );

    expect(user).toEqual({
      uid: 'uid_existing',
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it('signs in anonymously when no firebase user exists yet', async () => {
    const signIn = jest.fn(async () => ({
      user: {
        uid: 'uid_anonymous',
      },
    }));

    await expect(
      requireAuthenticatedUserId(
        {
          currentUser: null,
        },
        signIn
      )
    ).resolves.toBe('uid_anonymous');
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
