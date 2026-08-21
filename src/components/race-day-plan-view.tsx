import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { RaceDayPlan, DistanceUnit } from '@/domain/types';
import { formatSetStep, raceDayPacingText, raceTacticText } from '@/i18n/format';
import { Spacing } from '@/constants/theme';

/**
 * The warmup/pacing/tactics content of a race day plan — no outer title or container, so both
 * the athlete's own Plan-screen Collapsible (src/app/index.tsx) and the coach dashboard's
 * per-athlete insights panel (src/components/coach-dashboard.tsx) can reuse this identical
 * rendering inside whatever wrapper fits their own layout.
 */
export function RaceDayPlanView({ plan, unit }: { plan: RaceDayPlan; unit: DistanceUnit }) {
  const { t } = useTranslation();

  return (
    <>
      <View style={styles.block}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('raceDay.warmupTitle')}
        </ThemedText>
        {plan.warmup.map((step, i) => (
          <ThemedText key={i} type="small">
            • {formatSetStep(step, t, unit)}
          </ThemedText>
        ))}
      </View>
      <View style={styles.block}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('raceDay.pacingTitle')}
        </ThemedText>
        <ThemedText type="small">{raceDayPacingText(plan, unit, t)}</ThemedText>
      </View>
      <View style={styles.block}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('raceDay.tacticsTitle')}
        </ThemedText>
        {plan.tacticalNotes.map((key) => (
          <ThemedText key={key} type="small">
            • {raceTacticText(key, t)}
          </ThemedText>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
});
