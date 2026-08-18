import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/chip-group';
import { CoachDashboard } from '@/components/coach-dashboard';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { EQUIPMENT_CATALOG, equipmentLabel } from '@/domain/equipment';
import { DEFAULT_PROFILE } from '@/domain/planGenerator';
import { parseProfileBackup } from '@/domain/profileValidation';
import { AthleteLevel, AthleteProfile, DistanceUnit, Equipment, Gender, PoolLength, RaceStroke, TrainingGoal } from '@/domain/types';
import { unitAbbrev } from '@/i18n/format';
import { AppLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/state/auth-context';
import { useLanguage } from '@/state/language-context';
import { usePlan } from '@/state/plan-context';
import { deleteCloudData } from '@/supabase/sync';

const LEVELS: AthleteLevel[] = ['beginner', 'intermediate', 'advanced'];
const GOALS: TrainingGoal[] = ['fitness', 'endurance', 'speed', 'technique'];
const UNITS: DistanceUnit[] = ['meters', 'yards'];
const POOL_LENGTHS: PoolLength[] = [25, 50];
const BENCHMARK_DISTANCES = [100, 200, 400, 1000];
const RACE_STROKES: RaceStroke[] = ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'im'];
const GENDERS: Gender[] = ['male', 'female'];
// Standard championship race distances differ by course: SCY (yards) meets swim 500/1000/1650
// free instead of the 400/800/1500 used in meters (SCM/LCM) competition.
const METERS_RACE_DISTANCES = [50, 100, 200, 400, 800, 1500];
const YARDS_RACE_DISTANCES = [50, 100, 200, 500, 1000, 1650];

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

function AccountSection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { isConfigured, isReady, session, profile, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  if (!isConfigured) {
    return (
      <FormSection label={t('account.title')}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('account.notConfigured')}
        </ThemedText>
      </FormSection>
    );
  }

  if (!isReady) return null;

  if (session) {
    async function handleDeleteData() {
      await deleteCloudData(session!.user.id);
      setConfirmingDelete(false);
      setDeleteMessage(t('account.deleteDataDone'));
    }

    return (
      <FormSection label={t('account.title')}>
        <ThemedText type="small">{t('account.signedInAs', { email: session.user.email })}</ThemedText>
        {profile && <ThemedText type="small" themeColor="textSecondary">{t(`account.role.${profile.role}`)}</ThemedText>}
        <Pressable onPress={() => signOut()} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.secondaryButton}>
            <ThemedText type="smallBold">{t('account.signOut')}</ThemedText>
          </ThemedView>
        </Pressable>
        {!confirmingDelete ? (
          <Pressable onPress={() => setConfirmingDelete(true)} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText type="link">{t('account.deleteData')}</ThemedText>
          </Pressable>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t('account.deleteDataConfirm')}
            </ThemedText>
            <Pressable onPress={handleDeleteData} style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.secondaryButton}>
                <ThemedText type="smallBold">{t('account.deleteData')}</ThemedText>
              </ThemedView>
            </Pressable>
          </>
        )}
        {deleteMessage && (
          <ThemedText type="small" themeColor="textSecondary">
            {deleteMessage}
          </ThemedText>
        )}
      </FormSection>
    );
  }

  async function handleSubmit() {
    setBusy(true);
    setMessage(null);
    const result = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
    } else if (result.needsConfirmation) {
      setMessage(t('account.needsConfirmation'));
    } else {
      setEmail('');
      setPassword('');
    }
  }

  return (
    <FormSection label={t('account.title')}>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder={t('account.emailLabel')}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        style={[styles.textInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder={t('account.passwordLabel')}
        placeholderTextColor={theme.textSecondary}
        secureTextEntry
        style={[styles.textInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      <Pressable onPress={handleSubmit} disabled={busy || !email || !password} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.secondaryButton}>
          <ThemedText type="smallBold">{t(mode === 'signIn' ? 'account.signIn' : 'account.signUp')}</ThemedText>
        </ThemedView>
      </Pressable>
      <Pressable
        onPress={() => {
          setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          setMessage(null);
        }}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="link">{t(mode === 'signIn' ? 'account.toggleToSignUp' : 'account.toggleToSignIn')}</ThemedText>
      </Pressable>
      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
    </FormSection>
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
  const { profile: authProfile } = useAuth();
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

  function toggleStroke(stroke: RaceStroke) {
    setSaved(false);
    setForm((f) => {
      const current = f.primaryStrokes ?? [];
      return { ...f, primaryStrokes: current.includes(stroke) ? current.filter((s) => s !== stroke) : [...current, stroke] };
    });
  }

  function toggleDistance(distance: number) {
    setSaved(false);
    setForm((f) => {
      const current = f.primaryDistances ?? [];
      return {
        ...f,
        primaryDistances: current.includes(distance) ? current.filter((d) => d !== distance) : [...current, distance],
      };
    });
  }

  const isSwimming = form.poolSessionsPerWeek > 0;

  async function handleSave() {
    // A benchmark with no time set yet isn't a real pace — drop it rather than saving
    // a 0-second time trial that would divide out to a nonsense pace.
    const benchmark = form.benchmark && form.benchmark.timeSec > 0 ? form.benchmark : undefined;
    // Zero pool sessions and zero gym sessions would be an entirely empty week — nudge to a
    // sane gym-only default rather than silently generating a week of nothing but rest days.
    const gymSessionsPerWeek =
      form.poolSessionsPerWeek === 0 && form.gymSessionsPerWeek === 0 ? 3 : form.gymSessionsPerWeek;
    const finalProfile = { ...form, benchmark, gymSessionsPerWeek };
    await updateProfile(finalProfile);
    setForm(finalProfile);
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
          <AccountSection />
          {authProfile?.role === 'coach' && <CoachDashboard />}

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

          <FormSection label={t('profile.section.poolSessionsPerWeek')}>
            <Stepper
              value={form.poolSessionsPerWeek}
              min={0}
              max={7}
              onChange={(v) => {
                setSaved(false);
                setForm((f) => ({ ...f, poolSessionsPerWeek: v }));
              }}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {t('profile.poolSessionsHint')}
            </ThemedText>
          </FormSection>

          {isSwimming && (
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
          )}

          {isSwimming && (
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
          )}

          <FormSection label={t('profile.section.gymSessionsPerWeek')}>
            <Stepper
              value={form.gymSessionsPerWeek}
              min={0}
              max={7}
              onChange={(v) => {
                setSaved(false);
                setForm((f) => ({ ...f, gymSessionsPerWeek: v }));
              }}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {t(isSwimming ? 'profile.gymHint.swim' : 'profile.gymHint.general')}
            </ThemedText>
          </FormSection>

          {isSwimming && (
            <FormSection label={t('profile.section.equipment')}>
              <ChipGroup
                options={EQUIPMENT_CATALOG.map((e) => ({ value: e.id, label: `${e.emoji} ${equipmentLabel(e.id, t)}` }))}
                selected={form.equipment}
                onToggle={toggleEquipment}
              />
            </FormSection>
          )}

          {isSwimming && (
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
          )}

          {isSwimming && (
            <FormSection label={t('profile.section.gender')}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('profile.genderHint')}
              </ThemedText>
              <ChipGroup
                options={GENDERS.map((value) => ({ value, label: t(`profile.gender.${value}`) }))}
                selected={form.gender ? [form.gender] : []}
                onToggle={(value) => {
                  setSaved(false);
                  setForm((f) => ({ ...f, gender: f.gender === value ? undefined : value }));
                }}
              />
            </FormSection>
          )}

          {isSwimming && (
            <FormSection label={t('profile.section.strokes')}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('profile.strokesHint')}
              </ThemedText>
              <ChipGroup
                options={RACE_STROKES.map((value) => ({ value, label: t(`stroke.${value}`) }))}
                selected={form.primaryStrokes ?? []}
                onToggle={toggleStroke}
              />
            </FormSection>
          )}

          {isSwimming && (
            <FormSection label={t('profile.section.distances')}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('profile.distancesHint')}
              </ThemedText>
              <ChipGroup
                options={(form.unit === 'yards' ? YARDS_RACE_DISTANCES : METERS_RACE_DISTANCES).map((value) => ({
                  value: String(value),
                  label: `${value}${unitAbbrev(form.unit)}`,
                }))}
                selected={(form.primaryDistances ?? []).map(String)}
                onToggle={(value) => toggleDistance(Number(value))}
              />
            </FormSection>
          )}

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
  textInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.8,
  },
  privacyParagraph: {
    marginBottom: Spacing.two,
  },
});
