import { describe, expect, it } from 'vitest';

import {
  basePace100Sec,
  buildStrokeRotation,
  estimateDistancePerHour,
  focusEmphasis,
  formatPace100,
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
