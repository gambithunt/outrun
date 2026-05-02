import {
  ensureAuthenticatedUser,
  linkAnonymousAccount,
  requireAuthenticatedUserId,
  sendPasswordResetEmailWithFirebase,
  signOutToGuestOrSignedOutState,
} from '@/lib/auth';
import { sendPasswordResetEmail } from 'firebase/auth';

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

  it('sends a password reset email for an existing account', async () => {
    await expect(
      sendPasswordResetEmailWithFirebase('jamie@example.com', {
        EXPO_PUBLIC_FIREBASE_API_KEY: 'api-key',
        EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'auth-domain',
        EXPO_PUBLIC_FIREBASE_DATABASE_URL: 'database-url',
        EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'project-id',
        EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'storage-bucket',
        EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'sender-id',
        EXPO_PUBLIC_FIREBASE_APP_ID: 'app-id',
      })
    ).resolves.toBeUndefined();

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'jamie@example.com');
  });
});
