import { describe, expect, it } from 'vitest';

import {
  basePace100Sec,
  buildGymSession,
  buildStrokeRotation,
  buildSwimDrylandGymSession,
  estimateDistancePerHour,
  focusEmphasis,
  formatPace100,
  GYM_SPLIT_ROTATION,
  PACE_M_PER_HOUR,
  roundToPoolLength,
  specialtyFactor,
  strokeFor,
} from './workoutLibrary';

describe('basePace100Sec', () => {
  it('converts a time trial into seconds per 100 (meters or yards)', () => {
    // 400m in 6:40 (400s) -> 100s per 100m
    expect(basePace100Sec({ distance: 400, timeSec: 400 })).toBeCloseTo(100);
  });
});

describe('formatPace100', () => {
  it('formats seconds as m:ss', () => {
    expect(formatPace100(95)).toBe('1:35');
    expect(formatPace100(60)).toBe('1:00');
    expect(formatPace100(5)).toBe('0:05');
  });
});

describe('roundToPoolLength', () => {
  it('rounds to the nearest whole pool length', () => {
    expect(roundToPoolLength(1010, 25)).toBe(1000);
    expect(roundToPoolLength(1990, 50)).toBe(2000);
    expect(roundToPoolLength(10, 25)).toBe(25);
  });
});

describe('estimateDistancePerHour', () => {
  it('falls back to the level table with no benchmark', () => {
    expect(estimateDistancePerHour('advanced', 'meters')).toBe(PACE_M_PER_HOUR.advanced);
  });

  it('converts the level table to yards when unit is yards', () => {
    const meters = estimateDistancePerHour('intermediate', 'meters');
    const yards = estimateDistancePerHour('intermediate', 'yards');
    expect(yards).toBeGreaterThan(meters);
  });

  it('derives a higher rate for a faster benchmark pace', () => {
    const slow = estimateDistancePerHour('intermediate', 'meters', { distance: 400, timeSec: 480 }); // 2:00/100m
    const fast = estimateDistancePerHour('intermediate', 'meters', { distance: 400, timeSec: 320 }); // 1:20/100m
    expect(fast).toBeGreaterThan(slow);
  });
});

describe('specialtyFactor', () => {
  it('is 0 at the shortest race distance and 1 at the longest', () => {
    expect(specialtyFactor([50])).toBeCloseTo(0);
    expect(specialtyFactor([1500])).toBeCloseTo(1);
  });

  it('is a neutral midpoint with no stated distance', () => {
    expect(specialtyFactor(undefined)).toBe(0.5);
    expect(specialtyFactor([])).toBe(0.5);
  });

  it('averages multiple distances', () => {
    const single200 = specialtyFactor([200]);
    const mixed = specialtyFactor([50, 200, 1500]);
    // A sprint distance pulls the average down from a pure 200 specialist.
    expect(mixed).not.toBe(single200);
    expect(specialtyFactor([50, 100])).toBeLessThan(specialtyFactor([800, 1500]));
  });
});

describe('focusEmphasis', () => {
  it('buckets a specialty factor into sprint/balanced/distance', () => {
    expect(focusEmphasis(0)).toBe('sprint');
    expect(focusEmphasis(0.5)).toBe('balanced');
    expect(focusEmphasis(1)).toBe('distance');
  });
});

describe('buildStrokeRotation', () => {
  it('falls back to the freestyle-heavy default with no primary strokes', () => {
    const rotation = buildStrokeRotation(undefined);
    expect(rotation.filter((s) => s === 'freestyle').length).toBeGreaterThan(rotation.length / 2);
  });

  it('interleaves freestyle with the athletes stated strokes', () => {
    const rotation = buildStrokeRotation(['backstroke']);
    expect(rotation).toContain('backstroke');
    expect(rotation).toContain('freestyle');
    expect(rotation.every((s) => s === 'freestyle' || s === 'backstroke')).toBe(true);
  });
});

describe('strokeFor', () => {
  it('picks from the given rotation by day and week offset', () => {
    const rotation = buildStrokeRotation(['butterfly']);
    expect(strokeFor(0, 0, rotation)).toBe(rotation[0]);
    expect(strokeFor(3, 2, rotation)).toBe(rotation[5 % rotation.length]);
  });
});

describe('buildSwimDrylandGymSession', () => {
  it('gives different exercise content across each periodization phase', () => {
    const base = buildSwimDrylandGymSession('base', 'A', 'intermediate', 45, false, false);
    const build = buildSwimDrylandGymSession('build', 'A', 'intermediate', 45, false, false);
    const peak = buildSwimDrylandGymSession('peak', 'A', 'intermediate', 45, false, false);
    const taper = buildSwimDrylandGymSession('taper', 'A', 'intermediate', 45, false, false);
    expect(base).not.toEqual(build);
    expect(build).not.toEqual(peak);
    expect(peak).not.toEqual(taper);
  });

  it('falls back to the base phase content when no phase is given', () => {
    const noPhase = buildSwimDrylandGymSession(undefined, 'B', 'intermediate', 45, false, false);
    const base = buildSwimDrylandGymSession('base', 'B', 'intermediate', 45, false, false);
    expect(noPhase).toEqual(base);
  });

  it('varies content across the A/B/C day letters within the same phase', () => {
    const a = buildSwimDrylandGymSession('base', 'A', 'intermediate', 45, false, false);
    const b = buildSwimDrylandGymSession('base', 'B', 'intermediate', 45, false, false);
    const c = buildSwimDrylandGymSession('base', 'C', 'intermediate', 45, false, false);
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
  });

  it('drops leg-dominant exercises the day before a hard swim, without emptying the session', () => {
    const normal = buildSwimDrylandGymSession('base', 'A', 'intermediate', 45, false, false);
    const beforeHardSwim = buildSwimDrylandGymSession('base', 'A', 'intermediate', 45, true, false);
    const legDominant = ['squats', 'romanianDeadlift', 'bulgarianSplitSquat', 'stepUp', 'hipThrust', 'walkingLunges', 'squatJump', 'calfRaises'];
    expect(beforeHardSwim.some((b) => legDominant.includes(b.exercise))).toBe(false);
    expect(beforeHardSwim.length).toBeGreaterThanOrEqual(2);
    expect(beforeHardSwim.length).toBeLessThan(normal.length);
  });

  it('drops shoulder-loading exercises when avoiding shoulder load, without emptying the session', () => {
    const normal = buildSwimDrylandGymSession('base', 'A', 'intermediate', 45, false, false);
    const avoidShoulder = buildSwimDrylandGymSession('base', 'A', 'intermediate', 45, false, true);
    const shoulderLoading = ['benchPress', 'shoulderPress', 'pullUps', 'pushUps', 'pushUpPlus', 'tricepsDips', 'medBallRotationalThrow'];
    expect(avoidShoulder.some((b) => shoulderLoading.includes(b.exercise))).toBe(false);
    expect(avoidShoulder.length).toBeGreaterThanOrEqual(2);
    expect(avoidShoulder.length).toBeLessThan(normal.length);
  });

  it('respects extraExclude (medical exercise avoidance) without emptying the session', () => {
    const full = buildSwimDrylandGymSession('base', 'C', 'intermediate', 45, false, false);
    const excluded = buildSwimDrylandGymSession('base', 'C', 'intermediate', 45, false, false, ['stepUp', 'squats']);
    expect(excluded.some((b) => b.exercise === 'stepUp' || b.exercise === 'squats')).toBe(false);
    expect(excluded.length).toBeGreaterThanOrEqual(2);
    expect(excluded.length).toBeLessThan(full.length);
  });

  it('trims to fewer blocks for a beginner', () => {
    const beginner = buildSwimDrylandGymSession('base', 'A', 'beginner', 45, false, false);
    const advanced = buildSwimDrylandGymSession('base', 'A', 'advanced', 45, false, false);
    expect(beginner.length).toBeLessThanOrEqual(5);
    expect(beginner.length).toBeLessThanOrEqual(advanced.length);
  });
});

describe('GYM_SPLIT_ROTATION', () => {
  it('has a rotation entry for every GymSplit', () => {
    const splits: (keyof typeof GYM_SPLIT_ROTATION)[] = [
      'fullBody',
      'upperLower',
      'pushPull',
      'pushPullLegs',
      'bodyPartSplit',
      'broSplit',
    ];
    for (const split of splits) {
      expect(GYM_SPLIT_ROTATION[split].length).toBeGreaterThan(0);
    }
  });

  it('broSplit is more granular (more distinct days) than fullBody', () => {
    expect(GYM_SPLIT_ROTATION.broSplit.length).toBeGreaterThan(GYM_SPLIT_ROTATION.fullBody.length);
  });
});

describe('buildGymSession', () => {
  it('applies a strength scheme (heavier, lower reps) over the focus exercises', () => {
    const plain = buildGymSession('fullBody', 45, 'intermediate');
    const strength = buildGymSession('fullBody', 45, 'intermediate', 'strength');
    expect(strength.every((b) => b.sets === 5 && b.reps === '4-6')).toBe(true);
    expect(plain.map((b) => b.exercise)).toEqual(strength.map((b) => b.exercise));
  });

  it('circuit style sets reps to "rounds"', () => {
    const circuit = buildGymSession('upperBody', 45, 'intermediate', 'circuit');
    expect(circuit.every((b) => b.reps === 'rounds')).toBe(true);
  });

  it('cardio style replaces all blocks with a single duration-based cardio session', () => {
    const cardio = buildGymSession('fullBody', 30, 'intermediate', 'cardio');
    expect(cardio).toEqual([{ exercise: 'cardioSession', sets: 1, reps: '30 min' }]);
  });

  it('falls back to fullBody exercises for a focus with no dedicated catalog entry', () => {
    const mobility = buildGymSession('mobility', 45, 'intermediate');
    expect(mobility.length).toBeGreaterThan(0);
  });

  it('excludes medically-avoided exercises without emptying the session', () => {
    const excluded = buildGymSession('back', 45, 'intermediate', undefined, ['pullUps']);
    expect(excluded.some((b) => b.exercise === 'pullUps')).toBe(false);
    expect(excluded.length).toBeGreaterThanOrEqual(2);
  });
});
