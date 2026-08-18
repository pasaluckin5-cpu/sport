import { describe, expect, it } from 'vitest';

import { generateWeekPlan } from '@/domain/planGenerator';
import { AthleteProfile } from '@/domain/types';

import i18n from './index';
import { focusNoteText, formatDayShareText, formatSetStep, recordsProgressText } from './format';

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

describe('formatSetStep stroke-specific drills', () => {
  it('gives each stroke genuinely different, non-generic drill wording', () => {
    const base = { kind: 'drill' as const, reps: 4, repDistance: 50, distance: 200, equipment: [], zone: 'technique' as const };
    const texts = (['freestyle', 'backstroke', 'breaststroke', 'butterfly'] as const).map((stroke) =>
      formatSetStep({ ...base, stroke }, i18n.t, 'meters'),
    );
    // Every stroke's drill text should be distinct from every other stroke's.
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('generates a real technique-zone drill in an actual plan (not the generic fallback)', () => {
    const plan = generateWeekPlan(
      { ...PROFILE, goal: 'technique', poolSessionsPerWeek: 7, primaryStrokes: ['backstroke'] },
      { weekKey: '2026-W01' },
    );
    const drillStep = plan.days
      .filter((d) => d.pool?.zone === 'technique')
      .flatMap((d) => d.pool!.main)
      .find((s) => s.kind === 'drill')!;
    expect(drillStep).toBeDefined();
    expect(drillStep.stroke).not.toBe('choice');
  });
});

describe('recordsProgressText', () => {
  it('asks for gender first when neither is set', () => {
    expect(recordsProgressText(undefined, undefined, 'meters', i18n.t)).toBe('needsGender');
  });

  it('asks for a benchmark once gender is set', () => {
    expect(recordsProgressText('male', undefined, 'meters', i18n.t)).toBe('needsBenchmark');
  });

  it('compares a real benchmark against the world record and a classification rank', () => {
    const result = recordsProgressText('male', { distance: 100, timeSec: 65 }, 'meters', i18n.t);
    expect(result).not.toBe('needsGender');
    expect(result).not.toBe('needsBenchmark');
    const progress = result as Exclude<typeof result, 'needsGender' | 'needsBenchmark'>;
    expect(progress.yourTime).toContain('100');
    expect(progress.worldRecord).toBeDefined();
    expect(progress.percentOff).toBeDefined();
    expect(progress.goal).toBeTruthy();
  });

  it('congratulates a time faster than the world record instead of a negative percentOff', () => {
    const result = recordsProgressText('male', { distance: 100, timeSec: 40 }, 'meters', i18n.t);
    const progress = result as Exclude<typeof result, 'needsGender' | 'needsBenchmark'>;
    expect(progress.percentOff).toBeUndefined();
  });
});

describe('focusNoteText', () => {
  it('returns null with no stated specialty', () => {
    expect(focusNoteText(undefined, undefined, 'meters', i18n.t)).toBeNull();
  });

  it('mentions the stroke and distance when both are set', () => {
    const text = focusNoteText(['butterfly'], [100], 'meters', i18n.t);
    expect(text).toContain('butterfly');
    expect(text).toContain('100m');
  });
});
