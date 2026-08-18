import { router } from 'expo-router';
import { Fragment } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { equipmentLabel } from '@/domain/equipment';
import { DAY_NAMES, DayPlan, SetStep } from '@/domain/types';
import { basePace100Sec, formatPace100 } from '@/domain/workoutLibrary';
import { useTheme } from '@/hooks/use-theme';
import { usePlan } from '@/state/plan-context';

function SetStepList({ heading, steps }: { heading: string; steps: SetStep[] }) {
  if (steps.length === 0) return null;
  return (
    <View style={styles.stepGroup}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {heading}
      </ThemedText>
      {steps.map((step, i) => (
        <ThemedText key={i} type="small">
          • {step.label} — {step.distanceM}m
          {step.equipment.length > 0 ? ` (${step.equipment.map(equipmentLabel).join(', ')})` : ''}
        </ThemedText>
      ))}
    </View>
  );
}

function dayTitle(day: DayPlan): string {
  const parts: string[] = [];
  if (day.pool) parts.push(`${day.pool.title} · ${day.pool.totalDistanceM}m`);
  if (day.gym) parts.push(`${day.gym.title} · ${day.gym.durationMin}min`);
  return parts.length > 0 ? parts.join(' + ') : 'Rest day';
}

function DayCard({ day }: { day: DayPlan }) {
  return (
    <Collapsible title={`${DAY_NAMES[day.dayIndex]} — ${dayTitle(day)}`}>
      {day.pool && (
        <View style={styles.sessionBlock}>
          <SetStepList heading="Warm-up" steps={day.pool.warmup} />
          <SetStepList heading="Main set" steps={day.pool.main} />
          <SetStepList heading="Cool-down" steps={day.pool.cooldown} />
        </View>
      )}
      {day.gym && (
        <View style={styles.sessionBlock}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {day.gym.title}
          </ThemedText>
          {day.gym.blocks.map((block, i) => (
            <ThemedText key={i} type="small">
              • {block.label} — {block.detail}
            </ThemedText>
          ))}
        </View>
      )}
      {!day.pool && !day.gym && (
        <ThemedText type="small" themeColor="textSecondary">
          No training scheduled. Recover, stretch, or take the day off.
        </ThemedText>
      )}
    </Collapsible>
  );
}

export default function HomeScreen() {
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
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (!profile || !weekPlan) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedView style={styles.emptyState}>
          <ThemedText type="title" style={styles.centerText}>
            Swim Planner
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            Set up your profile — level, weekly schedule, and equipment — and we&apos;ll build a
            personalized weekly training plan.
          </ThemedText>
          <Pressable onPress={() => router.navigate('/profile')} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundSelected" style={styles.ctaButton}>
              <ThemedText type="smallBold">Set up my profile</ThemedText>
            </ThemedView>
          </Pressable>
        </ThemedView>
      </ThemedView>
    );
  }

  const poolSessions = weekPlan.days.filter((d) => d.pool).length;
  const gymSessions = weekPlan.days.filter((d) => d.gym).length;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">This week</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {poolSessions} pool session{poolSessions === 1 ? '' : 's'} ·{' '}
            {weekPlan.totalPoolDistanceM.toLocaleString()}m
            {gymSessions > 0 ? ` · ${gymSessions} gym session${gymSessions === 1 ? '' : 's'}` : ''}
            {profile.benchmark ? ` · base pace ${formatPace100(basePace100Sec(profile.benchmark))}/100m` : ''}
          </ThemedText>
          <Pressable onPress={() => router.navigate('/profile')} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="link">Edit profile & regenerate</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.daysWrapper}>
          {weekPlan.days.map((day) => (
            <Fragment key={day.dayIndex}>
              <DayCard day={day} />
            </Fragment>
          ))}
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
