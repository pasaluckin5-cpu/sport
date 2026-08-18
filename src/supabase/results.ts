import { supabase } from './config';
import { ResultRow } from './types';

export async function fetchAthleteResults(athleteId: string): Promise<ResultRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('results')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('result_date', { ascending: false });
  return (data as ResultRow[]) ?? [];
}

export async function addResult(payload: Omit<ResultRow, 'id' | 'created_at'>): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' };
  const { error } = await supabase.from('results').insert(payload);
  return { error: error ? error.message : null };
}

export async function deleteResult(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('results').delete().eq('id', id);
}
