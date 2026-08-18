import { router } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/chip-group';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { EQUIPMENT_CATALOG } from '@/domain/equipment';
import { DEFAULT_PROFILE } from '@/domain/planGenerator';
import { AthleteLevel, AthleteProfile, Equipment, SwimGoal } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { usePlan } from '@/state/plan-context';

const BENCHMARK_DISTANCE_OPTIONS: { value: '100' | '200' | '400' | '1000'; label: string }[] = [
  { value: '100', label: '100m' },
  { value: '200', label: '200m' },
  { value: '400', label: '400m' },
  { value: '1000', label: '1000m' },
];

const LEVEL_OPTIONS: { value: AthleteLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const GOAL_OPTIONS: { value: SwimGoal; label: string }[] = [
  { value: 'fitness', label: 'General fitness' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'speed', label: 'Speed' },
  { value: 'technique', label: 'Technique' },
];

const EQUIPMENT_OPTIONS = EQUIPMENT_CATALOG.map((e) => ({ value: e.id, label: `${e.emoji} ${e.label}` }));

function FormSection({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <ThemedView style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </ThemedView>
  );
}

export default function ProfileScreen() {
  const { isReady } = usePlan();

  // Mounting the form only once loading is resolved lets its initial state pick up the
  // stored profile directly, with no effect needed to seed it after the fact.
  if (!isReady) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      </ThemedView>
    );
  }

  return <ProfileForm />;
}

function ProfileForm() {
  const { profile, updateProfile } = usePlan();
  const [form, setForm] = useState<AthleteProfile>(profile ?? DEFAULT_PROFILE);
  const [saved, setSaved] = useState(false);
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

  function toggleEquipment(id: Equipment) {
    setSaved(false);
    setForm((f) => ({
      ...f,
      equipment: f.equipment.includes(id) ? f.equipment.filter((e) => e !== id) : [...f.equipment, id],
    }));
  }

  async function handleSave() {
    // A benchmark with no time set yet isn't a real pace — drop it rather than saving
    // a 0-second time trial that would divide out to a nonsense pace.
    const benchmark = form.benchmark && form.benchmark.timeSec > 0 ? form.benchmark : undefined;
    await updateProfile({ ...form, benchmark });
    setSaved(true);
    router.navigate('/');
  }

  const benchmarkMin = Math.floor((form.benchmark?.timeSec ?? 0) / 60);
  const benchmarkSec = (form.benchmark?.timeSec ?? 0) % 60;

  function setBenchmarkTime(min: number, sec: number) {
    setSaved(false);
    setForm((f) => ({
      ...f,
      benchmark: { distanceM: f.benchmark?.distanceM ?? 400, timeSec: min * 60 + sec },
    }));
  }

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Your profile</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            Tell us how you train and we&apos;ll build your weekly plan around it.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.form}>
          <FormSection label="EXPERIENCE LEVEL">
            <ChipGroup
              options={LEVEL_OPTIONS}
              selected={[form.level]}
              onToggle={(value) => {
                setSaved(false);
                setForm((f) => ({ ...f, level: value }));
              }}
            />
          </FormSection>

          <FormSection label="MAIN GOAL">
            <ChipGroup
              options={GOAL_OPTIONS}
              selected={[form.goal]}
              onToggle={(value) => {
                setSaved(false);
                setForm((f) => ({ ...f, goal: value }));
              }}
            />
          </FormSection>

          <FormSection label="POOL SESSIONS PER WEEK">
            <Stepper
              value={form.poolSessionsPerWeek}
              min={1}
              max={7}
              onChange={(v) => {
                setSaved(false);
                setForm((f) => ({ ...f, poolSessionsPerWeek: v }));
              }}
            />
          </FormSection>

          <FormSection label="POOL SESSION LENGTH">
            <Stepper
              value={form.poolSessionDurationMin}
              min={30}
              max={120}
              step={15}
              suffix="min"
              onChange={(v) => {
                setSaved(false);
                setForm((f) => ({ ...f, poolSessionDurationMin: v }));
              }}
            />
          </FormSection>

          <FormSection label="GYM SESSIONS PER WEEK">
            <Stepper
              value={form.gymSessionsPerWeek}
              min={0}
              max={5}
              onChange={(v) => {
                setSaved(false);
                setForm((f) => ({ ...f, gymSessionsPerWeek: v }));
              }}
            />
          </FormSection>

          <FormSection label="EQUIPMENT YOU HAVE">
            <ChipGroup options={EQUIPMENT_OPTIONS} selected={form.equipment} onToggle={toggleEquipment} />
          </FormSection>

          <FormSection label="RECENT TIME TRIAL (OPTIONAL)">
            <ThemedText type="small" themeColor="textSecondary">
              Add a recent time over a set distance and we&apos;ll target real paces for your
              main sets instead of a rough estimate.
            </ThemedText>
            <ChipGroup
              options={BENCHMARK_DISTANCE_OPTIONS}
              selected={form.benchmark ? [String(form.benchmark.distanceM) as '100' | '200' | '400' | '1000'] : []}
              onToggle={(value) => {
                setSaved(false);
                setForm((f) => ({
                  ...f,
                  benchmark: { distanceM: Number(value), timeSec: f.benchmark?.timeSec ?? 0 },
                }));
              }}
            />
            <ThemedView style={styles.timeRow}>
              <ThemedView style={styles.timeField}>
                <ThemedText type="small" themeColor="textSecondary">
                  min
                </ThemedText>
                <Stepper value={benchmarkMin} min={0} max={30} onChange={(v) => setBenchmarkTime(v, benchmarkSec)} />
              </ThemedView>
              <ThemedView style={styles.timeField}>
                <ThemedText type="small" themeColor="textSecondary">
                  sec
                </ThemedText>
                <Stepper
                  value={benchmarkSec}
                  min={0}
                  max={55}
                  step={5}
                  onChange={(v) => setBenchmarkTime(benchmarkMin, v)}
                />
              </ThemedView>
            </ThemedView>
            {form.benchmark && (
              <Pressable
                onPress={() => {
                  setSaved(false);
                  setForm((f) => ({ ...f, benchmark: undefined }));
                }}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="link">Clear</ThemedText>
              </Pressable>
            )}
          </FormSection>

          <Pressable onPress={handleSave} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundSelected" style={styles.saveButton}>
              <ThemedText type="smallBold">{profile ? 'Save & regenerate plan' : 'Create my plan'}</ThemedText>
            </ThemedView>
          </Pressable>
          {saved && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              Saved.
            </ThemedText>
          )}
        </ThemedView>

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
  titleContainer: {
    gap: Spacing.two,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
  form: {
    gap: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  timeField: {
    gap: Spacing.one,
  },
  saveButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
});
