import type { TFunction } from 'i18next';

import { formatPace100 } from '@/domain/workoutLibrary';
import { DayPlan, DistanceUnit, GymBlock, GymMode, SetStep, Zone } from '@/domain/types';

/** "m"/"yd" — a universal abbreviation, not translated per-language. */
export function unitAbbrev(unit: DistanceUnit): string {
  return unit === 'yards' ? 'yd' : 'm';
}

function formatRest(step: SetStep, t: TFunction): string {
  if (step.restSec === undefined) return '';
  const range =
    step.restSecMax !== undefined && step.restSecMax !== step.restSec
      ? `${step.restSec}-${step.restSecMax}s`
      : `${step.restSec}s`;
  return `, ${t('rest')} ${range}`;
}

export function formatSetStep(step: SetStep, t: TFunction, unit: DistanceUnit): string {
  const abbrev = unitAbbrev(unit);
  const prefix = step.reps > 1 ? `${step.reps} x ${step.repDistance}${abbrev} ` : `${step.distance}${abbrev} `;
  const stroke = step.stroke ? t(`stroke.${step.stroke}`) : undefined;
  const kindText = t(`setKind.${step.kind}`, stroke ? { stroke } : undefined);
  const paceText = step.paceSec !== undefined ? ` @ ${formatPace100(step.paceSec)}` : '';
  return `${prefix}${kindText}${paceText}${formatRest(step, t)}`;
}

const NUMERIC_REPS = /^[\d\-–]+s?$/;

export function formatGymBlock(block: GymBlock, t: TFunction): string {
  const exercise = t(`gymExercise.${block.exercise}`);
  const benefitSuffix = block.benefit ? ` (${t(`gymBenefit.${block.benefit}`)})` : '';
  if (block.reps === 'max') return `${exercise} — ${block.sets} x ${t('reps.max')}${benefitSuffix}`;
  if (block.reps === 'rounds') return `${exercise} — ${block.sets} ${t('reps.rounds')}${benefitSuffix}`;
  if (NUMERIC_REPS.test(block.reps)) return `${exercise} — ${block.sets} x ${block.reps}${benefitSuffix}`;
  return `${exercise}${benefitSuffix}`;
}

export function gymModeLabel(mode: GymMode, t: TFunction): string {
  return t(`plan.gymMode.${mode}`);
}

export function zoneLabel(zone: Zone, t: TFunction): string {
  return t(`zone.${zone}.label`);
}

export function swimSessionTitle(zone: Zone, t: TFunction): string {
  return t('swimSession', { zone: zoneLabel(zone, t) });
}

/** Plain-text rendering of a day's session(s), for sharing with a coach or training partner. */
export function formatDayShareText(day: DayPlan, dayName: string, unit: DistanceUnit, t: TFunction): string {
  const lines: string[] = [`${t('common.appName')} — ${dayName}`];

  if (day.pool) {
    const abbrev = unitAbbrev(unit);
    lines.push('', `${swimSessionTitle(day.pool.zone, t)} · ${day.pool.totalDistance}${abbrev}`);
    (['warmup', 'main', 'cooldown'] as const).forEach((section) => {
      const steps = day.pool![section];
      if (steps.length === 0) return;
      lines.push('', `${t(`plan.${section}`)}:`);
      steps.forEach((step) => lines.push(`- ${formatSetStep(step, t, unit)}`));
    });
  }

  if (day.gym) {
    lines.push('', `${t(`gymFocus.${day.gym.focus}`)} · ${day.gym.durationMin}${t('common.min')}`);
    day.gym.blocks.forEach((block) => lines.push(`- ${formatGymBlock(block, t)}`));
  }

  return lines.join('\n');
}
