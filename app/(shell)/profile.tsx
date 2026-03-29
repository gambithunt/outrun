import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ShellScreen } from '@/components/shell/ShellScreen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuthSession } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import {
  signInWithEmailPassword,
  signOutToGuestOrSignedOutStateWithFirebase,
  signUpWithEmailPassword,
} from '@/lib/auth';
import {
  listGarageCarsWithFirebase,
  loadUserProfileWithFirebase,
  saveGarageCarWithFirebase,
  saveUserProfileWithFirebase,
} from '@/lib/userProfileService';
import { GarageCar, UserProfile } from '@/types/domain';

type AuthMode = 'idle' | 'sign-up' | 'sign-in';

export default function ProfileScreen() {
  const router = useRouter();
  const auth = useAuthSession();
  const { theme } = useAppTheme();
  const [mode, setMode] = useState<AuthMode>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [homeClub, setHomeClub] = useState('');
  const [nickname, setNickname] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [garage, setGarage] = useState<GarageCar[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignedIn = Boolean(auth.userId && !auth.isAnonymous);

  useEffect(() => {
    if (!isSignedIn || !auth.userId) {
      setProfile(null);
      setGarage([]);
      return;
    }

    let cancelled = false;

    void Promise.all([
      loadUserProfileWithFirebase(auth.userId),
      listGarageCarsWithFirebase(auth.userId),
    ])
      .then(([nextProfile, nextGarage]) => {
        if (cancelled) {
          return;
        }

        setProfile(nextProfile);
        setGarage(nextGarage);
        if (nextProfile) {
          setDisplayName(nextProfile.displayName);
          setHomeClub(nextProfile.homeClub ?? '');
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to load your profile.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [auth.userId, isSignedIn]);

  const stats = useMemo(
    () => profile?.stats ?? { totalRuns: 0, totalDistanceKm: 0, hazardsReported: 0 },
    [profile]
  );

  async function handleSignUp() {
    setIsBusy(true);
    setError(null);

    try {
      const user = await signUpWithEmailPassword(email, password);
      if (!user?.uid) {
        throw new Error('Unable to create your account.');
      }
      await saveUserProfileWithFirebase(user.uid, {
        displayName,
        homeClub,
      });
      await auth.refreshSession();
      setMode('idle');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create your account.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignIn() {
    setIsBusy(true);
    setError(null);

    try {
      await signInWithEmailPassword(email, password);
      await auth.refreshSession();
      setMode('idle');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to sign in.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSaveProfile() {
    if (!auth.userId) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const nextProfile = await saveUserProfileWithFirebase(auth.userId, {
        displayName,
        homeClub,
      });
      setProfile(nextProfile);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save your profile.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAddGarageCar() {
    if (!auth.userId) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const car = await saveGarageCarWithFirebase(auth.userId, {
        nickname,
        make,
        model,
        fuelType: 'petrol',
      });
      setGarage((current) => [car, ...current]);
      setNickname('');
      setMake('');
      setModel('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save this car.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    setIsBusy(true);
    setError(null);

    try {
      await signOutToGuestOrSignedOutStateWithFirebase();
      await auth.refreshSession();
      setMode('idle');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to sign out.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ShellScreen activeTab="profile" testID="screen-profile">
      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' }}>
          Profile
        </Text>
        <Text style={{ color: theme.colors.textPrimary, fontSize: 34, fontWeight: '800', letterSpacing: -1 }}>
          Profile
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 17, lineHeight: 24 }}>
          Saved identity, garage, stats, and the settings that follow your runs.
        </Text>
      </View>

      {!isSignedIn ? (
        <AppCard>
          <Text style={{ color: theme.colors.textPrimary, fontSize: 26, fontWeight: '800' }}>
            Guest mode
          </Text>
          <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
            Keep the fast join flow, then sign in when you want your profile, garage, and recent crew to stick.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <AppButton
                label="Sign Up"
                onPress={() => setMode('sign-up')}
                testID="button-open-sign-up"
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton
                label="Sign In"
                onPress={() => setMode('sign-in')}
                variant="secondary"
                testID="button-open-sign-in"
              />
            </View>
          </View>

          {mode !== 'idle' ? (
            <View style={{ gap: 14 }}>
              {mode === 'sign-up' ? (
                <>
                  <AppTextInput
                    label="Display name"
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Jamie"
                    testID="input-account-display-name"
                  />
                  <AppTextInput
                    label="Home club"
                    value={homeClub}
                    onChangeText={setHomeClub}
                    placeholder="Night Shift"
                    testID="input-account-home-club"
                  />
                </>
              ) : null}
              <AppTextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                placeholder="jamie@example.com"
                testID="input-account-email"
              />
              <AppTextInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                secureTextEntry
                placeholder="••••••••"
                testID="input-account-password"
              />
              <AppButton
                label={mode === 'sign-up' ? 'Create Account' : 'Sign In'}
                onPress={mode === 'sign-up' ? handleSignUp : handleSignIn}
                testID="button-submit-account-auth"
              />
            </View>
          ) : null}
        </AppCard>
      ) : (
        <>
          <AppCard>
            <Text style={{ color: theme.colors.textSecondary, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Signed in
            </Text>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 28, fontWeight: '800' }}>
              {profile?.displayName ?? auth.email ?? 'ClubRun driver'}
            </Text>
            <Text style={{ color: theme.colors.textSecondary }}>
              {profile?.homeClub ?? 'No home club yet'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <StatBadge label="Runs" value={stats.totalRuns} />
              <StatBadge label="Distance" value={`${stats.totalDistanceKm.toFixed(1)} km`} />
              <StatBadge label="Hazards" value={stats.hazardsReported} />
            </View>
          </AppCard>

          <AppCard>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '800' }}>
              Identity
            </Text>
            <AppTextInput
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Jamie"
              testID="input-profile-display-name"
            />
            <AppTextInput
              label="Home club"
              value={homeClub}
              onChangeText={setHomeClub}
              placeholder="Night Shift"
              testID="input-profile-home-club"
            />
            <AppButton label="Save Profile" onPress={handleSaveProfile} testID="button-save-account-profile" />
          </AppCard>

          <AppCard>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '800' }}>
              Garage
            </Text>
            {garage.length > 0 ? (
              garage.map((car) => (
                <View
                  key={car.id}
                  style={{
                    borderRadius: 18,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    padding: 14,
                    gap: 4,
                  }}
                >
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '800' }}>{car.nickname}</Text>
                  <Text style={{ color: theme.colors.textSecondary }}>
                    {car.make} {car.model}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: theme.colors.textSecondary }}>No saved cars yet.</Text>
            )}
            <AppTextInput
              label="Car nickname"
              value={nickname}
              onChangeText={setNickname}
              placeholder="Daily"
              testID="input-garage-nickname"
            />
            <AppTextInput
              label="Make"
              value={make}
              onChangeText={setMake}
              placeholder="BMW"
              testID="input-garage-make"
            />
            <AppTextInput
              label="Model"
              value={model}
              onChangeText={setModel}
              placeholder="M2"
              testID="input-garage-model"
            />
            <AppButton label="Add Car" onPress={handleAddGarageCar} testID="button-add-garage-car" />
          </AppCard>

          <AppCard>
            <AppButton label="Open Settings" onPress={() => router.push('/settings')} variant="secondary" />
            <AppButton label="Sign Out" onPress={handleSignOut} variant="ghost" />
          </AppCard>
        </>
      )}

      {isBusy ? <LoadingSpinner /> : null}
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
    </ShellScreen>
  );
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceElevated,
        paddingHorizontal: 14,
        paddingVertical: 12,
        minWidth: 112,
        gap: 4,
      }}
    >
      <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}
