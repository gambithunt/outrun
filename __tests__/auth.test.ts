import {
  ensureAuthenticatedUser,
  linkAnonymousAccount,
  requireAuthenticatedUserId,
  signOutToGuestOrSignedOutState,
} from '@/lib/auth';

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

  it('links the current anonymous user to an email/password account', async () => {
    const link = jest.fn(async () => ({
      user: {
        uid: 'uid_existing_anonymous',
      },
    }));

    await expect(
      linkAnonymousAccount(
        {
          currentUser: {
            uid: 'uid_existing_anonymous',
            isAnonymous: true,
          },
        },
        {
          email: 'jamie@example.com',
          password: 'secret123',
        },
        link
      )
    ).resolves.toEqual({
      uid: 'uid_existing_anonymous',
    });

    expect(link).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'uid_existing_anonymous',
        isAnonymous: true,
      }),
      {
        email: 'jamie@example.com',
        password: 'secret123',
      }
    );
  });

  it('signs out then restores guest access by re-authenticating anonymously', async () => {
    const signOut = jest.fn(async () => undefined);
    const signIn = jest.fn(async () => ({
      user: {
        uid: 'uid_guest_after_sign_out',
      },
    }));

    await expect(
      signOutToGuestOrSignedOutState(
        {
          currentUser: {
            uid: 'uid_account',
            isAnonymous: false,
          },
        },
        signOut,
        signIn
      )
    ).resolves.toEqual({
      uid: 'uid_guest_after_sign_out',
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
