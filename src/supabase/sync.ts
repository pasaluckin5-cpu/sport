import { AthleteProfile, StrokeCountEntry } from '@/domain/types';
import { CompletionMap } from '@/storage/history-storage';

import { supabase } from './config';
import { AthleteProfileRow, StrokeLogRow } from './types';

/**
 * Maps between the app's camelCase domain shapes and the snake_case Postgres rows
 * (supabase/migrations/0001_init.sql). Every function here is a no-op returning an empty/null
 * result when `supabase` isn't configured, so callers don't need their own guard on every call
 * — only on whether to call these at all (i.e. whether there's a signed-in session).
 */

function profileToRow(userId: string, p: AthleteProfile) {
  return {
    user_id: userId,
    level: p.level,
    goal: p.goal,
    pool_sessions_per_week: p.poolSessionsPerWeek,
    pool_session_duration_min: p.poolSessionDurationMin,
    gym_sessions_per_week: p.gymSessionsPerWeek,
    equipment: p.equipment,
    unit: p.unit,
    pool_length: p.poolLength,
    benchmark_distance: p.benchmark?.distance ?? null,
    benchmark_time_sec: p.benchmark?.timeSec ?? null,
    primary_strokes: p.primaryStrokes ?? null,
    primary_distances: p.primaryDistances ?? null,
    updated_at: new Date().toISOString(),
  };
}

function rowToProfile(row: AthleteProfileRow): AthleteProfile {
  return {
    level: row.level as AthleteProfile['level'],
    goal: row.goal as AthleteProfile['goal'],
    poolSessionsPerWeek: row.pool_sessions_per_week,
    poolSessionDurationMin: row.pool_session_duration_min,
    gymSessionsPerWeek: row.gym_sessions_per_week,
    equipment: row.equipment as AthleteProfile['equipment'],
    unit: row.unit as AthleteProfile['unit'],
    poolLength: row.pool_length as AthleteProfile['poolLength'],
    benchmark:
      row.benchmark_distance != null && row.benchmark_time_sec != null
        ? { distance: row.benchmark_distance, timeSec: row.benchmark_time_sec }
        : undefined,
    primaryStrokes: (row.primary_strokes as AthleteProfile['primaryStrokes']) ?? undefined,
    primaryDistances: row.primary_distances ?? undefined,
  };
}

export async function fetchCloudProfile(userId: string): Promise<AthleteProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('athlete_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  return rowToProfile(data as AthleteProfileRow);
}

export async function upsertCloudProfile(userId: string, profile: AthleteProfile): Promise<void> {
  if (!supabase) return;
  await supabase.from('athlete_profiles').upsert(profileToRow(userId, profile));
}

export async function fetchCloudCompletions(userId: string): Promise<CompletionMap> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('completions').select('week_key, day_index, kind').eq('user_id', userId);
  if (error || !data) return {};
  const map: CompletionMap = {};
  for (const row of data as { week_key: string; day_index: number; kind: string }[]) {
    map[`${row.week_key}:${row.day_index}:${row.kind}`] = true;
  }
  return map;
}

export async function setCloudCompletion(
  userId: string,
  weekKey: string,
  dayIndex: number,
  kind: 'pool' | 'gym',
  completed: boolean,
): Promise<void> {
  if (!supabase) return;
  if (completed) {
    await supabase
      .from('completions')
      .upsert({ user_id: userId, week_key: weekKey, day_index: dayIndex, kind }, { onConflict: 'user_id,week_key,day_index,kind' });
  } else {
    await supabase.from('completions').delete().match({ user_id: userId, week_key: weekKey, day_index: dayIndex, kind });
  }
}

export async function bulkUploadCompletions(userId: string, map: CompletionMap): Promise<void> {
  if (!supabase) return;
  const rows = Object.keys(map).map((key) => {
    const [weekKey, dayIndexStr, kind] = key.split(':');
    return { user_id: userId, week_key: weekKey, day_index: Number(dayIndexStr), kind };
  });
  if (rows.length === 0) return;
  await supabase.from('completions').upsert(rows, { onConflict: 'user_id,week_key,day_index,kind' });
}

export async function fetchCloudStrokeLog(userId: string): Promise<StrokeCountEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('stroke_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as StrokeLogRow[]).map((row) => ({
    id: String(row.id),
    dateISO: row.log_date,
    distance: row.distance,
    strokeCount: row.stroke_count,
  }));
}

export async function insertCloudStrokeEntry(userId: string, entry: StrokeCountEntry): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('stroke_log')
    .insert({ user_id: userId, log_date: entry.dateISO, distance: entry.distance, stroke_count: entry.strokeCount });
}

export async function deleteCloudStrokeEntry(id: string): Promise<void> {
  if (!supabase) return;
  const numericId = Number(id);
  if (Number.isNaN(numericId)) return; // a locally-generated id that was never synced
  await supabase.from('stroke_log').delete().eq('id', numericId);
}

export async function bulkUploadStrokeLog(userId: string, entries: StrokeCountEntry[]): Promise<void> {
  if (!supabase || entries.length === 0) return;
  await supabase
    .from('stroke_log')
    .insert(entries.map((e) => ({ user_id: userId, log_date: e.dateISO, distance: e.distance, stroke_count: e.strokeCount })));
}

/**
 * Deletes every row this user owns directly (profile settings, history, stroke log, results) —
 * the "delete my cloud data" action referenced in the Privacy Policy. This does not delete the
 * login itself (email/password with Supabase Auth) — that needs either a service-role-backed
 * Edge Function or a support request, neither of which exists yet (see the Privacy Policy).
 */
export async function deleteCloudData(userId: string): Promise<void> {
  if (!supabase) return;
  await Promise.all([
    supabase.from('athlete_profiles').delete().eq('user_id', userId),
    supabase.from('completions').delete().eq('user_id', userId),
    supabase.from('stroke_log').delete().eq('user_id', userId),
    supabase.from('results').delete().eq('athlete_id', userId),
    supabase.from('friendships').delete().eq('requester_id', userId),
    supabase.from('friendships').delete().eq('recipient_id', userId),
  ]);
}
