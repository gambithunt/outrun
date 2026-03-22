import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ShellScreen } from '@/components/shell/ShellScreen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAuthSession } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { listRecentCrewWithFirebase } from '@/lib/recentCrewService';
import { useRunSessionStore } from '@/stores/runSessionStore';
import { RecentCrewContact } from '@/types/domain';

export default function FriendsScreen() {
  const router = useRouter();
  const auth = useAuthSession();
  const { theme } = useAppTheme();
  const account = useRunSessionStore((state) => state.account);
  const [contacts, setContacts] = useState<RecentCrewContact[]>([]);
  const signedInUserId = account?.userId ?? (auth.isAnonymous ? null : auth.userId);
  const isSignedIn = Boolean(signedInUserId);

  useEffect(() => {
    if (!signedInUserId) {
      setContacts([]);
      return;
    }

    let cancelled = false;

    void listRecentCrewWithFirebase(signedInUserId)
      .then((nextContacts) => {
        if (!cancelled) {
          setContacts(nextContacts);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContacts([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [signedInUserId]);

  return (
    <ShellScreen activeTab="friends" testID="screen-friends">
      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' }}>
          Friends
        </Text>
        <Text style={{ color: theme.colors.textPrimary, fontSize: 34, fontWeight: '800', letterSpacing: -1 }}>
          Recent Crew
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 17, lineHeight: 24 }}>
          The people you’ve driven with most recently, ready for the next invite.
        </Text>
      </View>

      {!isSignedIn ? (
        <AppCard>
          <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '800' }}>
            Sign in to keep your crew
          </Text>
          <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
            Recent crew is tied to your saved profile so it follows you across runs.
          </Text>
        </AppCard>
      ) : contacts.length === 0 ? (
        <AppCard>
          <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '800' }}>
            No crew yet
          </Text>
          <Text style={{ color: theme.colors.textSecondary, lineHeight: 22 }}>
            Finish a run with other signed-in drivers and they’ll appear here.
          </Text>
        </AppCard>
      ) : (
        contacts.map((contact) => (
          <AppCard key={contact.userId}>
            <Text style={{ color: theme.colors.textPrimary, fontSize: 24, fontWeight: '800' }}>
              {contact.displayName}
            </Text>
            {contact.homeClub ? (
              <Text style={{ color: theme.colors.textSecondary }}>{contact.homeClub}</Text>
            ) : null}
            <Text style={{ color: theme.colors.textSecondary }}>
              {contact.lastRunName ? `Last drove: ${contact.lastRunName}` : 'Crew contact'}
            </Text>
            <AppButton
              label="Invite Again"
              onPress={() =>
                router.push({
                  pathname: '/create',
                  params: {
                    invitedUserIds: contact.userId,
                  },
                })
              }
              size="compact"
              testID={`button-invite-again-${contact.userId}`}
            />
          </AppCard>
        ))
      )}
    </ShellScreen>
  );
}
