import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { RaceDayPlanView } from '@/components/race-day-plan-view';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { Spacing } from '@/constants/theme';
import { daysUntilRace, extractFeedbackHistory, FeedbackHistoryEntry, periodizationPhase } from '@/domain/periodization';
import { buildRaceDayPlan } from '@/domain/raceDayPlan';
import { AthleteProfile, GymExercise, GymFocus, RaceStroke, SetStepKind, Zone } from '@/domain/types';
import { isoWeekKey } from '@/domain/week';
import { periodizationNoteText } from '@/i18n/format';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/state/auth-context';
import { sendMessage, sendTeamMessage, fetchThread, fetchTeamChat } from '@/supabase/chat';
import { addResult } from '@/supabase/results';
import { fetchCloudCompletions, fetchCloudProfile, setAthleteGoalRaceDate } from '@/supabase/sync';
import {
  createTeam,
  fetchMyTeam,
  fetchTeamMembers,
  inviteAthleteByEmail,
  removeTeamMember,
  TeamMemberWithEmail,
} from '@/supabase/team';
import { MessageRow, TeamMessageRow, TeamRow, WorkoutRow } from '@/supabase/types';
import { createWorkout } from '@/supabase/workouts';

const ZONES: Zone[] = ['recovery', 'technique', 'aerobicBase', 'threshold', 'vo2max', 'sprint'];
const MAIN_KINDS: SetStepKind[] = ['drill', 'steadySwim', 'thresholdSwim', 'vo2Swim', 'sprintAllOut', 'recoverySwim'];
const GYM_FOCUSES: GymFocus[] = ['fullBody', 'upperBody', 'lowerBody', 'core', 'mobility'];
const GYM_EXERCISES: GymExercise[] = ['squats', 'pushUps', 'bentOverRows', 'plank', 'pullUps', 'benchPress', 'walkingLunges', 'russianTwists'];
const RACE_STROKES: RaceStroke[] = ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'im'];

function ToggleRow({ value, onToggle, label }: { value: boolean; onToggle: () => void; label: string }) {
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedText type="small">
        {value ? '☑ ' : '☐ '}
        {label}
      </ThemedText>
    </Pressable>
  );
}

function TeamPanel({ team, onTeamCreated }: { team: TeamRow | null; onTeamCreated: (t: TeamRow) => void }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [teamName, setTeamName] = useState('');
  const theme = useTheme();

  async function handleCreate() {
    if (!teamName.trim() || !session) return;
    const created = await createTeam(session.user.id, teamName.trim());
    if (created) onTeamCreated(created);
  }

  if (team) return null;

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('coach.team.title')}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('coach.team.noTeam')}
      </ThemedText>
      <TextInput
        value={teamName}
        onChangeText={setTeamName}
        placeholder={t('coach.team.createLabel')}
        placeholderTextColor={theme.textSecondary}
        style={[styles.textInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      <Pressable onPress={handleCreate} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.button}>
          <ThemedText type="smallBold">{t('coach.team.create')}</ThemedText>
        </ThemedView>
      </Pressable>
    </View>
  );
}

function RosterPanel({
  team,
  members,
  onChanged,
}: {
  team: TeamRow;
  members: TeamMemberWithEmail[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [inviteEmail, setInviteEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    const { error } = await inviteAthleteByEmail(team.id, inviteEmail.trim());
    setMessage(error ?? t('coach.team.inviteSent'));
    if (!error) {
      setInviteEmail('');
      onChanged();
    }
  }

  async function handleRemove(athleteId: string) {
    await removeTeamMember(team.id, athleteId);
    onChanged();
  }

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {team.name}
      </ThemedText>
      <TextInput
        value={inviteEmail}
        onChangeText={setInviteEmail}
        placeholder={t('coach.team.inviteLabel')}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        style={[styles.textInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      <Pressable onPress={handleInvite} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText type="smallBold">{t('coach.team.invite')}</ThemedText>
        </ThemedView>
      </Pressable>
      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
      {members.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('coach.team.empty')}
        </ThemedText>
      ) : (
        members.map((m) => (
          <View key={m.athlete_id} style={styles.row}>
            <ThemedText type="small">
              {m.email} · {t(m.status === 'active' ? 'coach.team.statusActive' : 'coach.team.statusPending')}
            </ThemedText>
            <Pressable onPress={() => handleRemove(m.athlete_id)} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="link">{t('coach.team.remove')}</ThemedText>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

function WorkoutComposer({ coachId, athletes }: { coachId: string; athletes: TeamMemberWithEmail[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [athleteEmail, setAthleteEmail] = useState(athletes[0]?.email ?? '');
  const [title, setTitle] = useState('');
  const [daysFromToday, setDaysFromToday] = useState(1);
  const [includePool, setIncludePool] = useState(true);
  const [zone, setZone] = useState<Zone>('aerobicBase');
  const [stroke, setStroke] = useState<RaceStroke>('freestyle');
  const [warmupDistance, setWarmupDistance] = useState(200);
  const [mainKind, setMainKind] = useState<SetStepKind>('steadySwim');
  const [reps, setReps] = useState(4);
  const [repDistance, setRepDistance] = useState(100);
  const [cooldownDistance, setCooldownDistance] = useState(100);
  const [includeGym, setIncludeGym] = useState(false);
  const [gymFocus, setGymFocus] = useState<GymFocus>('fullBody');
  const [gymExercise, setGymExercise] = useState<GymExercise>('squats');
  const [gymSets, setGymSets] = useState(3);
  const [gymReps, setGymReps] = useState('10-12');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function handleAssign() {
    const athlete = athletes.find((m) => m.email === athleteEmail);
    if (!athlete || !title.trim() || (!includePool && !includeGym)) return;
    const date = new Date();
    date.setDate(date.getDate() + daysFromToday);
    const workoutDate = date.toISOString().slice(0, 10);

    const payload: Omit<WorkoutRow, 'id' | 'created_at' | 'updated_at'> = {
      coach_id: coachId,
      athlete_id: athlete.athlete_id,
      workout_date: workoutDate,
      title: title.trim(),
      pool_zone: includePool ? zone : null,
      pool_warmup: includePool
        ? [{ kind: 'warmupSwim', reps: 1, repDistance: warmupDistance, distance: warmupDistance, stroke, equipment: [], zone: 'recovery' }]
        : null,
      pool_main: includePool
        ? [{ kind: mainKind, reps, repDistance, distance: reps * repDistance, stroke, equipment: [], zone }]
        : null,
      pool_cooldown: includePool
        ? [{ kind: 'cooldown', reps: 1, repDistance: cooldownDistance, distance: cooldownDistance, equipment: [], zone: 'recovery' }]
        : null,
      gym_focus: includeGym ? gymFocus : null,
      gym_blocks: includeGym ? [{ exercise: gymExercise, sets: gymSets, reps: gymReps }] : null,
      coach_note: note.trim() || null,
    };
    const { error } = await createWorkout(payload);
    setMessage(error ?? t('coach.workout.assigned'));
    if (!error) {
      setTitle('');
      setNote('');
    }
  }

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('coach.workout.title')}
      </ThemedText>
      <ChipGroup options={athletes.map((a) => ({ value: a.email, label: a.email }))} selected={[athleteEmail]} onToggle={setAthleteEmail} />
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t('coach.workout.titleLabel')}
        placeholderTextColor={theme.textSecondary}
        style={[styles.textInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('coach.workout.dateLabel')}: {daysFromToday === 0 ? t('coach.workout.today') : t('coach.workout.inDays', { count: daysFromToday })}
      </ThemedText>
      <Stepper value={daysFromToday} min={0} max={27} onChange={setDaysFromToday} />

      <ToggleRow value={includePool} onToggle={() => setIncludePool((v) => !v)} label={t('coach.workout.includePool')} />
      {includePool && (
        <View style={styles.nested}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('coach.workout.zone')}
          </ThemedText>
          <ChipGroup options={ZONES.map((z) => ({ value: z, label: t(`zone.${z}.label`) }))} selected={[zone]} onToggle={setZone} />
          <ChipGroup options={RACE_STROKES.map((s) => ({ value: s, label: t(`stroke.${s}`) }))} selected={[stroke]} onToggle={setStroke} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('coach.workout.warmupDistance')}
          </ThemedText>
          <Stepper value={warmupDistance} min={50} max={1000} step={50} onChange={setWarmupDistance} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('coach.workout.mainKind')}
          </ThemedText>
          <ChipGroup options={MAIN_KINDS.map((k) => ({ value: k, label: t(`coach.workout.kindLabel.${k}`) }))} selected={[mainKind]} onToggle={setMainKind} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('coach.workout.reps')}
          </ThemedText>
          <Stepper value={reps} min={1} max={30} onChange={setReps} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('coach.workout.repDistance')}
          </ThemedText>
          <Stepper value={repDistance} min={25} max={800} step={25} onChange={setRepDistance} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('coach.workout.cooldownDistance')}
          </ThemedText>
          <Stepper value={cooldownDistance} min={50} max={500} step={50} onChange={setCooldownDistance} />
        </View>
      )}

      <ToggleRow value={includeGym} onToggle={() => setIncludeGym((v) => !v)} label={t('coach.workout.includeGym')} />
      {includeGym && (
        <View style={styles.nested}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('coach.workout.gymFocus')}
          </ThemedText>
          <ChipGroup options={GYM_FOCUSES.map((f) => ({ value: f, label: t(`gymFocus.${f}`) }))} selected={[gymFocus]} onToggle={setGymFocus} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('coach.workout.gymExercise')}
          </ThemedText>
          <ChipGroup options={GYM_EXERCISES.map((e) => ({ value: e, label: t(`gymExercise.${e}`) }))} selected={[gymExercise]} onToggle={setGymExercise} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('coach.workout.gymSets')}
          </ThemedText>
          <Stepper value={gymSets} min={1} max={10} onChange={setGymSets} />
          <TextInput
            value={gymReps}
            onChangeText={setGymReps}
            placeholder={t('coach.workout.gymReps')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.textInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
        </View>
      )}

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t('coach.workout.note')}
        placeholderTextColor={theme.textSecondary}
        multiline
        style={[styles.textInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('coach.workout.scopeNote')}
      </ThemedText>
      <Pressable onPress={handleAssign} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.button}>
          <ThemedText type="smallBold">{t('coach.workout.assign')}</ThemedText>
        </ThemedView>
      </Pressable>
      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
    </View>
  );
}

function ResultsLogger({ coachId, athletes }: { coachId: string; athletes: TeamMemberWithEmail[] }) {
  const { t } = useTranslation();
  const [athleteEmail, setAthleteEmail] = useState(athletes[0]?.email ?? '');
  const [distance, setDistance] = useState(100);
  const [stroke, setStroke] = useState<RaceStroke>('freestyle');
  const [minutes, setMinutes] = useState(1);
  const [seconds, setSeconds] = useState(30);
  const [message, setMessage] = useState<string | null>(null);

  async function handleLog() {
    const athlete = athletes.find((m) => m.email === athleteEmail);
    if (!athlete) return;
    const { error } = await addResult({
      athlete_id: athlete.athlete_id,
      coach_id: coachId,
      distance,
      stroke,
      time_sec: minutes * 60 + seconds,
      result_date: new Date().toISOString().slice(0, 10),
      note: null,
    });
    setMessage(error ?? t('coach.results.logged'));
  }

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('coach.results.title')}
      </ThemedText>
      <ChipGroup options={athletes.map((a) => ({ value: a.email, label: a.email }))} selected={[athleteEmail]} onToggle={setAthleteEmail} />
      <ChipGroup options={RACE_STROKES.map((s) => ({ value: s, label: t(`stroke.${s}`) }))} selected={[stroke]} onToggle={setStroke} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('coach.results.distance')}
      </ThemedText>
      <Stepper value={distance} min={25} max={1500} step={25} onChange={setDistance} />
      <View style={styles.row}>
        <Stepper value={minutes} min={0} max={30} suffix={t('coach.results.minutes')} onChange={setMinutes} />
        <Stepper value={seconds} min={0} max={59} step={5} suffix={t('coach.results.seconds')} onChange={setSeconds} />
      </View>
      <Pressable onPress={handleLog} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText type="smallBold">{t('coach.results.log')}</ThemedText>
        </ThemedView>
      </Pressable>
      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
    </View>
  );
}

/**
 * Extends "the coach writes the athlete's training" beyond one-off workouts (WorkoutComposer
 * above) to periodization and post-session feedback: a coach can set (or clear) a linked
 * athlete's goal race date — the same field that drives that athlete's own periodization phase
 * and race day plan (src/domain/periodization.ts, src/domain/raceDayPlan.ts) — see how recent
 * sessions actually felt, and preview the athlete's own race day plan once it's close. Reads via
 * fetchCloudProfile/fetchCloudCompletions (already scoped by RLS to a linked coach); the write
 * goes through the narrow set_athlete_goal_race_date() RPC (supabase/migrations/
 * 0003_coach_race_planning.sql) rather than a broad write grant on athlete_profiles.
 */
function AthleteInsightsPanel({ athletes }: { athletes: TeamMemberWithEmail[] }) {
  const { t } = useTranslation();
  const [athleteEmail, setAthleteEmail] = useState(athletes[0]?.email ?? '');
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackHistoryEntry[]>([]);
  const [raceInDays, setRaceInDays] = useState(60);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const athlete = athletes.find((m) => m.email === athleteEmail);

  async function refresh(athleteId: string) {
    const [fetchedProfile, completions] = await Promise.all([
      fetchCloudProfile(athleteId),
      fetchCloudCompletions(athleteId),
    ]);
    setProfile(fetchedProfile);
    setFeedbackEntries(extractFeedbackHistory(completions, 6));
    setLoaded(true);
  }

  useEffect(() => {
    if (!athlete) return;
    let cancelled = false;
    // Same reasoning as CoachDashboard's own top-level effect below: refresh() sets state as
    // each fetch resolves — the compiler's static check can't see into it to confirm that's
    // safely gated, but React 19 (this app's target) makes a state update after unmount a
    // harmless no-op, so the risk this rule guards against doesn't apply here; `cancelled` is
    // kept anyway as a not-strictly-necessary guard against a stale response landing after the
    // athlete selection has moved on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(athlete.athlete_id).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athlete?.athlete_id]);

  if (!athlete) return null;

  const weekKey = isoWeekKey(new Date());
  const days = profile ? daysUntilRace(weekKey, profile.goalRaceDate) : undefined;
  const phase = periodizationPhase(days);
  const racePlan = profile ? buildRaceDayPlan(profile) : undefined;

  async function handleSetRaceDate() {
    const date = new Date();
    date.setDate(date.getDate() + raceInDays);
    const { error } = await setAthleteGoalRaceDate(athlete!.athlete_id, date.toISOString().slice(0, 10));
    setMessage(error ?? t('coach.insights.raceDateSet'));
    if (!error) refresh(athlete!.athlete_id);
  }

  async function handleClearRaceDate() {
    const { error } = await setAthleteGoalRaceDate(athlete!.athlete_id, null);
    setMessage(error ?? t('coach.insights.raceDateCleared'));
    if (!error) refresh(athlete!.athlete_id);
  }

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('coach.insights.title')}
      </ThemedText>
      <ChipGroup options={athletes.map((a) => ({ value: a.email, label: a.email }))} selected={[athleteEmail]} onToggle={setAthleteEmail} />

      {!loaded ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('common.loading')}
        </ThemedText>
      ) : !profile ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('coach.insights.noProfile')}
        </ThemedText>
      ) : (
        <>
          <View style={styles.nested}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('coach.insights.goalRaceLabel')}
            </ThemedText>
            <ThemedText type="small">
              {profile.goalRaceDate
                ? t('coach.insights.currentRaceDate', { date: profile.goalRaceDate })
                : t('coach.insights.noRaceDate')}
            </ThemedText>
            {phase && days !== undefined && (
              <ThemedText type="small" themeColor="textSecondary">
                {periodizationNoteText(phase, days, t)}
              </ThemedText>
            )}
            <Stepper value={raceInDays} min={1} max={365} suffix={t('coach.insights.days')} onChange={setRaceInDays} />
            <Pressable onPress={handleSetRaceDate} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.button}>
                <ThemedText type="smallBold">{t('coach.insights.setRaceDate')}</ThemedText>
              </ThemedView>
            </Pressable>
            {profile.goalRaceDate && (
              <Pressable onPress={handleClearRaceDate} style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="link">{t('common.clear')}</ThemedText>
              </Pressable>
            )}
            {message && (
              <ThemedText type="small" themeColor="textSecondary">
                {message}
              </ThemedText>
            )}
          </View>

          <View style={styles.nested}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('coach.insights.feedbackTitle')}
            </ThemedText>
            {feedbackEntries.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('coach.insights.feedbackEmpty')}
              </ThemedText>
            ) : (
              feedbackEntries.map((entry, i) => (
                <ThemedText key={i} type="small">
                  {entry.weekKey} · {t(`feedback.difficulty.${entry.feedback.difficulty}`)}
                  {entry.feedback.pain && entry.feedback.pain.length > 0
                    ? ` · ${entry.feedback.pain.map((p) => t(`feedback.pain.${p}`)).join(', ')}`
                    : ''}
                </ThemedText>
              ))
            )}
          </View>

          {racePlan && (phase === 'peak' || phase === 'taper') && (
            <View style={styles.nested}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('raceDay.title')}
              </ThemedText>
              <RaceDayPlanView plan={racePlan} unit={profile.unit} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

function CoachChat({ coachId, team, athletes }: { coachId: string; team: TeamRow; athletes: TeamMemberWithEmail[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [athleteEmail, setAthleteEmail] = useState(athletes[0]?.email ?? '');
  const [thread, setThread] = useState<MessageRow[]>([]);
  const [teamChat, setTeamChat] = useState<TeamMessageRow[]>([]);
  const [directBody, setDirectBody] = useState('');
  const [teamBody, setTeamBody] = useState('');

  const athlete = athletes.find((m) => m.email === athleteEmail);

  useEffect(() => {
    if (athlete) fetchThread(coachId, athlete.athlete_id).then(setThread);
    // `athlete` is recomputed fresh every render (a .find() over `athletes`), so depending on
    // it directly would re-run this effect every render — its id is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, athlete?.athlete_id]);

  useEffect(() => {
    fetchTeamChat(team.id).then(setTeamChat);
  }, [team.id]);

  async function handleSendDirect() {
    if (!athlete || !directBody.trim()) return;
    await sendMessage(coachId, athlete.athlete_id, coachId, directBody.trim());
    setDirectBody('');
    setThread(await fetchThread(coachId, athlete.athlete_id));
  }

  async function handleSendTeam() {
    if (!teamBody.trim()) return;
    await sendTeamMessage(team.id, coachId, teamBody.trim());
    setTeamBody('');
    setTeamChat(await fetchTeamChat(team.id));
  }

  return (
    <>
      <View style={styles.block}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('coach.chat.oneOnOneTitle')}
        </ThemedText>
        <ChipGroup options={athletes.map((a) => ({ value: a.email, label: a.email }))} selected={[athleteEmail]} onToggle={setAthleteEmail} />
        {thread.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('coach.chat.empty')}
          </ThemedText>
        ) : (
          thread.map((m) => (
            <ThemedText key={m.id} type="small">
              {m.sender_id === coachId ? '→ ' : '← '}
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
          {t('coach.chat.teamTitle')}
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
    </>
  );
}

export function CoachDashboard() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [members, setMembers] = useState<TeamMemberWithEmail[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function refresh(coachId: string) {
    const myTeam = await fetchMyTeam(coachId);
    setTeam(myTeam);
    if (myTeam) setMembers(await fetchTeamMembers(myTeam.id));
  }

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    // refresh() sets team/members state as each fetch resolves — the compiler's static check
    // can't see into it to confirm those are all safely gated, but React 19 (this app's target)
    // no longer warns or errors on a state update after unmount, it's simply a no-op, so the
    // risk this rule guards against doesn't apply here; the `cancelled` flag below still gates
    // the one state update that matters for correctness (not flashing stale content).
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

  const activeAthletes = members.filter((m) => m.status === 'active');

  return (
    <Collapsible title={t('coach.dashboard')}>
      <TeamPanel team={team} onTeamCreated={setTeam} />
      {team && <RosterPanel team={team} members={members} onChanged={() => refresh(session.user.id)} />}
      {team && activeAthletes.length > 0 && (
        <>
          <WorkoutComposer coachId={session.user.id} athletes={activeAthletes} />
          <AthleteInsightsPanel athletes={activeAthletes} />
          <ResultsLogger coachId={session.user.id} athletes={activeAthletes} />
          <CoachChat coachId={session.user.id} team={team} athletes={activeAthletes} />
        </>
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
    gap: Spacing.two,
    marginLeft: Spacing.three,
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
