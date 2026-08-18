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
    const plan = generateWeekPlan(
      withProfile({ goal: 'fitness', poolSessionsPerWeek: 1, equipment: ['fins'] }),
    );
    const session = plan.days.find((d) => d.pool)!.pool!;
    expect(session.zone).toBe('aerobicBase');
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
    const shortDistance = shortPlan.days.find((d) => d.pool)!.pool!.totalDistanceM;
    const longDistance = longPlan.days.find((d) => d.pool)!.pool!.totalDistanceM;
    expect(longDistance).toBeGreaterThan(shortDistance);
  });

  it('totalPoolDistanceM matches the sum of each pool session', () => {
    const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: 4 }));
    const expected = plan.days.reduce((sum, d) => sum + (d.pool?.totalDistanceM ?? 0), 0);
    expect(plan.totalPoolDistanceM).toBe(expected);
  });

  it('annotates threshold main sets with a target pace when a benchmark is set', () => {
    const plan = generateWeekPlan(
      withProfile({ goal: 'endurance', poolSessionsPerWeek: 1, benchmark: { distanceM: 400, timeSec: 400 } }),
    );
    const session = plan.days.find((d) => d.pool)!.pool!;
    expect(session.zone).toBe('aerobicBase');
    const mainLabels = session.main.map((s) => s.label).join(' ');
    expect(mainLabels).toMatch(/@ \d+:\d{2}/);
  });

  it('covers more distance for the same duration with a faster benchmark pace', () => {
    const base = withProfile({ poolSessionsPerWeek: 1, poolSessionDurationMin: 60 });
    const slow = generateWeekPlan({ ...base, benchmark: { distanceM: 400, timeSec: 480 } });
    const fast = generateWeekPlan({ ...base, benchmark: { distanceM: 400, timeSec: 300 } });
    expect(fast.totalPoolDistanceM).toBeGreaterThan(slow.totalPoolDistanceM);
  });
});
