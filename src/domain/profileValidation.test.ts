import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE } from './planGenerator';
import { parseProfileBackup } from './profileValidation';

describe('parseProfileBackup', () => {
  it('round-trips a valid profile', () => {
    const profile = { ...DEFAULT_PROFILE, benchmark: { distance: 400, timeSec: 400 } };
    const parsed = parseProfileBackup(JSON.stringify(profile));
    expect(parsed).toEqual(profile);
  });

  it('rejects invalid JSON', () => {
    expect(parseProfileBackup('not json')).toBeNull();
  });

  it('rejects an object missing required fields', () => {
    expect(parseProfileBackup(JSON.stringify({ level: 'beginner' }))).toBeNull();
  });

  it('rejects an unknown level/goal/equipment value', () => {
    const bad = { ...DEFAULT_PROFILE, level: 'expert' };
    expect(parseProfileBackup(JSON.stringify(bad))).toBeNull();
  });

  it('falls back to sensible defaults for missing unit/poolLength', () => {
    const { unit, poolLength, ...rest } = DEFAULT_PROFILE;
    const parsed = parseProfileBackup(JSON.stringify(rest));
    expect(parsed?.unit).toBe('meters');
    expect(parsed?.poolLength).toBe(25);
  });

  it('drops a zero-second benchmark instead of keeping a nonsense pace', () => {
    const withZeroBenchmark = { ...DEFAULT_PROFILE, benchmark: { distance: 400, timeSec: 0 } };
    const parsed = parseProfileBackup(JSON.stringify(withZeroBenchmark));
    expect(parsed?.benchmark).toBeUndefined();
  });
});
