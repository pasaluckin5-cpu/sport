import { MedicalProfile } from '@/domain/types';

import { supabase } from './config';
import { MedicalProfileRow } from './types';

/**
 * Sync layer for MedicalProfile — see src/state/medical-context.tsx for when these are actually
 * called. Unlike the rest of the app's cloud sync, this one is opt-in: a row only ever exists
 * here when the athlete has explicitly turned on `shareWithCoach` (the app only calls
 * upsertCloudMedical when that flag is true, and deletes the row the moment it's turned back
 * off) — RLS (supabase/migrations/0004_coach_medical_visibility.sql) also independently gates a
 * linked coach's read on that same flag as defense in depth, but the primary privacy boundary is
 * "never write it at all without consent."
 */

function rowToMedical(row: MedicalProfileRow): MedicalProfile {
  return {
    injuries: row.injuries,
    conditions: row.conditions,
    shareWithCoach: row.share_with_coach,
  };
}

/** Used both for an athlete reading their own row and a coach reading a linked athlete's — RLS decides what's actually visible in either case. */
export async function fetchCloudMedical(userId: string): Promise<MedicalProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('medical_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  return rowToMedical(data as MedicalProfileRow);
}

export async function upsertCloudMedical(userId: string, medical: MedicalProfile): Promise<void> {
  if (!supabase) return;
  await supabase.from('medical_profiles').upsert({
    user_id: userId,
    injuries: medical.injuries,
    conditions: medical.conditions,
    share_with_coach: !!medical.shareWithCoach,
    updated_at: new Date().toISOString(),
  });
}

/** Called the moment the athlete turns sharing back off — actually revokes a coach's access rather than leaving a stale row behind an RLS check. */
export async function deleteCloudMedical(userId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('medical_profiles').delete().eq('user_id', userId);
}
