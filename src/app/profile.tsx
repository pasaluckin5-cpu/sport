import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/chip-group';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { EQUIPMENT_CATALOG, equipmentLabel } from '@/domain/equipment';
import { DEFAULT_PROFILE } from '@/domain/planGenerator';
import { parseProfileBackup } from '@/domain/profileValidation';
import { AthleteLevel, AthleteProfile, DistanceUnit, Equipment, PoolLength, SwimGoal } from '@/domain/types';
import { unitAbbrev } from '@/i18n/format';
import { AppLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/state/language-context';
import { usePlan } from '@/state/plan-context';

const LEVELS: AthleteLevel[] = ['beginner', 'intermediate', 'advanced'];
const GOALS: SwimGoal[] = ['fitness', 'endurance', 'speed', 'technique'];
const UNITS: DistanceUnit[] = ['meters', 'yards'];
const POOL_LENGTHS: PoolLength[] = [25, 50];
const BENCHMARK_DISTANCES = [100, 200, 400, 1000];

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
  const { t } = useTranslation();
  const { isReady } = usePlan();

  // Mounting the form only once loading is resolved lets its initial state pick up the
  // stored profile directly, with no effect needed to seed it after the fact.
  if (!isReady) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ThemedText themeColor="textSecondary">{t('common.loading')}</ThemedText>
      </ThemedView>
    );
  }

  return <ProfileForm />;
}

function ProfileForm() {
  const { t } = useTranslation();
  const { profile, updateProfile } = usePlan();
  const { language, setLanguage } = useLanguage();
  const [form, setForm] = useState<AthleteProfile>(profile ?? DEFAULT_PROFILE);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [restoreText, setRestoreText] = useState('');
  const [restoreMessage, setRestoreMessage] = useState<'success' | 'error' | null>(null);
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
      benchmark: { distance: f.benchmark?.distance ?? 400, timeSec: min * 60 + sec },
    }));
  }

  async function handleCopyBackup() {
    if (!profile) return;
    await Clipboard.setStringAsync(JSON.stringify(profile));
    setCopied(true);
  }

  function handleRestore() {
    const parsed = parseProfileBackup(restoreText.trim());
    if (!parsed) {
      setRestoreMessage('error');
      return;
    }
    setForm(parsed);
    setRestoreMessage('success');
    setRestoreText('');
  }

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">{t('profile.title')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {t('profile.subtitle')}
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.form}>
          <FormSection label={t('profile.section.language')}>
            <ChipGroup
              options={SUPPORTED_LANGUAGES.map((code) => ({ value: code, label: t(`language.${code}`) }))}
              selected={[language]}
              onToggle={(value: AppLanguage) => setLanguage(value)}
            />
          </FormSection>

          <FormSection label={t('profile.section.level')}>
            <ChipGroup
              options={LEVELS.map((value) => ({ value, label: t(`profile.level.${value}`) }))}
              selected={[form.level]}
              onToggle={(value) => {
                setSaved(false);
                setForm((f) => ({ ...f, level: value }));
              }}
            />
          </FormSection>

          <FormSection label={t('profile.section.goal')}>
            <ChipGroup
              options={GOALS.map((value) => ({ value, label: t(`profile.goal.${value}`) }))}
              selected={[form.goal]}
              onToggle={(value) => {
                setSaved(false);
                setForm((f) => ({ ...f, goal: value }));
              }}
            />
          </FormSection>

          <FormSection label={t('profile.section.units')}>
            <ChipGroup
              options={UNITS.map((value) => ({ value, label: t(`profile.unit.${value}`) }))}
              selected={[form.unit]}
              onToggle={(value) => {
                setSaved(false);
                setForm((f) => ({ ...f, unit: value }));
              }}
            />
            <ChipGroup
              options={POOL_LENGTHS.map((value) => ({
                value: String(value) as '25' | '50',
                label: t('profile.poolLength', { length: value, unit: unitAbbrev(form.unit) }),
              }))}
              selected={[String(form.poolLength) as '25' | '50']}
              onToggle={(value) => {
                setSaved(false);
                setForm((f) => ({ ...f, poolLength: Number(value) as PoolLength }));
              }}
            />
          </FormSection>

          <FormSection label={t('profile.section.poolSessionsPerWeek')}>
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

          <FormSection label={t('profile.section.poolSessionLength')}>
            <Stepper
              value={form.poolSessionDurationMin}
              min={30}
              max={120}
              step={15}
              suffix={t('common.min')}
              onChange={(v) => {
                setSaved(false);
                setForm((f) => ({ ...f, poolSessionDurationMin: v }));
              }}
            />
          </FormSection>

          <FormSection label={t('profile.section.gymSessionsPerWeek')}>
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

          <FormSection label={t('profile.section.equipment')}>
            <ChipGroup
              options={EQUIPMENT_CATALOG.map((e) => ({ value: e.id, label: `${e.emoji} ${equipmentLabel(e.id, t)}` }))}
              selected={form.equipment}
              onToggle={toggleEquipment}
            />
          </FormSection>

          <FormSection label={t('profile.section.benchmark')}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('profile.benchmark.hint')}
            </ThemedText>
            <ChipGroup
              options={BENCHMARK_DISTANCES.map((value) => ({
                value: String(value) as '100' | '200' | '400' | '1000',
                label: `${value}${unitAbbrev(form.unit)}`,
              }))}
              selected={form.benchmark ? [String(form.benchmark.distance) as '100' | '200' | '400' | '1000'] : []}
              onToggle={(value) => {
                setSaved(false);
                setForm((f) => ({
                  ...f,
                  benchmark: { distance: Number(value), timeSec: f.benchmark?.timeSec ?? 0 },
                }));
              }}
            />
            <ThemedView style={styles.timeRow}>
              <ThemedView style={styles.timeField}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('common.min')}
                </ThemedText>
                <Stepper value={benchmarkMin} min={0} max={30} onChange={(v) => setBenchmarkTime(v, benchmarkSec)} />
              </ThemedView>
              <ThemedView style={styles.timeField}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('common.sec')}
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
                <ThemedText type="link">{t('common.clear')}</ThemedText>
              </Pressable>
            )}
          </FormSection>

          {profile && (
            <FormSection label={t('profile.section.backup')}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('profile.backup.hint')}
              </ThemedText>
              <Pressable
                onPress={handleCopyBackup}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.secondaryButton}>
                  <ThemedText type="smallBold">{t('profile.backup.copy')}</ThemedText>
                </ThemedView>
              </Pressable>
              {copied && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('profile.backup.copied')}
                </ThemedText>
              )}
              <TextInput
                value={restoreText}
                onChangeText={(text) => {
                  setRestoreText(text);
                  setRestoreMessage(null);
                }}
                placeholder={t('profile.backup.restorePlaceholder')}
                placeholderTextColor={theme.textSecondary}
                multiline
                style={[styles.restoreInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
              <Pressable
                onPress={handleRestore}
                disabled={restoreText.trim().length === 0}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.secondaryButton}>
                  <ThemedText type="smallBold">{t('profile.backup.restore')}</ThemedText>
                </ThemedView>
              </Pressable>
              {restoreMessage === 'success' && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('profile.backup.restoreSuccess')}
                </ThemedText>
              )}
              {restoreMessage === 'error' && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('profile.backup.restoreError')}
                </ThemedText>
              )}
            </FormSection>
          )}

          <Pressable onPress={handleSave} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundSelected" style={styles.saveButton}>
              <ThemedText type="smallBold">{profile ? t('profile.save.update') : t('profile.save.create')}</ThemedText>
            </ThemedView>
          </Pressable>
          {saved && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              {t('profile.saved')}
            </ThemedText>
          )}

          <Collapsible title={t('privacy.title')}>
            {(t('privacy.body', { returnObjects: true }) as string[]).map((paragraph, i) => (
              <ThemedText key={i} type="small" style={styles.privacyParagraph}>
                {paragraph}
              </ThemedText>
            ))}
          </Collapsible>
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
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  restoreInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    minHeight: 72,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  pressed: {
    opacity: 0.8,
  },
  privacyParagraph: {
    marginBottom: Spacing.two,
  },
});
