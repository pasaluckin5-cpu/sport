import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Collapsible } from '@/components/ui/collapsible';
import { Spacing } from '@/constants/theme';
import { equipmentLabel } from '@/domain/equipment';
import { DAY_KEYS, DistanceUnit, WeekPlan } from '@/domain/types';
import { formatGymBlock, formatSetStep, gymModeLabel, swimSessionTitle, unitAbbrev } from '@/i18n/format';

/**
 * A read-only rendering of someone else's weekly plan — no "mark done"/feedback/share controls,
 * since those act on the *viewer's own* completion history, which doesn't apply here. Used by
 * FriendsPanel to preview a friend's plan (see supabase/migrations/0005_friends_plan_visibility.sql);
 * reuses the same formatSetStep/formatGymBlock formatters the athlete's own Plan screen and the
 * coach dashboard's WorkoutCard render with, so it's already localized and unit-aware.
 */
export function WeekPlanView({ weekPlan, unit }: { weekPlan: WeekPlan; unit: DistanceUnit }) {
  const { t } = useTranslation();
  const abbrev = unitAbbrev(unit);

  return (
    <View style={{ gap: Spacing.one }}>
      {weekPlan.days.map((day) => {
        const titleParts: string[] = [];
        if (day.pool) titleParts.push(`${swimSessionTitle(day.pool.zone, t)} · ${day.pool.totalDistance}${abbrev}`);
        if (day.gym) titleParts.push(`${t(`gymFocus.${day.gym.focus}`)} · ${day.gym.durationMin}${t('common.min')}`);
        const title = titleParts.length > 0 ? titleParts.join(' + ') : t('plan.restDay');

        return (
          <Collapsible key={day.dayIndex} title={`${t(`day.${DAY_KEYS[day.dayIndex]}`)} — ${title}`}>
            {day.pool && (
              <View style={styles.sessionBlock}>
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sessionBlock: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  stepGroup: {
    gap: Spacing.half,
    marginBottom: Spacing.two,
  },
});
