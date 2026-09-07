import { describe, expect, it } from 'vitest';

import {
  capZoneIntensity,
  EMPTY_MEDICAL,
  equipmentToAvoidForMedical,
  exercisesToAvoidForMedical,
  hasAnyMedicalCaution,
  hasShoulderInjury,
  medicalVolumeMultiplier,
  medicalZoneCap,
  strokesToAvoid,
} from './medical';
import { MedicalProfile } from './types';

describe('hasAnyMedicalCaution', () => {
  it('is false for undefined or empty medical data', () => {
    expect(hasAnyMedicalCaution(undefined)).toBe(false);
    expect(hasAnyMedicalCaution(EMPTY_MEDICAL)).toBe(false);
  });

  it('is true with an injury or a condition', () => {
    expect(hasAnyMedicalCaution({ injuries: [{ area: 'knee', severity: 'mild' }], conditions: [] })).toBe(true);
    expect(hasAnyMedicalCaution({ injuries: [], conditions: ['asthma'] })).toBe(true);
  });
});

describe('hasShoulderInjury', () => {
  it('is true only when a shoulder injury is present', () => {
    expect(hasShoulderInjury(undefined)).toBe(false);
    expect(hasShoulderInjury({ injuries: [{ area: 'knee', severity: 'mild' }], conditions: [] })).toBe(false);
    expect(hasShoulderInjury({ injuries: [{ area: 'shoulder', severity: 'mild' }], conditions: [] })).toBe(true);
  });
});

describe('medicalZoneCap', () => {
  it('has no cap with no conditions', () => {
    expect(medicalZoneCap(undefined)).toBeUndefined();
    expect(medicalZoneCap(EMPTY_MEDICAL)).toBeUndefined();
  });

  it('caps hardest for recent surgery', () => {
    expect(medicalZoneCap({ injuries: [], conditions: ['recentSurgery'] })).toBe('aerobicBase');
  });

  it('caps at threshold for a heart condition, pregnancy, or high blood pressure', () => {
    expect(medicalZoneCap({ injuries: [], conditions: ['heartCondition'] })).toBe('threshold');
    expect(medicalZoneCap({ injuries: [], conditions: ['pregnancy'] })).toBe('threshold');
    expect(medicalZoneCap({ injuries: [], conditions: ['highBloodPressure'] })).toBe('threshold');
  });

  it('caps one tier higher, at vo2max, for asthma or epilepsy', () => {
    expect(medicalZoneCap({ injuries: [], conditions: ['asthma'] })).toBe('vo2max');
    expect(medicalZoneCap({ injuries: [], conditions: ['epilepsy'] })).toBe('vo2max');
  });

  it('has no zone cap for diabetes or an unspecified condition (caution there is about volume, not intensity)', () => {
    expect(medicalZoneCap({ injuries: [], conditions: ['diabetes'] })).toBeUndefined();
    expect(medicalZoneCap({ injuries: [], conditions: ['other'] })).toBeUndefined();
  });

  it('has no zone cap for scoliosis (its caution is about gym exercise selection, not swim intensity)', () => {
    expect(medicalZoneCap({ injuries: [], conditions: ['scoliosis'] })).toBeUndefined();
  });

  it('recent surgery takes priority over a milder cap when both are present', () => {
    expect(medicalZoneCap({ injuries: [], conditions: ['recentSurgery', 'heartCondition'] })).toBe('aerobicBase');
  });

  it('takes the most restrictive cap across several conditions regardless of declaration order', () => {
    expect(medicalZoneCap({ injuries: [], conditions: ['asthma', 'heartCondition'] })).toBe('threshold');
    expect(medicalZoneCap({ injuries: [], conditions: ['heartCondition', 'asthma'] })).toBe('threshold');
  });
});

describe('capZoneIntensity', () => {
  it('leaves the zone alone with no cap', () => {
    expect(capZoneIntensity('sprint', undefined)).toBe('sprint');
  });

  it('downgrades a zone more intense than the cap', () => {
    expect(capZoneIntensity('sprint', 'aerobicBase')).toBe('aerobicBase');
    expect(capZoneIntensity('vo2max', 'threshold')).toBe('threshold');
  });

  it('leaves a zone alone when it is already at or under the cap', () => {
    expect(capZoneIntensity('recovery', 'threshold')).toBe('recovery');
    expect(capZoneIntensity('threshold', 'threshold')).toBe('threshold');
  });
});

describe('medicalVolumeMultiplier', () => {
  it('is 1 with no medical data', () => {
    expect(medicalVolumeMultiplier(undefined)).toBe(1);
    expect(medicalVolumeMultiplier(EMPTY_MEDICAL)).toBe(1);
  });

  it('cuts volume hardest for recent surgery', () => {
    expect(medicalVolumeMultiplier({ injuries: [], conditions: ['recentSurgery'] })).toBe(0.7);
  });

  it('cuts volume mildly for a condition with no more specific adjustment', () => {
    expect(medicalVolumeMultiplier({ injuries: [], conditions: ['asthma'] })).toBe(0.9);
    expect(medicalVolumeMultiplier({ injuries: [], conditions: ['highBloodPressure'] })).toBe(0.9);
    expect(medicalVolumeMultiplier({ injuries: [], conditions: ['epilepsy'] })).toBe(0.9);
    expect(medicalVolumeMultiplier({ injuries: [], conditions: ['other'] })).toBe(0.9);
  });

  it('cuts volume harder for a heart condition, pregnancy, or diabetes', () => {
    expect(medicalVolumeMultiplier({ injuries: [], conditions: ['heartCondition'] })).toBe(0.85);
    expect(medicalVolumeMultiplier({ injuries: [], conditions: ['pregnancy'] })).toBe(0.85);
    expect(medicalVolumeMultiplier({ injuries: [], conditions: ['diabetes'] })).toBe(0.85);
  });

  it('scales the cut by injury severity', () => {
    const mild: MedicalProfile = { injuries: [{ area: 'knee', severity: 'mild' }], conditions: [] };
    const moderate: MedicalProfile = { injuries: [{ area: 'knee', severity: 'moderate' }], conditions: [] };
    const severe: MedicalProfile = { injuries: [{ area: 'knee', severity: 'severe' }], conditions: [] };
    expect(medicalVolumeMultiplier(mild)).toBe(1);
    expect(medicalVolumeMultiplier(moderate)).toBe(0.9);
    expect(medicalVolumeMultiplier(severe)).toBe(0.75);
  });

  it('takes the most conservative (minimum) cut rather than compounding several', () => {
    const combined: MedicalProfile = {
      injuries: [{ area: 'knee', severity: 'severe' }],
      conditions: ['recentSurgery'],
    };
    expect(medicalVolumeMultiplier(combined)).toBe(0.7);
  });
});

describe('strokesToAvoid', () => {
  it('is empty with no relevant injury', () => {
    expect(strokesToAvoid(undefined)).toEqual([]);
    expect(strokesToAvoid({ injuries: [{ area: 'shoulder', severity: 'mild' }], conditions: [] })).toEqual([]);
  });

  it('avoids breaststroke for a knee injury', () => {
    expect(strokesToAvoid({ injuries: [{ area: 'knee', severity: 'mild' }], conditions: [] })).toEqual(['breaststroke']);
  });

  it('avoids butterfly for a back injury', () => {
    expect(strokesToAvoid({ injuries: [{ area: 'back', severity: 'mild' }], conditions: [] })).toEqual(['butterfly']);
  });

  it('avoids both when both injuries are present', () => {
    const both = strokesToAvoid({
      injuries: [
        { area: 'knee', severity: 'mild' },
        { area: 'back', severity: 'mild' },
      ],
      conditions: [],
    });
    expect(both).toEqual(['breaststroke', 'butterfly']);
  });
});

describe('exercisesToAvoidForMedical', () => {
  it('is empty with no injuries', () => {
    expect(exercisesToAvoidForMedical(undefined)).toEqual([]);
    expect(exercisesToAvoidForMedical(EMPTY_MEDICAL)).toEqual([]);
  });

  it('lists shoulder-loading exercises for a shoulder injury', () => {
    const avoided = exercisesToAvoidForMedical({ injuries: [{ area: 'shoulder', severity: 'mild' }], conditions: [] });
    expect(avoided).toContain('benchPress');
    expect(avoided).toContain('pullUps');
  });

  it('lists knee-loading exercises for a knee injury', () => {
    const avoided = exercisesToAvoidForMedical({ injuries: [{ area: 'knee', severity: 'mild' }], conditions: [] });
    expect(avoided).toContain('squats');
    expect(avoided).toContain('bulgarianSplitSquat');
  });

  it('de-duplicates exercises shared across multiple flagged injuries', () => {
    const avoided = exercisesToAvoidForMedical({
      injuries: [
        { area: 'knee', severity: 'mild' },
        { area: 'back', severity: 'mild' },
      ],
      conditions: [],
    });
    // 'squats' and 'romanianDeadlift' are shared between knee and back exclusion lists.
    expect(avoided.filter((e) => e === 'squats')).toHaveLength(1);
    expect(avoided.filter((e) => e === 'romanianDeadlift')).toHaveLength(1);
  });

  it('lists explosive/plyometric exercises for high blood pressure or pregnancy', () => {
    const bp = exercisesToAvoidForMedical({ injuries: [], conditions: ['highBloodPressure'] });
    expect(bp).toEqual(expect.arrayContaining(['squatJump', 'medBallRotationalThrow']));
    const pregnancy = exercisesToAvoidForMedical({ injuries: [], conditions: ['pregnancy'] });
    expect(pregnancy).toEqual(expect.arrayContaining(['squatJump', 'medBallRotationalThrow']));
  });

  it('lists heavy axial-loading/spinal-rotation exercises for scoliosis, same caution as a back injury', () => {
    const scoliosis = exercisesToAvoidForMedical({ injuries: [], conditions: ['scoliosis'] });
    expect(scoliosis).toEqual(expect.arrayContaining(['squats', 'romanianDeadlift', 'russianTwists']));
  });

  it('has no exercise exclusions for conditions without a specific list (asthma, diabetes, etc.)', () => {
    expect(exercisesToAvoidForMedical({ injuries: [], conditions: ['asthma'] })).toEqual([]);
    expect(exercisesToAvoidForMedical({ injuries: [], conditions: ['diabetes'] })).toEqual([]);
  });

  it('combines and de-duplicates injury-based and condition-based exclusions', () => {
    const avoided = exercisesToAvoidForMedical({
      injuries: [{ area: 'back', severity: 'mild' }],
      conditions: ['highBloodPressure'],
    });
    // 'squatJump' and 'medBallRotationalThrow' are shared between the back-injury and
    // highBloodPressure exclusion lists.
    expect(avoided.filter((e) => e === 'squatJump')).toHaveLength(1);
    expect(avoided.filter((e) => e === 'medBallRotationalThrow')).toHaveLength(1);
  });
});

describe('equipmentToAvoidForMedical', () => {
  it('is empty with no conditions', () => {
    expect(equipmentToAvoidForMedical(undefined)).toEqual([]);
    expect(equipmentToAvoidForMedical(EMPTY_MEDICAL)).toEqual([]);
    expect(equipmentToAvoidForMedical({ injuries: [{ area: 'shoulder', severity: 'mild' }], conditions: [] })).toEqual([]);
  });

  it('avoids the drag parachute for asthma (added breathing resistance during sprint work)', () => {
    expect(equipmentToAvoidForMedical({ injuries: [], conditions: ['asthma'] })).toEqual(['parachute']);
  });

  it('avoids the snorkel for epilepsy (airway/rescue concern in the water)', () => {
    expect(equipmentToAvoidForMedical({ injuries: [], conditions: ['epilepsy'] })).toEqual(['snorkel']);
  });

  it('has no equipment exclusion for conditions without a specific rule', () => {
    expect(equipmentToAvoidForMedical({ injuries: [], conditions: ['diabetes'] })).toEqual([]);
    expect(equipmentToAvoidForMedical({ injuries: [], conditions: ['highBloodPressure'] })).toEqual([]);
  });

  it('combines exclusions from multiple flagged conditions', () => {
    const avoided = equipmentToAvoidForMedical({ injuries: [], conditions: ['asthma', 'epilepsy'] });
    expect(avoided).toEqual(expect.arrayContaining(['parachute', 'snorkel']));
    expect(avoided).toHaveLength(2);
  });
});
