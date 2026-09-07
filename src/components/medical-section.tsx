import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { InjurySeverity, MedicalCondition, PainArea } from '@/domain/types';
import { useAuth } from '@/state/auth-context';
import { useMedical } from '@/state/medical-context';

const INJURY_AREAS: PainArea[] = ['shoulder', 'knee', 'back', 'wrist', 'hip', 'ankle', 'other'];
const SEVERITIES: InjurySeverity[] = ['mild', 'moderate', 'severe'];
const CONDITIONS: MedicalCondition[] = [
  'asthma',
  'heartCondition',
  'pregnancy',
  'diabetes',
  'highBloodPressure',
  'epilepsy',
  'scoliosis',
  'osteoporosis',
  'anemia',
  'recentSurgery',
  'other',
];

/**
 * Self-declared, not diagnosed — the disclaimer here is load-bearing, not boilerplate (same
 * framing as learn.tsx's safety disclaimer). Shared between the Profile screen (where it's
 * edited) and anywhere the resulting caution needs restating in full.
 */
export function MedicalDisclaimer() {
  const { t } = useTranslation();
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {t('medical.disclaimer')}
    </ThemedText>
  );
}

export function MedicalSection() {
  const { t } = useTranslation();
  const { medical, toggleInjury, setInjurySeverity, toggleCondition, setShareWithCoach } = useMedical();
  const { isConfigured, session } = useAuth();

  return (
    <View style={{ gap: Spacing.two }}>
      <MedicalDisclaimer />

      <ThemedText type="small" themeColor="textSecondary">
        {t('medical.injuriesLabel')}
      </ThemedText>
      <ChipGroup
        options={INJURY_AREAS.map((area) => ({ value: area, label: t(`feedback.pain.${area}`) }))}
        selected={medical.injuries.map((i) => i.area)}
        onToggle={toggleInjury}
      />
      {medical.injuries.map((injury) => (
        <ThemedView key={injury.area} style={{ gap: Spacing.one, marginLeft: Spacing.three }}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('feedback.pain.' + injury.area)} · {t('medical.severityLabel')}
          </ThemedText>
          <ChipGroup
            options={SEVERITIES.map((s) => ({ value: s, label: t(`medical.severity.${s}`) }))}
            selected={[injury.severity]}
            onToggle={(s) => setInjurySeverity(injury.area, s)}
          />
        </ThemedView>
      ))}

      <ThemedText type="small" themeColor="textSecondary">
        {t('medical.conditionsLabel')}
      </ThemedText>
      <ChipGroup
        options={CONDITIONS.map((c) => ({ value: c, label: t(`medical.condition.${c}`) }))}
        selected={medical.conditions}
        onToggle={toggleCondition}
      />

      {isConfigured && (
        <ThemedView style={{ gap: Spacing.one, marginTop: Spacing.two }}>
          <Pressable
            onPress={() => setShareWithCoach(!medical.shareWithCoach)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <ThemedText type="small" themeColor={medical.shareWithCoach ? 'text' : 'textSecondary'}>
              {medical.shareWithCoach ? '☑ ' : '☐ '}
              {t('medical.shareWithCoach.label')}
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            {session ? t('medical.shareWithCoach.hint') : t('medical.shareWithCoach.hintSignedOut')}
          </ThemedText>
        </ThemedView>
      )}
    </View>
  );
}
