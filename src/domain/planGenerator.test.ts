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

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('schedules exactly %i pool sessions when requested', (count) => {
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
    // generatedAt is a real timestamp (not derived from the profile/weekKey), so it's excluded
    // from the determinism check — everything else about the plan must match exactly.
    const { generatedAt: _a, ...a } = generateWeekPlan(profile, { weekKey: '2026-W10' });
    const { generatedAt: _b, ...b } = generateWeekPlan(profile, { weekKey: '2026-W10' });
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

  describe('gym-only profiles (zero pool sessions)', () => {
    it('produces no pool sessions and no swim distance', () => {
      const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: 0, gymSessionsPerWeek: 4 }));
      expect(plan.days.every((d) => !d.pool)).toBe(true);
      expect(plan.totalPoolDistance).toBe(0);
    });

    it('spreads gym days evenly across the week rather than clustering them', () => {
      const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: 0, gymSessionsPerWeek: 3 }));
      const gymDayIndices = plan.days.filter((d) => d.gym).map((d) => d.dayIndex);
      expect(gymDayIndices).toEqual([0, 2, 4]); // Mon/Wed/Fri, same spread as 3 pool sessions/week
    });

    it('uses the general-fitness catalog with no swim-benefit tags', () => {
      const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: 0, gymSessionsPerWeek: 5 }));
      for (const day of plan.days) {
        if (!day.gym) continue;
        expect(day.gym.mode).toBe('generalFitness');
        for (const block of day.gym.blocks) {
          expect(block.benefit).toBeUndefined();
        }
      }
    });
  });

  describe('swim dryland gym mode (at least one pool session)', () => {
    it('tags every dryland exercise with a swim benefit', () => {
      const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: 3, gymSessionsPerWeek: 5 }));
      const gymDays = plan.days.filter((d) => d.gym);
      expect(gymDays.length).toBeGreaterThan(0);
      for (const day of gymDays) {
        expect(day.gym!.mode).toBe('swimDryland');
        for (const block of day.gym!.blocks) {
          if (block.exercise === 'conditioningFinisher') continue;
          expect(block.benefit).toBeDefined();
        }
      }
    });
  });

  it('always gives a swim-dryland gym day a fullBody focus regardless of goal (a periodized A/B/C program, not a goal-based body-part split)', () => {
    const speedPlan = generateWeekPlan(withProfile({ goal: 'speed', poolSessionsPerWeek: 3, gymSessionsPerWeek: 1 }));
    const techniquePlan = generateWeekPlan(
      withProfile({ goal: 'technique', poolSessionsPerWeek: 3, gymSessionsPerWeek: 1 }),
    );
    expect(speedPlan.days.find((d) => d.gym)!.gym!.focus).toBe('fullBody');
    expect(techniquePlan.days.find((d) => d.gym)!.gym!.focus).toBe('fullBody');
  });

  it("gives a 'speed' goal's single general-fitness gym day a lowerBody focus, and 'technique's a mobility focus", () => {
    const speedPlan = generateWeekPlan(withProfile({ goal: 'speed', poolSessionsPerWeek: 0, gymSessionsPerWeek: 1 }));
    const techniquePlan = generateWeekPlan(
      withProfile({ goal: 'technique', poolSessionsPerWeek: 0, gymSessionsPerWeek: 1 }),
    );
    expect(speedPlan.days.find((d) => d.gym)!.gym!.focus).toBe('lowerBody');
    expect(techniquePlan.days.find((d) => d.gym)!.gym!.focus).toBe('mobility');
  });

  describe('general-fitness gym split/training style selection', () => {
    it('follows an explicitly chosen split instead of the goal-based rotation', () => {
      const plan = generateWeekPlan(
        withProfile({ goal: 'speed', poolSessionsPerWeek: 0, gymSessionsPerWeek: 2, gymSplit: 'upperLower' }),
      );
      const focuses = plan.days.filter((d) => d.gym).map((d) => d.gym!.focus);
      expect(focuses).toEqual(['upperBody', 'lowerBody']);
    });

    it('cycles a longer split (broSplit) across more gym days than fullBody would', () => {
      const plan = generateWeekPlan(
        withProfile({ poolSessionsPerWeek: 0, gymSessionsPerWeek: 4, gymSplit: 'broSplit' }),
      );
      const focuses = plan.days.filter((d) => d.gym).map((d) => d.gym!.focus);
      expect(focuses).toEqual(['chest', 'back', 'shoulders', 'lowerBody']);
    });

    it('falls back to the goal-based rotation when no split is chosen', () => {
      const plan = generateWeekPlan(withProfile({ goal: 'speed', poolSessionsPerWeek: 0, gymSessionsPerWeek: 1 }));
      expect(plan.days.find((d) => d.gym)!.gym!.focus).toBe('lowerBody');
    });

    it('applies the chosen training style scheme to every gym block', () => {
      const plan = generateWeekPlan(
        withProfile({ poolSessionsPerWeek: 0, gymSessionsPerWeek: 1, gymTrainingStyle: 'strength' }),
      );
      const gymDay = plan.days.find((d) => d.gym)!;
      expect(gymDay.gym!.blocks.length).toBeGreaterThan(0);
      for (const block of gymDay.gym!.blocks) {
        expect(block.sets).toBe(5);
        expect(block.reps).toBe('4-6');
      }
    });

    it('replaces the gym session with a single cardio block for the cardio style', () => {
      const plan = generateWeekPlan(
        withProfile({ poolSessionsPerWeek: 0, gymSessionsPerWeek: 1, gymTrainingStyle: 'cardio' }),
      );
      const gymDay = plan.days.find((d) => d.gym)!;
      expect(gymDay.gym!.blocks).toHaveLength(1);
      expect(gymDay.gym!.blocks[0].exercise).toBe('cardioSession');
    });

    it('ignores gymSplit/gymTrainingStyle in swim-dryland mode (always fullBody, A/B/C program)', () => {
      const plan = generateWeekPlan(
        withProfile({
          poolSessionsPerWeek: 3,
          gymSessionsPerWeek: 1,
          gymSplit: 'broSplit',
          gymTrainingStyle: 'strength',
        }),
      );
      const gymDay = plan.days.find((d) => d.gym)!;
      expect(gymDay.gym!.focus).toBe('fullBody');
      expect(gymDay.gym!.mode).toBe('swimDryland');
    });
  });

  describe('specialization: primary strokes and race distances', () => {
    it('uses the stated primary stroke in main-set steps instead of the freestyle-heavy default', () => {
      const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: 7, primaryStrokes: ['breaststroke'] }));
      const strokesUsed = new Set(
        plan.days
          .filter((d) => d.pool)
          .flatMap((d) => d.pool!.main)
          .map((s) => s.stroke)
          .filter(Boolean),
      );
      expect(strokesUsed).toContain('breaststroke');
    });

    it('gives a stroke-appropriate technique drill for a stated primary stroke', () => {
      const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: 7, goal: 'technique', primaryStrokes: ['butterfly'] }));
      const techniqueDay = plan.days.find((d) => d.pool?.zone === 'technique')!;
      const drillStep = techniqueDay.pool!.main.find((s) => s.kind === 'drill')!;
      expect(drillStep.stroke).not.toBe('choice');
    });

    it('gives a sprint specialist shorter main-set reps than a distance specialist', () => {
      const base = withProfile({ goal: 'endurance', poolSessionsPerWeek: 7, level: 'advanced' });
      const sprintPlan = generateWeekPlan({ ...base, primaryDistances: [50] });
      const distancePlan = generateWeekPlan({ ...base, primaryDistances: [1500] });
      const sprintThreshold = sprintPlan.days.find((d) => d.pool?.zone === 'threshold')!.pool!.main[0];
      const distanceThreshold = distancePlan.days.find((d) => d.pool?.zone === 'threshold')!.pool!.main[0];
      expect(sprintThreshold.repDistance).toBeLessThan(distanceThreshold.repDistance);
    });

    it('gives a sprint specialist more rest than a distance specialist at the same zone', () => {
      const base = withProfile({ goal: 'endurance', poolSessionsPerWeek: 7, level: 'advanced' });
      const sprintPlan = generateWeekPlan({ ...base, primaryDistances: [50] });
      const distancePlan = generateWeekPlan({ ...base, primaryDistances: [1500] });
      const sprintThreshold = sprintPlan.days.find((d) => d.pool?.zone === 'threshold')!.pool!.main[0];
      const distanceThreshold = distancePlan.days.find((d) => d.pool?.zone === 'threshold')!.pool!.main[0];
      expect(sprintThreshold.restSec!).toBeGreaterThan(distanceThreshold.restSec!);
    });

    it.each([2, 3, 4, 5, 6, 7])(
      'shows the primary stroke somewhere in the week for every week key at %i sessions/week',
      (count) => {
        // Regression test: stroke rotation used to be indexed by weekday, and several session
        // counts (1/3/4/6) schedule only same-parity weekdays (e.g. 3/week = Mon/Wed/Fri, all
        // even) — with a period-2 rotation that systematically hid the primary stroke from
        // entire weeks depending on the week's hash offset. It's now indexed by the session's
        // position within the week instead, which can't collide with weekday parity.
        for (const weekKey of ['2026-W01', '2026-W02', '2026-W03', '2026-W04', '2026-W05', '2026-W06', '2026-W07']) {
          const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: count, primaryStrokes: ['butterfly'] }), {
            weekKey,
          });
          const strokesUsed = plan.days
            .filter((d) => d.pool)
            .flatMap((d) => d.pool!.main)
            .map((s) => s.stroke);
          expect(strokesUsed).toContain('butterfly');
        }
      },
    );

    it('still rounds specialty-scaled reps to a whole pool length', () => {
      const plan = generateWeekPlan(
        withProfile({ poolLength: 50, poolSessionsPerWeek: 7, level: 'advanced', primaryDistances: [50] }),
      );
      for (const day of plan.days) {
        if (!day.pool) continue;
        for (const step of day.pool.main) {
          expect(step.repDistance % 50).toBe(0);
        }
      }
    });
  });

  describe('periodization: goal race date', () => {
    it('leaves periodizationPhase undefined with no goal race date', () => {
      const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: 3 }));
      expect(plan.periodizationPhase).toBeUndefined();
    });

    it('sets a base-phase periodizationPhase far out from a goal race date', () => {
      const plan = generateWeekPlan(withProfile({ poolSessionsPerWeek: 3, goalRaceDate: '2027-12-31' }), {
        weekKey: '2026-W10',
      });
      expect(plan.periodizationPhase).toBe('base');
    });

    it('cuts pool volume in the taper week right before the goal race', () => {
      const base = withProfile({ poolSessionsPerWeek: 3, poolSessionDurationMin: 60 });
      const baselinePlan = generateWeekPlan(base, { weekKey: '2026-W10' });
      // 2026-W10's Monday is 2026-03-02 — 5 days later is inside the taper window (<=7 days out).
      const taperPlan = generateWeekPlan({ ...base, goalRaceDate: '2026-03-07' }, { weekKey: '2026-W10' });
      expect(taperPlan.periodizationPhase).toBe('taper');
      expect(taperPlan.totalPoolDistance).toBeLessThan(baselinePlan.totalPoolDistance);
    });
  });

  describe('post-session feedback adaptation', () => {
    it('reduces pool volume after a run of sessions logged as too hard', () => {
      const profile = withProfile({ poolSessionsPerWeek: 3, poolSessionDurationMin: 60 });
      const neutralPlan = generateWeekPlan(profile, { weekKey: '2026-W10' });
      const struggledPlan = generateWeekPlan(profile, {
        weekKey: '2026-W10',
        feedbackHistory: [{ difficulty: 'tooHard' }, { difficulty: 'tooHard' }, { difficulty: 'hard' }],
      });
      expect(struggledPlan.totalPoolDistance).toBeLessThan(neutralPlan.totalPoolDistance);
    });

    it('drops paddles and swaps upperBody gym focus to mobility after recent shoulder pain', () => {
      const profile = withProfile({
        poolSessionsPerWeek: 3,
        gymSessionsPerWeek: 5,
        equipment: ['paddles'],
        goal: 'fitness',
      });
      const plan = generateWeekPlan(profile, {
        weekKey: '2026-W10',
        feedbackHistory: [{ difficulty: 'hard', pain: ['shoulder'] }, { difficulty: 'moderate', pain: ['shoulder'] }],
      });
      for (const day of plan.days) {
        if (day.pool) expect(day.pool.equipmentUsed).not.toContain('paddles');
        if (day.gym) expect(day.gym.focus).not.toBe('upperBody');
      }
    });

    it('reacts to shoulder pain from a single sample, but waits for 2+ samples before adjusting volume', () => {
      const profile = withProfile({
        poolSessionsPerWeek: 3,
        gymSessionsPerWeek: 1,
        equipment: ['paddles'],
        goal: 'fitness',
      });
      const neutralPlan = generateWeekPlan(profile, { weekKey: '2026-W10' });
      const onePainSamplePlan = generateWeekPlan(profile, {
        weekKey: '2026-W10',
        feedbackHistory: [{ difficulty: 'hard', pain: ['shoulder'] }],
      });
      // Volume multiplier needs >=2 feedback samples to trust the "too hard" trend...
      expect(onePainSamplePlan.totalPoolDistance).toBe(neutralPlan.totalPoolDistance);
      // ...but shoulder-pain avoidance itself isn't gated on sample count — erring toward
      // caution on injury risk matters more than waiting to confirm a trend.
      for (const day of onePainSamplePlan.days) {
        if (day.pool) expect(day.pool.equipmentUsed).not.toContain('paddles');
      }
    });
  });
});

describe('medical adjustments', () => {
  it('caps pool zone intensity for a heart condition or pregnancy', () => {
    const profile = withProfile({ poolSessionsPerWeek: 7, goal: 'speed' });
    const plan = generateWeekPlan(profile, {
      weekKey: '2026-W10',
      medical: { injuries: [], conditions: ['heartCondition'] },
    });
    const HARD_ZONES = ['vo2max', 'sprint'];
    for (const day of plan.days) {
      if (day.pool) expect(HARD_ZONES).not.toContain(day.pool.zone);
    }
  });

  it('reduces pool volume for recent surgery', () => {
    const profile = withProfile({ poolSessionsPerWeek: 3, goal: 'fitness' });
    const neutralPlan = generateWeekPlan(profile, { weekKey: '2026-W10' });
    const surgeryPlan = generateWeekPlan(profile, {
      weekKey: '2026-W10',
      medical: { injuries: [], conditions: ['recentSurgery'] },
    });
    expect(surgeryPlan.totalPoolDistance).toBeLessThan(neutralPlan.totalPoolDistance);
  });

  it('avoids breaststroke for a knee injury, falling back to freestyle', () => {
    const profile = withProfile({ poolSessionsPerWeek: 7, primaryStrokes: ['breaststroke'] });
    const plan = generateWeekPlan(profile, {
      weekKey: '2026-W10',
      medical: { injuries: [{ area: 'knee', severity: 'mild' }], conditions: [] },
    });
    const strokesUsed = new Set(
      plan.days
        .filter((d) => d.pool)
        .flatMap((d) => d.pool!.main)
        .map((s) => s.stroke)
        .filter(Boolean),
    );
    expect(strokesUsed).not.toContain('breaststroke');
  });

  it('excludes shoulder-loading exercises from swim-dryland gym blocks for a shoulder injury', () => {
    const profile = withProfile({ poolSessionsPerWeek: 3, gymSessionsPerWeek: 3 });
    const plan = generateWeekPlan(profile, {
      weekKey: '2026-W10',
      medical: { injuries: [{ area: 'shoulder', severity: 'moderate' }], conditions: [] },
    });
    const shoulderLoading = ['benchPress', 'shoulderPress', 'pullUps', 'pushUps', 'pushUpPlus', 'tricepsDips', 'medBallRotationalThrow'];
    for (const day of plan.days) {
      if (!day.gym) continue;
      for (const block of day.gym.blocks) {
        expect(shoulderLoading).not.toContain(block.exercise);
      }
    }
  });

  it('excludes knee-loading exercises from general-fitness gym blocks for a knee injury', () => {
    const profile = withProfile({ poolSessionsPerWeek: 0, gymSessionsPerWeek: 3 });
    const plan = generateWeekPlan(profile, {
      weekKey: '2026-W10',
      medical: { injuries: [{ area: 'knee', severity: 'moderate' }], conditions: [] },
    });
    for (const day of plan.days) {
      if (!day.gym) continue;
      for (const block of day.gym.blocks) {
        expect(block.exercise).not.toBe('squats');
      }
    }
  });

  it('leaves the plan unaffected with no medical data', () => {
    const profile = withProfile({ poolSessionsPerWeek: 3, gymSessionsPerWeek: 2 });
    const noOption = generateWeekPlan(profile, { weekKey: '2026-W10' });
    const emptyMedical = generateWeekPlan(profile, { weekKey: '2026-W10', medical: { injuries: [], conditions: [] } });
    expect(noOption.days).toEqual(emptyMedical.days);
    expect(noOption.totalPoolDistance).toBe(emptyMedical.totalPoolDistance);
  });

  it('drops the drag parachute from pool sets for asthma, and caps out repeated all-out sprints', () => {
    const profile = withProfile({ poolSessionsPerWeek: 7, goal: 'speed', equipment: ['parachute'] });
    const plan = generateWeekPlan(profile, {
      weekKey: '2026-W10',
      medical: { injuries: [], conditions: ['asthma'] },
    });
    for (const day of plan.days) {
      if (!day.pool) continue;
      expect(day.pool.zone).not.toBe('sprint');
      expect(day.pool.equipmentUsed).not.toContain('parachute');
    }
  });

  it('drops the snorkel from pool sets for epilepsy', () => {
    const profile = withProfile({ poolSessionsPerWeek: 7, equipment: ['snorkel'] });
    const plan = generateWeekPlan(profile, {
      weekKey: '2026-W10',
      medical: { injuries: [], conditions: ['epilepsy'] },
    });
    for (const day of plan.days) {
      if (day.pool) expect(day.pool.equipmentUsed).not.toContain('snorkel');
    }
  });

  it('excludes explosive/plyometric exercises from gym blocks for high blood pressure', () => {
    const profile = withProfile({ poolSessionsPerWeek: 3, gymSessionsPerWeek: 3 });
    const plan = generateWeekPlan(profile, {
      weekKey: '2026-W10',
      medical: { injuries: [], conditions: ['highBloodPressure'] },
    });
    for (const day of plan.days) {
      if (!day.gym) continue;
      for (const block of day.gym.blocks) {
        expect(['squatJump', 'medBallRotationalThrow']).not.toContain(block.exercise);
      }
    }
  });

  it('caps pool zone intensity and drops explosive gym exercises for pregnancy', () => {
    const profile = withProfile({ poolSessionsPerWeek: 3, gymSessionsPerWeek: 3, goal: 'speed' });
    const plan = generateWeekPlan(profile, {
      weekKey: '2026-W10',
      medical: { injuries: [], conditions: ['pregnancy'] },
    });
    for (const day of plan.days) {
      if (day.pool) expect(['vo2max', 'sprint']).not.toContain(day.pool.zone);
      if (day.gym) {
        for (const block of day.gym.blocks) {
          expect(['squatJump', 'medBallRotationalThrow']).not.toContain(block.exercise);
        }
      }
    }
  });

  it('applies no zone cap for diabetes, only a volume reduction', () => {
    const profile = withProfile({ poolSessionsPerWeek: 7, goal: 'speed' });
    const neutralPlan = generateWeekPlan(profile, { weekKey: '2026-W10' });
    const diabetesPlan = generateWeekPlan(profile, {
      weekKey: '2026-W10',
      medical: { injuries: [], conditions: ['diabetes'] },
    });
    // Same zone rotation (no cap applied)...
    expect(diabetesPlan.days.map((d) => d.pool?.zone)).toEqual(neutralPlan.days.map((d) => d.pool?.zone));
    // ...but less total volume.
    expect(diabetesPlan.totalPoolDistance).toBeLessThan(neutralPlan.totalPoolDistance);
  });

  it('gives different conditions distinguishable effects on the same profile', () => {
    const profile = withProfile({ poolSessionsPerWeek: 7, goal: 'speed', equipment: ['parachute', 'snorkel'] });
    const asthmaPlan = generateWeekPlan(profile, { weekKey: '2026-W10', medical: { injuries: [], conditions: ['asthma'] } });
    const epilepsyPlan = generateWeekPlan(profile, { weekKey: '2026-W10', medical: { injuries: [], conditions: ['epilepsy'] } });
    const heartPlan = generateWeekPlan(profile, { weekKey: '2026-W10', medical: { injuries: [], conditions: ['heartCondition'] } });
    // Asthma drops the parachute but keeps the snorkel; epilepsy is the reverse.
    const asthmaEquip = new Set(asthmaPlan.days.flatMap((d) => d.pool?.equipmentUsed ?? []));
    const epilepsyEquip = new Set(epilepsyPlan.days.flatMap((d) => d.pool?.equipmentUsed ?? []));
    expect(asthmaEquip.has('parachute')).toBe(false);
    expect(epilepsyEquip.has('snorkel')).toBe(false);
    // Asthma/epilepsy only cap out sprint (vo2max is still allowed); a heart condition caps
    // harder, at threshold.
    expect(asthmaPlan.days.some((d) => d.pool?.zone === 'vo2max')).toBe(true);
    expect(heartPlan.days.some((d) => d.pool?.zone === 'vo2max')).toBe(false);
  });
});
