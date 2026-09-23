import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE } from './planGenerator';
import { buildRaceDayPlan } from './raceDayPlan';
import { AthleteProfile } from './types';

function withProfile(overrides: Partial<AthleteProfile>): AthleteProfile {
  return { ...DEFAULT_PROFILE, ...overrides };
}

describe('buildRaceDayPlan', () => {
  it('is undefined with no goal race date', () => {
    expect(buildRaceDayPlan(withProfile({}))).toBeUndefined();
  });

  it('is undefined for a gym-only profile (no swimming, no race)', () => {
    expect(buildRaceDayPlan(withProfile({ poolSessionsPerWeek: 0, goalRaceDate: '2026-12-01' }))).toBeUndefined();
  });

  it('defaults race distance/stroke from primary strokes/distances when set', () => {
    const plan = buildRaceDayPlan(
      withProfile({ goalRaceDate: '2026-12-01', primaryStrokes: ['butterfly'], primaryDistances: [200] }),
    );
    expect(plan?.raceDistance).toBe(200);
    expect(plan?.stroke).toBe('butterfly');
  });

  it('falls back to benchmark distance and freestyle when no primary strokes/distances are set', () => {
    const plan = buildRaceDayPlan(
      withProfile({ goalRaceDate: '2026-12-01', benchmark: { distance: 400, timeSec: 400 } }),
    );
    expect(plan?.raceDistance).toBe(400);
    expect(plan?.stroke).toBe('freestyle');
  });

  it('falls all the way back to 100m freestyle with nothing else set', () => {
    const plan = buildRaceDayPlan(withProfile({ goalRaceDate: '2026-12-01' }));
    expect(plan?.raceDistance).toBe(100);
    expect(plan?.stroke).toBe('freestyle');
  });

  it('produces a non-empty warmup', () => {
    const plan = buildRaceDayPlan(withProfile({ goalRaceDate: '2026-12-01' }));
    expect(plan?.warmup.length).toBeGreaterThan(0);
  });

  it('recommends an even split for short races and a negative split for distance races', () => {
    const sprintPlan = buildRaceDayPlan(withProfile({ goalRaceDate: '2026-12-01', primaryDistances: [100] }));
    const distancePlan = buildRaceDayPlan(withProfile({ goalRaceDate: '2026-12-01', primaryDistances: [800] }));
    expect(sprintPlan?.pacingStrategy).toBe('evenSplit');
    expect(distancePlan?.pacingStrategy).toBe('negativeSplit');
  });

  it('has no target splits without a benchmark', () => {
    const plan = buildRaceDayPlan(withProfile({ goalRaceDate: '2026-12-01', primaryDistances: [200] }));
    expect(plan?.totalTargetSec).toBeUndefined();
    expect(plan?.splits).toBeUndefined();
  });

  it('computes splits that sum to the total target time when a benchmark is set', () => {
    const plan = buildRaceDayPlan(
      withProfile({ goalRaceDate: '2026-12-01', primaryDistances: [400], benchmark: { distance: 400, timeSec: 400 } }),
    );
    expect(plan?.totalTargetSec).toBeDefined();
    expect(plan?.splits).toHaveLength(2);
    const sum = plan!.splits!.reduce((s, split) => s + split.targetSec, 0);
    expect(sum).toBeCloseTo(plan!.totalTargetSec!, 5);
  });

  it('gives a negative split a slower first half and faster second half', () => {
    const plan = buildRaceDayPlan(
      withProfile({ goalRaceDate: '2026-12-01', primaryDistances: [800], benchmark: { distance: 400, timeSec: 400 } }),
    );
    const [firstHalf, secondHalf] = plan!.splits!;
    expect(firstHalf.targetSec).toBeGreaterThan(secondHalf.targetSec);
  });

  it('gives an even split identical first and second halves', () => {
    const plan = buildRaceDayPlan(
      withProfile({ goalRaceDate: '2026-12-01', primaryDistances: [100], benchmark: { distance: 400, timeSec: 400 } }),
    );
    const [firstHalf, secondHalf] = plan!.splits!;
    expect(firstHalf.targetSec).toBeCloseTo(secondHalf.targetSec, 5);
  });

  it('includes stroke-specific tactical notes for each of the four solo strokes', () => {
    for (const stroke of ['freestyle', 'backstroke', 'breaststroke', 'butterfly'] as const) {
      const plan = buildRaceDayPlan(withProfile({ goalRaceDate: '2026-12-01', primaryStrokes: [stroke] }));
      expect(plan?.tacticalNotes.some((k) => k.startsWith('stroke'))).toBe(true);
    }
  });

  it('gives IM no stroke-specific tactical note', () => {
    const plan = buildRaceDayPlan(withProfile({ goalRaceDate: '2026-12-01', primaryStrokes: ['im'] }));
    expect(plan?.tacticalNotes.some((k) => k.startsWith('stroke'))).toBe(false);
  });
});
