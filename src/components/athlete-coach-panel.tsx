import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { Spacing } from '@/constants/theme';
import { DistanceUnit, RaceStroke } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { formatGymBlock, formatSetStep, gymModeLabel } from '@/i18n/format';
import { useAuth } from '@/state/auth-context';
import { usePlan } from '@/state/plan-context';
import { fetchThread, fetchTeamChat, sendMessage, sendTeamMessage } from '@/supabase/chat';
import { addResult, fetchAthleteResults } from '@/supabase/results';
import { acceptInvite, declineInvite, fetchMyActiveTeam, fetchMyInvites, PendingInvite } from '@/supabase/team';
import { MessageRow, ResultRow, TeamMessageRow, TeamRow, WorkoutRow } from '@/supabase/types';
import { fetchAthleteWorkouts } from '@/supabase/workouts';

const RACE_STROKES: RaceStroke[] = ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'im'];

function WorkoutCard({ workout, unit }: { workout: WorkoutRow; unit: DistanceUnit }) {
  const { t } = useTranslation();
  return (
    <View style={styles.block}>
      <ThemedText type="smallBold">
        {workout.workout_date} · {workout.title}
      </ThemedText>
      {workout.pool_warmup && workout.pool_main && workout.pool_cooldown && (
        <View style={styles.nested}>
          {(['pool_warmup', 'pool_main', 'pool_cooldown'] as const).map((key) => (
            <View key={key}>
              {(workout[key] ?? []).map((step, i) => (
                <ThemedText key={i} type="small">
                  • {formatSetStep(step, t, unit)}
                </ThemedText>
              ))}
            </View>
          ))}
        </View>
      )}
      {workout.gym_blocks && workout.gym_focus && (
        <View style={styles.nested}>
          <ThemedText type="small" themeColor="textSecondary">
            {t(`gymFocus.${workout.gym_focus}`)} · {gymModeLabel('swimDryland', t)}
          </ThemedText>
          {workout.gym_blocks.map((block, i) => (
            <ThemedText key={i} type="small">
              • {formatGymBlock(block, t)}
            </ThemedText>
          ))}
        </View>
      )}
      {workout.coach_note && (
        <ThemedText type="small" themeColor="textSecondary">
          {workout.coach_note}
        </ThemedText>
      )}
    </View>
  );
}

export function AthleteCoachPanel() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const { profile } = usePlan();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [thread, setThread] = useState<MessageRow[]>([]);
  const [teamChat, setTeamChat] = useState<TeamMessageRow[]>([]);
  const [distance, setDistance] = useState(100);
  const [stroke, setStroke] = useState<RaceStroke>('freestyle');
  const [minutes, setMinutes] = useState(1);
  const [seconds, setSeconds] = useState(30);
  const [directBody, setDirectBody] = useState('');
  const [teamBody, setTeamBody] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function refresh(athleteId: string) {
    setInvites(await fetchMyInvites(athleteId));
    const myTeam = await fetchMyActiveTeam(athleteId);
    setTeam(myTeam);
    setResults(await fetchAthleteResults(athleteId));
    if (myTeam) {
      setWorkouts(await fetchAthleteWorkouts(athleteId));
      setThread(await fetchThread(myTeam.coach_id, athleteId));
      setTeamChat(await fetchTeamChat(myTeam.id));
    }
  }

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    // refresh() sets several pieces of state as each fetch resolves — the compiler's static
    // check can't see into it to confirm those are all safely gated, but React 19 (this app's
    // target) no longer warns or errors on a state update after unmount, it's simply a no-op,
    // so the risk this rule guards against doesn't apply here; the `cancelled` flag below still
    // gates the one state update that matters for correctness (not flashing stale content).
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

  async function handleAccept(teamId: string) {
    if (!session) return;
    await acceptInvite(teamId, session.user.id);
    refresh(session.user.id);
  }

  async function handleDecline(teamId: string) {
    if (!session) return;
    await declineInvite(teamId, session.user.id);
    refresh(session.user.id);
  }

  async function handleLogResult() {
    if (!session) return;
    await addResult({
      athlete_id: session.user.id,
      coach_id: null,
      distance,
      stroke,
      time_sec: minutes * 60 + seconds,
      result_date: new Date().toISOString().slice(0, 10),
      note: null,
    });
    setResults(await fetchAthleteResults(session.user.id));
  }

  async function handleSendDirect() {
    if (!session || !team || !directBody.trim()) return;
    await sendMessage(team.coach_id, session.user.id, session.user.id, directBody.trim());
    setDirectBody('');
    setThread(await fetchThread(team.coach_id, session.user.id));
  }

  async function handleSendTeam() {
    if (!session || !team || !teamBody.trim()) return;
    await sendTeamMessage(team.id, session.user.id, teamBody.trim());
    setTeamBody('');
    setTeamChat(await fetchTeamChat(team.id));
  }

  return (
    <>
      {invites.length > 0 && (
        <Collapsible title={t('athleteCoach.invitesTitle')}>
          {invites.map((inv) => (
            <View key={inv.team_id} style={styles.row}>
              <ThemedText type="small">{t('athleteCoach.invitedTo', { team: inv.teamName })}</ThemedText>
              <View style={styles.row}>
                <Pressable onPress={() => handleAccept(inv.team_id)} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText type="link">{t('athleteCoach.accept')}</ThemedText>
                </Pressable>
                <Pressable onPress={() => handleDecline(inv.team_id)} style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText type="link">{t('athleteCoach.decline')}</ThemedText>
                </Pressable>
              </View>
            </View>
          ))}
        </Collapsible>
      )}

      {team && (
        <Collapsible title={t('athleteCoach.myTeam', { team: team.name })}>
          <View style={styles.block}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('athleteCoach.workoutsTitle')}
            </ThemedText>
            {workouts.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('athleteCoach.workoutsEmpty')}
              </ThemedText>
            ) : (
              workouts.map((w) => <WorkoutCard key={w.id} workout={w} unit={profile?.unit ?? 'meters'} />)
            )}
          </View>

          <View style={styles.block}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('athleteCoach.resultsTitle')}
            </ThemedText>
            {results.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('athleteCoach.resultsEmpty')}
              </ThemedText>
            ) : (
              results.map((r) => (
                <ThemedText key={r.id} type="small">
                  {r.result_date} · {r.distance}m {t(`stroke.${r.stroke}`)} · {Math.floor(r.time_sec / 60)}:
                  {(r.time_sec % 60).toString().padStart(2, '0')}
                </ThemedText>
              ))
            )}
            <ChipGroup options={RACE_STROKES.map((s) => ({ value: s, label: t(`stroke.${s}`) }))} selected={[stroke]} onToggle={setStroke} />
            <Stepper value={distance} min={25} max={1500} step={25} onChange={setDistance} />
            <View style={styles.row}>
              <Stepper value={minutes} min={0} max={30} suffix={t('coach.results.minutes')} onChange={setMinutes} />
              <Stepper value={seconds} min={0} max={59} step={5} suffix={t('coach.results.seconds')} onChange={setSeconds} />
            </View>
            <Pressable onPress={handleLogResult} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.button}>
                <ThemedText type="smallBold">{t('athleteCoach.addResult')}</ThemedText>
              </ThemedView>
            </Pressable>
          </View>

          <View style={styles.block}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('athleteCoach.chatWithCoach')}
            </ThemedText>
            {thread.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('coach.chat.empty')}
              </ThemedText>
            ) : (
              thread.map((m) => (
                <ThemedText key={m.id} type="small">
                  {m.sender_id === session.user.id ? '→ ' : '← '}
                  {m.body}
                </ThemedText>
              ))
            )}
            <TextInput
              value={directBody}
              onChangeText={setDirectBody}
              placeholder={t('coach.chat.placeholder')}
              placeholderTextColor={theme.textSecondary}
              style={[styles.textInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <Pressable onPress={handleSendDirect} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.button}>
                <ThemedText type="smallBold">{t('coach.chat.send')}</ThemedText>
              </ThemedView>
            </Pressable>
          </View>

          <View style={styles.block}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('athleteCoach.teamChatTitle')}
            </ThemedText>
            {teamChat.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('coach.chat.empty')}
              </ThemedText>
            ) : (
              teamChat.map((m) => (
                <ThemedText key={m.id} type="small">
                  {m.body}
                </ThemedText>
              ))
            )}
            <TextInput
              value={teamBody}
              onChangeText={setTeamBody}
              placeholder={t('coach.chat.placeholder')}
              placeholderTextColor={theme.textSecondary}
              style={[styles.textInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <Pressable onPress={handleSendTeam} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.button}>
                <ThemedText type="smallBold">{t('coach.chat.send')}</ThemedText>
              </ThemedView>
            </Pressable>
          </View>
        </Collapsible>
      )}
    </>
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
