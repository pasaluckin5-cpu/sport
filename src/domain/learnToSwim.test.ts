import { describe, expect, it } from 'vitest';

import { allocateStageDays, buildLearnToSwimPlan, computeTotalDays, isMilestoneUnlocked, STAGE_ORDER } from './learnToSwim';
import { LearnToSwimStage } from './types';

describe('computeTotalDays', () => {
  it('is 30 days at the 20 min/day reference pace', () => {
    expect(computeTotalDays(20)).toBe(30);
  });

  it('finishes sooner with more minutes per day', () => {
    const short = computeTotalDays(20);
    const long = computeTotalDays(40);
    expect(long).toBeLessThan(short);
  });

  it('takes longer with fewer minutes per day', () => {
    const fast = computeTotalDays(30);
    const slow = computeTotalDays(10);
    expect(slow).toBeGreaterThan(fast);
  });

  it('never compresses below the minimum, no matter how much daily time is chosen', () => {
    expect(computeTotalDays(120)).toBeGreaterThanOrEqual(14);
    expect(computeTotalDays(1000)).toBeGreaterThanOrEqual(14);
  });

  it('never stretches past the maximum, no matter how little daily time is chosen', () => {
    expect(computeTotalDays(1)).toBeLessThanOrEqual(60);
    expect(computeTotalDays(2)).toBeLessThanOrEqual(60);
  });

  it('is monotonically non-increasing as minutesPerDay increases', () => {
    const minutesOptions = [5, 10, 15, 20, 25, 30, 40, 50, 60, 90];
    const totals = minutesOptions.map((m) => computeTotalDays(m));
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]).toBeLessThanOrEqual(totals[i - 1]);
    }
  });
});

describe('allocateStageDays', () => {
  it('sums to exactly totalDays for a range of totals', () => {
    for (const totalDays of [14, 15, 20, 30, 45, 60]) {
      const allocation = allocateStageDays(totalDays);
      const sum = allocation.reduce((s, a) => s + a.days, 0);
      expect(sum).toBe(totalDays);
    }
  });

  it('gives every stage at least 1 day at the minimum total (14)', () => {
    const allocation = allocateStageDays(14);
    for (const { days } of allocation) {
      expect(days).toBeGreaterThanOrEqual(1);
    }
  });

  it('preserves the curriculum stage order', () => {
    const allocation = allocateStageDays(30);
    const expectedOrder: LearnToSwimStage[] = [
      'waterComfort',
      'floating',
      'gliding',
      'kicking',
      'armStroke',
      'breathingCoordination',
      'fullStrokeEndurance',
    ];
    expect(allocation.map((a) => a.stage)).toEqual(expectedOrder);
  });
});

describe('buildLearnToSwimPlan', () => {
  it('produces exactly totalDays day entries, numbered 1..totalDays', () => {
    const plan = buildLearnToSwimPlan(20);
    expect(plan.days).toHaveLength(plan.totalDays);
    expect(plan.days.map((d) => d.dayNumber)).toEqual(Array.from({ length: plan.totalDays }, (_, i) => i + 1));
  });

  it('is deterministic for the same minutesPerDay', () => {
    const a = buildLearnToSwimPlan(25);
    const b = buildLearnToSwimPlan(25);
    expect(a).toEqual(b);
  });

  it('gives every day at least one drill, summing exactly to minutesPerDay', () => {
    for (const minutesPerDay of [10, 15, 20, 30, 45, 60]) {
      const plan = buildLearnToSwimPlan(minutesPerDay);
      for (const day of plan.days) {
        expect(day.drills.length).toBeGreaterThan(0);
        expect(day.totalMinutes).toBe(minutesPerDay);
        expect(day.drills.reduce((sum, d) => sum + d.minutes, 0)).toBe(minutesPerDay);
      }
    }
  });

  it('walks through stages in curriculum order across the days, each stage a contiguous block', () => {
    const plan = buildLearnToSwimPlan(20);
    const stageSequence = plan.days.map((d) => d.stage);
    // De-duplicating consecutive runs should reproduce the curriculum order exactly — i.e. no
    // stage is split into two separate blocks or appears out of sequence.
    const dedupedRuns = stageSequence.filter((stage, i) => stage !== stageSequence[i - 1]);
    expect(dedupedRuns).toEqual([
      'waterComfort',
      'floating',
      'gliding',
      'kicking',
      'armStroke',
      'breathingCoordination',
      'fullStrokeEndurance',
    ]);
  });

  it('varies which drills show up across consecutive days of a multi-day stage', () => {
    // 'floating' gets multiple days at the reference pace and has 3 drills to rotate through.
    const plan = buildLearnToSwimPlan(20);
    const floatingDays = plan.days.filter((d) => d.stage === 'floating');
    expect(floatingDays.length).toBeGreaterThan(1);
    const drillSequences = floatingDays.map((d) => d.drills.map((drill) => drill.kind).join(','));
    expect(new Set(drillSequences).size).toBeGreaterThan(1);
  });
});

describe('isMilestoneUnlocked', () => {
  it('unlocks a stage at or before the current stage', () => {
    expect(isMilestoneUnlocked('waterComfort', 'waterComfort')).toBe(true);
    expect(isMilestoneUnlocked('waterComfort', 'fullStrokeEndurance')).toBe(true);
    expect(isMilestoneUnlocked('floating', 'kicking')).toBe(true);
  });

  it('locks a stage after the current stage', () => {
    expect(isMilestoneUnlocked('fullStrokeEndurance', 'waterComfort')).toBe(false);
    expect(isMilestoneUnlocked('kicking', 'gliding')).toBe(false);
  });

  it('unlocks every stage once the program is finished (currentStage: null)', () => {
    for (const stage of STAGE_ORDER) {
      expect(isMilestoneUnlocked(stage, null)).toBe(true);
    }
  });
});
