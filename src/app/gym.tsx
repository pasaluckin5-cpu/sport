import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayCard } from './index';

import { ChipGroup } from '@/components/chip-group';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { AthleteLevel, AthleteProfile, GymSplit, GymTrainingStyle, TrainingGoal } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { usePlan } from '@/state/plan-context';

const LEVELS: AthleteLevel[] = ['beginner', 'intermediate', 'advanced'];
const GOALS: TrainingGoal[] = ['fitness', 'endurance', 'speed', 'technique'];
const GYM_SPLITS: GymSplit[] = ['fullBody', 'upperLower', 'pushPull', 'pushPullLegs', 'bodyPartSplit', 'broSplit'];
const GYM_STYLES: GymTrainingStyle[] = ['strength', 'hypertrophy', 'endurance', 'functional', 'circuit', 'cardio'];

/**
 * A dedicated entry point for someone who never swims at all — same underlying mechanism as
 * setting poolSessionsPerWeek to 0 in the Profile form (see CLAUDE.md's "Gym modes"), but as its
 * own tab with its own short, swim-free onboarding, rather than requiring a swim-focused form to
 * be scrolled past to find "set pool sessions to 0". There's still only one AthleteProfile per
 * device (this app's whole local-first model), so switching to gym-only mode here replaces
 * whatever profile already exists, same as it would from the Profile screen.
 */
function GymOnboardingForm({ existingProfile }: { existingProfile: AthleteProfile | null }) {
  const { t } = useTranslation();
  const { updateProfile } = usePlan();
  const [level, setLevel] = useState<AthleteLevel>(existingProfile?.level ?? 'beginner');
  const [goal, setGoal] = useState<TrainingGoal>(existingProfile?.goal ?? 'fitness');
  const [gymSessionsPerWeek, setGymSessionsPerWeek] = useState(existingProfile?.gymSessionsPerWeek || 3);
  const [gymSplit, setGymSplit] = useState<GymSplit | undefined>(existingProfile?.gymSplit);
  const [gymTrainingStyle, setGymTrainingStyle] = useState<GymTrainingStyle | undefined>(existingProfile?.gymTrainingStyle);

  async function handleCreate() {
    await updateProfile({
      level,
      goal,
      poolSessionsPerWeek: 0,
      poolSessionDurationMin: 0,
      gymSessionsPerWeek,
      equipment: [],
      unit: 'meters',
      poolLength: 25,
      gymSplit,
      gymTrainingStyle,
    });
  }

  return (
    <ThemedView style={styles.form}>
      <ThemedView style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('profile.section.level')}
        </ThemedText>
        <ChipGroup options={LEVELS.map((v) => ({ value: v, label: t(`profile.level.${v}`) }))} selected={[level]} onToggle={setLevel} />
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('profile.section.goal')}
        </ThemedText>
        <ChipGroup options={GOALS.map((v) => ({ value: v, label: t(`profile.goal.${v}`) }))} selected={[goal]} onToggle={setGoal} />
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('profile.section.gymSessionsPerWeek')}
        </ThemedText>
        <Stepper value={gymSessionsPerWeek} min={1} max={7} onChange={setGymSessionsPerWeek} />
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('profile.section.gymSplit')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('profile.gymSplit.hint')}
        </ThemedText>
        <ChipGroup
          options={GYM_SPLITS.map((v) => ({ value: v, label: t(`profile.gymSplit.option.${v}`) }))}
          selected={gymSplit ? [gymSplit] : []}
          onToggle={(v) => setGymSplit((current) => (current === v ? undefined : v))}
        />
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('profile.section.gymTrainingStyle')}
        </ThemedText>
        <ChipGroup
          options={GYM_STYLES.map((v) => ({ value: v, label: t(`profile.gymTrainingStyle.option.${v}`) }))}
          selected={gymTrainingStyle ? [gymTrainingStyle] : []}
          onToggle={(v) => setGymTrainingStyle((current) => (current === v ? undefined : v))}
        />
      </ThemedView>

      <Pressable onPress={handleCreate} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.ctaButton}>
          <ThemedText type="smallBold">{t(existingProfile ? 'gym.switchButton' : 'gym.createButton')}</ThemedText>
        </ThemedView>
      </Pressable>
    </ThemedView>
  );
}

export default function GymScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { profile, weekPlan, isReady } = usePlan();
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

  const isGymOnly = profile && profile.poolSessionsPerWeek === 0;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle" style={styles.centerText}>
            {t('gym.title')}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {isGymOnly ? t('gym.summary', { count: weekPlan!.days.filter((d) => d.gym).length }) : t('gym.intro')}
          </ThemedText>
          {profile && !isGymOnly && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              {t('gym.alreadySwimmer')}
            </ThemedText>
          )}
        </ThemedView>

        {isGymOnly ? (
          <ThemedView style={styles.daysWrapper}>
            {weekPlan!.days.map((day) => (
              <Fragment key={day.dayIndex}>
                <DayCard day={day} weekKey={weekPlan!.weekKey} unit={profile!.unit} />
              </Fragment>
            ))}
            <Pressable onPress={() => router.navigate('/gym')} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="link" style={styles.centerText}>
                {t('gym.editHint')}
              </ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <GymOnboardingForm existingProfile={profile} />
        )}

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
  centerText: {
    textAlign: 'center',
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
  form: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  section: {
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  ctaButton: {
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.8,
  },
});
