import { supabase } from './config';
import { WorkoutRow } from './types';

export async function fetchAthleteWorkouts(athleteId: string): Promise<WorkoutRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('workouts')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('workout_date', { ascending: true });
  return (data as WorkoutRow[]) ?? [];
}

export async function fetchWorkoutsAuthoredByCoach(coachId: string): Promise<WorkoutRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('workouts')
    .select('*')
    .eq('coach_id', coachId)
    .order('workout_date', { ascending: false });
  return (data as WorkoutRow[]) ?? [];
}

export async function createWorkout(
  payload: Omit<WorkoutRow, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' };
  const { error } = await supabase.from('workouts').insert(payload);
  return { error: error ? error.message : null };
}

export async function deleteWorkout(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('workouts').delete().eq('id', id);
}
