import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/chip-group';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { computeTotalDays } from '@/domain/learnToSwim';
import { useTheme } from '@/hooks/use-theme';
import { formatLearnToSwimDrill, learnToSwimStageLabel } from '@/i18n/format';
import { useLearnToSwim } from '@/state/learnToSwim-context';

const MINUTE_PRESETS = [10, 15, 20, 30, 45, 60];

function SafetyDisclaimer() {
  const { t } = useTranslation();
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
      {t('learnToSwim.safetyDisclaimer')}
    </ThemedText>
  );
}

function OnboardingView() {
  const { t } = useTranslation();
  const { start } = useLearnToSwim();
  const [minutesPerDay, setMinutesPerDay] = useState(20);
  const previewDays = computeTotalDays(minutesPerDay);

  return (
    <ThemedView style={styles.section}>
      <ThemedText type="title" style={styles.centerText}>
        {t('learnToSwim.onboarding.title')}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centerText}>
        {t('learnToSwim.onboarding.subtitle')}
      </ThemedText>

      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('learnToSwim.onboarding.minutesLabel')}
      </ThemedText>
      <ChipGroup
        options={MINUTE_PRESETS.map((m) => ({
          value: String(m),
          label: t('learnToSwim.onboarding.minutesOption', { count: m }),
        }))}
        selected={[String(minutesPerDay)]}
        onToggle={(v) => setMinutesPerDay(Number(v))}
      />
      <Stepper value={minutesPerDay} min={5} max={90} step={5} suffix={t('common.min')} onChange={setMinutesPerDay} />

      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        {t('learnToSwim.onboarding.preview', { count: previewDays })}
      </ThemedText>

      <Pressable onPress={() => start(minutesPerDay)} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.ctaButton}>
          <ThemedText type="smallBold">{t('learnToSwim.onboarding.start')}</ThemedText>
        </ThemedView>
      </Pressable>

      <SafetyDisclaimer />
    </ThemedView>
  );
}

function PaceSettings() {
  const { t } = useTranslation();
  const { progress, setMinutesPerDay, reset } = useLearnToSwim();
  const [minutesPerDay, setLocalMinutes] = useState(progress?.minutesPerDay ?? 20);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const previewDays = computeTotalDays(minutesPerDay);

  return (
    <Collapsible title={t('learnToSwim.settings.title')}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('learnToSwim.settings.hint')}
      </ThemedText>
      <Stepper value={minutesPerDay} min={5} max={90} step={5} suffix={t('common.min')} onChange={setLocalMinutes} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('learnToSwim.onboarding.preview', { count: previewDays })}
      </ThemedText>
      <Pressable onPress={() => setMinutesPerDay(minutesPerDay)} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.secondaryButton}>
          <ThemedText type="smallBold">{t('learnToSwim.settings.apply')}</ThemedText>
        </ThemedView>
      </Pressable>

      {!confirmingReset ? (
        <Pressable onPress={() => setConfirmingReset(true)} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText type="link">{t('learnToSwim.settings.reset')}</ThemedText>
        </Pressable>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('learnToSwim.settings.resetConfirm')}
          </ThemedText>
          <Pressable onPress={() => reset()} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundElement" style={styles.secondaryButton}>
              <ThemedText type="smallBold">{t('learnToSwim.settings.reset')}</ThemedText>
            </ThemedView>
          </Pressable>
        </>
      )}
    </Collapsible>
  );
}

function FinishedView() {
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.section}>
      <ThemedText type="title" style={styles.centerText}>
        {t('learnToSwim.finished.title')}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centerText}>
        {t('learnToSwim.finished.subtitle')}
      </ThemedText>
      <PaceSettings />
    </ThemedView>
  );
}

function ActiveView() {
  const { t } = useTranslation();
  const { plan, progress, currentDay, markCurrentDayDone } = useLearnToSwim();
  if (!plan || !progress || !currentDay) return null;

  const completedDays = Math.min(progress.completedDays, plan.totalDays);
  const percent = Math.round((completedDays / plan.totalDays) * 100);

  return (
    <ThemedView style={styles.section}>
      <ThemedText type="subtitle" style={styles.centerText}>
        {t('learnToSwim.active.dayCounter', { day: currentDay.dayNumber, total: plan.totalDays })}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centerText}>
        {t('learnToSwim.active.progress', { percent })}
      </ThemedText>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {learnToSwimStageLabel(currentDay.stage, t)}
        </ThemedText>
        {currentDay.drills.map((drill, i) => (
          <ThemedText key={i} type="small">
            • {formatLearnToSwimDrill(drill, t)}
          </ThemedText>
        ))}
      </ThemedView>

      <Pressable onPress={() => markCurrentDayDone()} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.ctaButton}>
          <ThemedText type="smallBold">{t('learnToSwim.active.markDone')}</ThemedText>
        </ThemedView>
      </Pressable>

      <SafetyDisclaimer />
      <PaceSettings />
    </ThemedView>
  );
}

export default function LearnToSwimScreen() {
  const { t } = useTranslation();
  const { isReady, progress, isFinished } = useLearnToSwim();
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

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        {!progress ? <OnboardingView /> : isFinished ? <FinishedView /> : <ActiveView />}
        {Platform.OS === 'web' && <WebBadge />}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  section: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
  card: {
    gap: Spacing.one,
    padding: Spacing.four,
    borderRadius: Spacing.three,
  },
  ctaButton: {
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
});
