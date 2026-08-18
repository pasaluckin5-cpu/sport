import { router } from 'expo-router';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { equipmentLabel } from '@/domain/equipment';
import { DAY_KEYS, DayPlan } from '@/domain/types';
import { basePace100Sec, formatPace100 } from '@/domain/workoutLibrary';
import { formatGymBlock, formatSetStep, swimSessionTitle, unitAbbrev } from '@/i18n/format';
import { useTheme } from '@/hooks/use-theme';
import { SessionKind, useHistory } from '@/state/history-context';
import { usePlan } from '@/state/plan-context';

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

function DayCard({ day, weekKey, unit }: { day: DayPlan; weekKey: string; unit: 'meters' | 'yards' }) {
  const { t } = useTranslation();
  const abbrev = unitAbbrev(unit);

  const titleParts: string[] = [];
  if (day.pool) titleParts.push(`${swimSessionTitle(day.pool.zone, t)} · ${day.pool.totalDistance}${abbrev}`);
  if (day.gym) titleParts.push(`${t(`gymFocus.${day.gym.focus}`)} · ${day.gym.durationMin}${t('common.min')}`);
  const title = titleParts.length > 0 ? titleParts.join(' + ') : t('plan.restDay');

  return (
    <Collapsible title={`${t(`day.${DAY_KEYS[day.dayIndex]}`)} — ${title}`}>
      {day.pool && (
        <View style={styles.sessionBlock}>
          <CompletionToggle weekKey={weekKey} dayIndex={day.dayIndex} kind="pool" label={t('plan.markDone_pool')} />
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
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t(`gymFocus.${day.gym.focus}`)}
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

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">{t('plan.thisWeek')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {t('plan.summary', {
              count: poolSessions,
              distance: weekPlan.totalPoolDistance.toLocaleString(),
              unit: abbrev,
            })}
            {gymSessions > 0 ? t('plan.gymSuffix', { count: gymSessions }) : ''}
            {profile.benchmark
              ? t('plan.basePaceSuffix', { pace: formatPace100(basePace100Sec(profile.benchmark)), unit: abbrev })
              : ''}
          </ThemedText>
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
});
