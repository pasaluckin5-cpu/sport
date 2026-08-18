import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE, generateWeekPlan } from './planGenerator';
import { AthleteProfile } from './types';

function withProfile(overrides: Partial<AthleteProfile>): AthleteProfile {
  return { ...DEFAULT_PROFILE, ...overrides };
}

describe('generateWeekPlan', () => {
  it('always returns exactly 7 days', () => {
    const plan = generateWeekPlan(DEFAULT_PROFILE);
    expect(plan.days).toHaveLength(7);
    expect(plan.days.map((d) => d.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7])('schedules exactly %i pool sessions when requested', (count) => {
    const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: count }));
    const poolDays = plan.days.filter((d) => d.pool);
    expect(poolDays).toHaveLength(count);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('schedules exactly %i gym sessions when requested', (count) => {
    const plan = generateWeekPlan(withProfile({ gymSessionsPerWeek: count, poolSessionsPerWeek: 3 }));
    const gymDays = plan.days.filter((d) => d.gym);
    expect(gymDays).toHaveLength(count);
  });

  it('uses no equipment in any set when the athlete has none', () => {
    const plan = generateWeekPlan(withProfile({ equipment: [], poolSessionsPerWeek: 7 }));
    for (const day of plan.days) {
      if (!day.pool) continue;
      const allSteps = [...day.pool.warmup, ...day.pool.main, ...day.pool.cooldown];
      for (const step of allSteps) {
        expect(step.equipment).toHaveLength(0);
      }
      expect(day.pool.equipmentUsed).toHaveLength(0);
    }
  });

  it('puts fins to use on an aerobic-base kick set when the athlete owns fins', () => {
    // All 7 zones in the rotation are scheduled somewhere regardless of the week's rotation
    // offset, so an aerobicBase day is guaranteed to show up.
    const plan = generateWeekPlan(withProfile({ goal: 'fitness', poolSessionsPerWeek: 7, equipment: ['fins'] }));
    const session = plan.days.find((d) => d.pool?.zone === 'aerobicBase')!.pool!;
    expect(session.equipmentUsed).toContain('fins');
  });

  it('never assigns a lower-body gym day right before a hard swim day', () => {
    const plan = generateWeekPlan(
      withProfile({ goal: 'speed', poolSessionsPerWeek: 5, gymSessionsPerWeek: 5 }),
    );
    plan.days.forEach((day, i) => {
      if (day.gym?.focus !== 'lowerBody') return;
      const nextDay = plan.days[(i + 1) % 7];
      if (nextDay.pool) {
        expect(['threshold', 'vo2max', 'sprint']).not.toContain(nextDay.pool.zone);
      }
    });
  });

  it('scales pool session volume up with longer session duration', () => {
    const shortPlan = generateWeekPlan(withProfile({ poolSessionDurationMin: 30, poolSessionsPerWeek: 1 }));
    const longPlan = generateWeekPlan(withProfile({ poolSessionDurationMin: 90, poolSessionsPerWeek: 1 }));
    const shortDistance = shortPlan.days.find((d) => d.pool)!.pool!.totalDistance;
    const longDistance = longPlan.days.find((d) => d.pool)!.pool!.totalDistance;
    expect(longDistance).toBeGreaterThan(shortDistance);
  });

  it('totalPoolDistance matches the sum of each pool session', () => {
    const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: 4 }));
    const expected = plan.days.reduce((sum, d) => sum + (d.pool?.totalDistance ?? 0), 0);
    expect(plan.totalPoolDistance).toBe(expected);
  });

  it('gives paced-zone main-set steps a target pace when a benchmark is set', () => {
    const plan = generateWeekPlan(
      withProfile({ goal: 'endurance', poolSessionsPerWeek: 7, benchmark: { distance: 400, timeSec: 400 } }),
    );
    const pacedSteps = plan.days
      .filter((d) => d.pool)
      .flatMap((d) => d.pool!.main)
      .filter((s) => s.paceSec !== undefined);
    expect(pacedSteps.length).toBeGreaterThan(0);
  });

  it('covers more distance for the same duration with a faster benchmark pace', () => {
    const base = withProfile({ poolSessionsPerWeek: 1, poolSessionDurationMin: 60 });
    const slow = generateWeekPlan({ ...base, benchmark: { distance: 400, timeSec: 480 } });
    const fast = generateWeekPlan({ ...base, benchmark: { distance: 400, timeSec: 300 } });
    expect(fast.totalPoolDistance).toBeGreaterThan(slow.totalPoolDistance);
  });

  it('rounds every set distance to a whole number of pool lengths', () => {
    const plan = generateWeekPlan(withProfile({ poolLength: 50, poolSessionsPerWeek: 3 }));
    for (const day of plan.days) {
      if (!day.pool) continue;
      for (const step of [...day.pool.warmup, ...day.pool.main, ...day.pool.cooldown]) {
        expect(step.repDistance % 50).toBe(0);
      }
    }
  });

  it('covers more yards than meters for the same level and duration (yards are shorter)', () => {
    const metersPlan = generateWeekPlan(withProfile({ unit: 'meters', poolSessionsPerWeek: 1 }));
    const yardsPlan = generateWeekPlan(withProfile({ unit: 'yards', poolSessionsPerWeek: 1 }));
    expect(yardsPlan.totalPoolDistance).toBeGreaterThan(metersPlan.totalPoolDistance);
  });

  it('produces the same plan for the same week key (deterministic)', () => {
    const profile = withProfile({ poolSessionsPerWeek: 4, gymSessionsPerWeek: 2 });
    const a = generateWeekPlan(profile, { weekKey: '2026-W10' });
    const b = generateWeekPlan(profile, { weekKey: '2026-W10' });
    expect(a).toEqual(b);
  });

  it('varies the zone rotation across different weeks', () => {
    const profile = withProfile({ goal: 'fitness', poolSessionsPerWeek: 3 });
    const weekKeys = ['2026-W01', '2026-W02', '2026-W03', '2026-W04', '2026-W05', '2026-W06', '2026-W07'];
    const zoneSequences = weekKeys.map((weekKey) => {
      const plan = generateWeekPlan(profile, { weekKey });
      return plan.days
        .filter((d) => d.pool)
        .map((d) => d.pool!.zone)
        .join(',');
    });
    expect(new Set(zoneSequences).size).toBeGreaterThan(1);
  });
});
