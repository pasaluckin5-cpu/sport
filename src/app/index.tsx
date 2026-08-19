import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AthleteCoachPanel } from '@/components/athlete-coach-panel';
import { ChipGroup } from '@/components/chip-group';
import { FriendsPanel } from '@/components/friends-panel';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { equipmentLabel } from '@/domain/equipment';
import { daysUntilRace } from '@/domain/periodization';
import { AthleteProfile, DAY_KEYS, DayPlan, Difficulty, DistanceUnit, PainArea } from '@/domain/types';
import { basePace100Sec, formatPace100 } from '@/domain/workoutLibrary';
import {
  focusNoteText,
  formatDayShareText,
  formatGymBlock,
  formatSetStep,
  gymModeLabel,
  periodizationNoteText,
  recordsProgressText,
  swimSessionTitle,
  unitAbbrev,
} from '@/i18n/format';
import { useTheme } from '@/hooks/use-theme';
import { SessionKind, useHistory } from '@/state/history-context';
import { usePlan } from '@/state/plan-context';
import { useStrokeLog } from '@/state/strokeLog-context';
import { shareOrCopy } from '@/utils/share';

function CompletionToggle({
  weekKey,
  dayIndex,
  kind,
  label,
}: {
  weekKey: string;
  dayIndex: number;
  kind: SessionKind;
  label: string;
}) {
  const { isCompleted, toggleCompleted } = useHistory();
  const done = isCompleted(weekKey, dayIndex, kind);
  return (
    <Pressable onPress={() => toggleCompleted(weekKey, dayIndex, kind)} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedText type="small" themeColor={done ? 'text' : 'textSecondary'}>
        {done ? '☑ ' : '☐ '}
        {label}
      </ThemedText>
    </Pressable>
  );
}

const DIFFICULTIES: Difficulty[] = ['easy', 'moderate', 'hard', 'tooHard'];
const PAIN_AREAS: PainArea[] = ['shoulder', 'knee', 'back', 'other'];

function FeedbackPrompt({ weekKey, dayIndex, kind }: { weekKey: string; dayIndex: number; kind: SessionKind }) {
  const { t } = useTranslation();
  const { isCompleted, getFeedback, setFeedback } = useHistory();
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [pain, setPain] = useState<PainArea[]>([]);

  if (!isCompleted(weekKey, dayIndex, kind)) return null;

  const existing = getFeedback(weekKey, dayIndex, kind);
  if (existing) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        {t('plan.feedback.logged', { difficulty: t(`feedback.difficulty.${existing.difficulty}`) })}
      </ThemedText>
    );
  }

  function togglePain(area: PainArea) {
    setPain((p) => (p.includes(area) ? p.filter((a) => a !== area) : [...p, area]));
  }

  return (
    <View style={styles.feedbackBlock}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('plan.feedback.prompt')}
      </ThemedText>
      <ChipGroup
        options={DIFFICULTIES.map((d) => ({ value: d, label: t(`feedback.difficulty.${d}`) }))}
        selected={difficulty ? [difficulty] : []}
        onToggle={(v) => setDifficulty(v)}
      />
      <ChipGroup
        options={PAIN_AREAS.map((p) => ({ value: p, label: t(`feedback.pain.${p}`) }))}
        selected={pain}
        onToggle={togglePain}
      />
      <Pressable
        onPress={() => difficulty && setFeedback(weekKey, dayIndex, kind, { difficulty, pain: pain.length > 0 ? pain : undefined })}
        disabled={!difficulty}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="link">{t('plan.feedback.submit')}</ThemedText>
      </Pressable>
    </View>
  );
}

function DayCard({ day, weekKey, unit }: { day: DayPlan; weekKey: string; unit: DistanceUnit }) {
  const { t } = useTranslation();
  const [shareState, setShareState] = useState<'shared' | 'copied' | null>(null);
  const abbrev = unitAbbrev(unit);

  const titleParts: string[] = [];
  if (day.pool) titleParts.push(`${swimSessionTitle(day.pool.zone, t)} · ${day.pool.totalDistance}${abbrev}`);
  if (day.gym) titleParts.push(`${t(`gymFocus.${day.gym.focus}`)} · ${day.gym.durationMin}${t('common.min')}`);
  const title = titleParts.length > 0 ? titleParts.join(' + ') : t('plan.restDay');

  async function handleShare() {
    const dayName = t(`day.${DAY_KEYS[day.dayIndex]}`);
    const result = await shareOrCopy(formatDayShareText(day, dayName, unit, t), t('common.appName'));
    setShareState(result);
  }

  return (
    <Collapsible title={`${t(`day.${DAY_KEYS[day.dayIndex]}`)} — ${title}`}>
      {(day.pool || day.gym) && (
        <View style={styles.sessionBlock}>
          <Pressable onPress={handleShare} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="link">{t('plan.share')}</ThemedText>
          </Pressable>
          {shareState === 'copied' && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('plan.shareCopied')}
            </ThemedText>
          )}
        </View>
      )}
      {day.pool && (
        <View style={styles.sessionBlock}>
          <CompletionToggle weekKey={weekKey} dayIndex={day.dayIndex} kind="pool" label={t('plan.markDone_pool')} />
          <FeedbackPrompt weekKey={weekKey} dayIndex={day.dayIndex} kind="pool" />
          {(['warmup', 'main', 'cooldown'] as const).map((section) =>
            day.pool![section].length > 0 ? (
              <View key={section} style={styles.stepGroup}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t(`plan.${section}`)}
                </ThemedText>
                {day.pool![section].map((step, i) => (
                  <ThemedText key={i} type="small">
                    • {formatSetStep(step, t, unit)}
                    {step.equipment.length > 0 ? ` (${step.equipment.map((e) => equipmentLabel(e, t)).join(', ')})` : ''}
                  </ThemedText>
                ))}
              </View>
            ) : null,
          )}
        </View>
      )}
      {day.gym && (
        <View style={styles.sessionBlock}>
          <CompletionToggle weekKey={weekKey} dayIndex={day.dayIndex} kind="gym" label={t('plan.markDone_gym')} />
          <FeedbackPrompt weekKey={weekKey} dayIndex={day.dayIndex} kind="gym" />
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t(`gymFocus.${day.gym.focus}`)} · {gymModeLabel(day.gym.mode, t)}
          </ThemedText>
          {day.gym.blocks.map((block, i) => (
            <ThemedText key={i} type="small">
              • {formatGymBlock(block, t)}
            </ThemedText>
          ))}
        </View>
      )}
      {!day.pool && !day.gym && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('plan.restDayHint')}
        </ThemedText>
      )}
    </Collapsible>
  );
}

function HistorySection() {
  const { t } = useTranslation();
  const { weekCounts } = useHistory();

  return (
    <Collapsible title={t('plan.history.title')}>
      {weekCounts.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('plan.history.empty')}
        </ThemedText>
      ) : (
        weekCounts.map(({ weekKey, count }) => (
          <ThemedText key={weekKey} type="small">
            {t('plan.history.weekSummary', { count, week: weekKey })}
          </ThemedText>
        ))
      )}
    </Collapsible>
  );
}

function ProgressSection({ profile }: { profile: AthleteProfile }) {
  const { t } = useTranslation();
  const { entries, addEntry, removeEntry, averageForDistance } = useStrokeLog();
  const [distance, setDistance] = useState<number>(profile.poolLength);
  const [strokeCount, setStrokeCount] = useState(20);
  const abbrev = unitAbbrev(profile.unit);
  const average = averageForDistance(distance);
  const records = recordsProgressText(profile.gender, profile.benchmark, profile.unit, t);

  return (
    <Collapsible title={t('progress.title')}>
      <View style={styles.sessionBlock}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('progress.strokeLog.title')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('progress.strokeLog.hint')}
        </ThemedText>
        <View style={styles.progressRow}>
          <View style={styles.timeField}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('progress.strokeLog.distanceLabel')}
            </ThemedText>
            <Stepper
              value={distance}
              min={profile.poolLength}
              max={profile.poolLength * 20}
              step={profile.poolLength}
              suffix={abbrev}
              onChange={setDistance}
            />
          </View>
          <View style={styles.timeField}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('progress.strokeLog.strokesLabel')}
            </ThemedText>
            <Stepper value={strokeCount} min={1} max={200} onChange={setStrokeCount} />
          </View>
        </View>
        <Pressable onPress={() => addEntry(distance, strokeCount)} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.secondaryButton}>
            <ThemedText type="smallBold">{t('progress.strokeLog.add')}</ThemedText>
          </ThemedView>
        </Pressable>
        {average !== null && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('progress.strokeLog.average', { distance, unit: abbrev, avg: average.toFixed(1) })}
          </ThemedText>
        )}
        {entries.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('progress.strokeLog.empty')}
          </ThemedText>
        ) : (
          entries.slice(0, 10).map((entry) => (
            <View key={entry.id} style={styles.entryRow}>
              <ThemedText type="small">
                {t('progress.strokeLog.entry', {
                  date: entry.dateISO,
                  distance: entry.distance,
                  unit: abbrev,
                  count: entry.strokeCount,
                })}
              </ThemedText>
              <Pressable onPress={() => removeEntry(entry.id)} style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="link">{t('progress.strokeLog.remove')}</ThemedText>
              </Pressable>
            </View>
          ))
        )}
      </View>

      <View style={styles.sessionBlock}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('progress.records.title')}
        </ThemedText>
        {records === 'needsGender' && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('progress.records.needsGender')}
          </ThemedText>
        )}
        {records === 'needsBenchmark' && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('progress.records.needsBenchmark')}
          </ThemedText>
        )}
        {typeof records === 'object' && (
          <>
            <ThemedText type="small">{records.yourTime}</ThemedText>
            {records.worldRecord && (
              <ThemedText type="small" themeColor="textSecondary">
                {records.worldRecord}
              </ThemedText>
            )}
            {records.percentOff && (
              <ThemedText type="small" themeColor="textSecondary">
                {records.percentOff}
              </ThemedText>
            )}
            {records.currentRank && <ThemedText type="small">{records.currentRank}</ThemedText>}
            <ThemedText type="small">{records.goal}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('progress.records.disclaimer')}
            </ThemedText>
          </>
        )}
      </View>
    </Collapsible>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { profile, weekPlan, isReady } = usePlan();
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  if (!isReady) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>
      </ThemedView>
    );
  }

  if (!profile || !weekPlan) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedView style={styles.emptyState}>
          <ThemedText type="title" style={styles.centerText}>
            {t('plan.empty.title')}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {t('plan.empty.subtitle')}
          </ThemedText>
          <Pressable onPress={() => router.navigate('/profile')} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundSelected" style={styles.ctaButton}>
              <ThemedText type="smallBold">{t('plan.empty.cta')}</ThemedText>
            </ThemedView>
          </Pressable>
        </ThemedView>
      </ThemedView>
    );
  }

  const poolSessions = weekPlan.days.filter((d) => d.pool).length;
  const gymSessions = weekPlan.days.filter((d) => d.gym).length;
  const abbrev = unitAbbrev(profile.unit);
  const focusNote = focusNoteText(profile.primaryStrokes, profile.primaryDistances, profile.unit, t);
  const periodizationNote = weekPlan.periodizationPhase
    ? periodizationNoteText(weekPlan.periodizationPhase, daysUntilRace(weekPlan.weekKey, profile.goalRaceDate) ?? 0, t)
    : null;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">{t('plan.thisWeek')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {poolSessions > 0
              ? t('plan.summary', {
                  count: poolSessions,
                  distance: weekPlan.totalPoolDistance.toLocaleString(),
                  unit: abbrev,
                })
              : t('plan.gymOnlySummary', { count: gymSessions })}
            {poolSessions > 0 && gymSessions > 0 ? t('plan.gymSuffix', { count: gymSessions }) : ''}
            {profile.benchmark
              ? t('plan.basePaceSuffix', { pace: formatPace100(basePace100Sec(profile.benchmark)), unit: abbrev })
              : ''}
          </ThemedText>
          {focusNote && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              {focusNote}
            </ThemedText>
          )}
          {periodizationNote && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              {periodizationNote}
            </ThemedText>
          )}
          <Pressable onPress={() => router.navigate('/profile')} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="link">{t('plan.editProfile')}</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.daysWrapper}>
          {weekPlan.days.map((day) => (
            <Fragment key={day.dayIndex}>
              <DayCard day={day} weekKey={weekPlan.weekKey} unit={profile.unit} />
            </Fragment>
          ))}
          <HistorySection />
          <ProgressSection profile={profile} />
          <AthleteCoachPanel />
          <FriendsPanel />
        </ThemedView>

        {Platform.OS === 'web' && <WebBadge />}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    maxWidth: MaxContentWidth,
  },
  centerText: {
    textAlign: 'center',
  },
  ctaButton: {
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
  titleContainer: {
    gap: Spacing.two,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  daysWrapper: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  sessionBlock: {
    gap: Spacing.one,
    marginBottom: Spacing.three,
  },
  stepGroup: {
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
  feedbackBlock: {
    gap: Spacing.one,
    marginTop: Spacing.one,
    marginBottom: Spacing.one,
  },
  progressRow: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  timeField: {
    gap: Spacing.one,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
