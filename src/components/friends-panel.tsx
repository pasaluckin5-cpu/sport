import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { Spacing } from '@/constants/theme';
import { RaceStroke } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { friendResultProgressText } from '@/i18n/format';
import { useAuth } from '@/state/auth-context';
import { usePlan } from '@/state/plan-context';
import {
  acceptFriendRequest,
  addFriendByEmail,
  fetchAcceptedFriends,
  fetchFriendResults,
  fetchIncomingRequests,
  Friend,
  IncomingRequest,
  removeFriendship,
} from '@/supabase/friends';
import { ResultRow } from '@/supabase/types';

export function FriendsPanel() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const { profile } = usePlan();
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [resultsByFriend, setResultsByFriend] = useState<Record<string, ResultRow[]>>({});
  const [addEmail, setAddEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function refresh(myId: string) {
    setRequests(await fetchIncomingRequests(myId));
    const friendList = await fetchAcceptedFriends(myId);
    setFriends(friendList);
    const entries = await Promise.all(friendList.map(async (f) => [f.id, await fetchFriendResults(f.id)] as const));
    setResultsByFriend(Object.fromEntries(entries));
  }

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    // See athlete-coach-panel.tsx for why this eslint-disable is safe: refresh() sets several
    // pieces of state as fetches resolve, which the compiler's static check can't verify are all
    // gated, but React 19 no-ops a state update after unmount rather than warning/erroring.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(session.user.id).then(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  if (!session || !loaded) return null;

  async function handleAdd() {
    if (!addEmail.trim()) return;
    const { error } = await addFriendByEmail(addEmail.trim());
    setMessage(error ?? t('friends.requestSent'));
    if (!error) {
      setAddEmail('');
      refresh(session!.user.id);
    }
  }

  async function handleAccept(requesterId: string) {
    await acceptFriendRequest(requesterId, session!.user.id);
    refresh(session!.user.id);
  }

  async function handleRemove(otherId: string) {
    await removeFriendship(otherId, session!.user.id);
    refresh(session!.user.id);
  }

  return (
    <Collapsible title={t('friends.title')}>
      <View style={styles.block}>
        <TextInput
          value={addEmail}
          onChangeText={setAddEmail}
          placeholder={t('friends.addEmailLabel')}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.textInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <Pressable onPress={handleAdd} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.button}>
            <ThemedText type="smallBold">{t('friends.add')}</ThemedText>
          </ThemedView>
        </Pressable>
        {message && (
          <ThemedText type="small" themeColor="textSecondary">
            {message}
          </ThemedText>
        )}
      </View>

      {requests.length > 0 && (
        <View style={styles.block}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('friends.requestsTitle')}
          </ThemedText>
          {requests.map((r) => (
            <View key={r.requesterId} style={styles.row}>
              <ThemedText type="small">{r.requesterEmail}</ThemedText>
              <View style={styles.row}>
                <Pressable onPress={() => handleAccept(r.requesterId)} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText type="link">{t('friends.accept')}</ThemedText>
                </Pressable>
                <Pressable onPress={() => handleRemove(r.requesterId)} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText type="link">{t('friends.decline')}</ThemedText>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {friends.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('friends.empty')}
        </ThemedText>
      ) : (
        friends.map((f) => (
          <View key={f.id} style={styles.block}>
            <View style={styles.row}>
              <ThemedText type="smallBold">{f.email}</ThemedText>
              <Pressable onPress={() => handleRemove(f.id)} style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="link">{t('friends.remove')}</ThemedText>
              </Pressable>
            </View>
            {(resultsByFriend[f.id] ?? []).length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('friends.noResults')}
              </ThemedText>
            ) : (
              (resultsByFriend[f.id] ?? []).map((r) => {
                const goalLine = f.gender
                  ? friendResultProgressText(f.gender, r.stroke as RaceStroke, r.distance, r.time_sec, profile?.unit ?? 'meters', t).goal
                  : null;
                return (
                  <View key={r.id} style={styles.nested}>
                    <ThemedText type="small">
                      {r.result_date} · {r.distance}m {t(`stroke.${r.stroke}`)} · {Math.floor(r.time_sec / 60)}:
                      {(r.time_sec % 60).toString().padStart(2, '0')}
                    </ThemedText>
                    {goalLine && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {goalLine}
                      </ThemedText>
                    )}
                  </View>
                );
              })
            )}
          </View>
        ))
      )}
    </Collapsible>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  nested: {
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    fontSize: 14,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
});
