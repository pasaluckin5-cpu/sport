import { describe, expect, it } from 'vitest';

import { generateWeekPlan } from '@/domain/planGenerator';
import { AthleteProfile } from '@/domain/types';

import i18n from './index';
import { formatDayShareText } from './format';

const PROFILE: AthleteProfile = {
  level: 'intermediate',
  goal: 'fitness',
  poolSessionsPerWeek: 3,
  poolSessionDurationMin: 60,
  gymSessionsPerWeek: 1,
  equipment: ['fins'],
  unit: 'meters',
  poolLength: 25,
};

describe('formatDayShareText', () => {
  it('includes the app name, day name, and every set for a pool day', () => {
    const plan = generateWeekPlan(PROFILE, { weekKey: '2026-W01' });
    const poolDay = plan.days.find((d) => d.pool)!;
    const text = formatDayShareText(poolDay, 'Monday', 'meters', i18n.t);

    expect(text).toContain('Swim Planner');
    expect(text).toContain('Monday');
    const totalSteps = poolDay.pool!.warmup.length + poolDay.pool!.main.length + poolDay.pool!.cooldown.length;
    const bulletLines = text.split('\n').filter((line) => line.startsWith('- '));
    expect(bulletLines).toHaveLength(totalSteps);
  });

  it('includes gym blocks for a gym day', () => {
    const plan = generateWeekPlan(PROFILE, { weekKey: '2026-W01' });
    const gymDay = plan.days.find((d) => d.gym)!;
    const text = formatDayShareText(gymDay, 'Tuesday', 'meters', i18n.t);
    for (const block of gymDay.gym!.blocks) {
      expect(text).toContain(i18n.t(`gymExercise.${block.exercise}`));
    }
  });

  it('renders in Russian when the instance language is Russian', async () => {
    await i18n.changeLanguage('ru');
    const plan = generateWeekPlan(PROFILE, { weekKey: '2026-W01' });
    const poolDay = plan.days.find((d) => d.pool)!;
    const text = formatDayShareText(poolDay, 'Понедельник', 'meters', i18n.t);
    expect(text).toContain('Понедельник');
    await i18n.changeLanguage('en');
  });
});
