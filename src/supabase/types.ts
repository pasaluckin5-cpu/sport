import { GymBlock, GymFocus, SessionFeedback, SetStep, Zone } from '@/domain/types';

/**
 * Hand-written row types mirroring supabase/migrations/0001_init.sql — there's no live project
 * to run `supabase gen types typescript` against yet (see docs/supabase-architecture.md), so
 * these are kept in sync with the migration by hand. Column names are snake_case to match
 * Postgres directly; the app-facing `AthleteProfile` shape (camelCase) is mapped at the
 * sync-layer boundary, not here.
 */

export type UserRole = 'athlete' | 'coach' | 'admin';
export type LinkStatus = 'pending' | 'active';

export interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  gender: 'male' | 'female' | null;
  created_at: string;
}

export interface AthleteProfileRow {
  user_id: string;
  level: string;
  goal: string;
  pool_sessions_per_week: number;
  pool_session_duration_min: number;
  gym_sessions_per_week: number;
  equipment: string[];
  unit: string;
  pool_length: number;
  benchmark_distance: number | null;
  benchmark_time_sec: number | null;
  primary_strokes: string[] | null;
  primary_distances: number[] | null;
  goal_race_date: string | null;
  updated_at: string;
}

export interface CompletionRow {
  id: number;
  user_id: string;
  week_key: string;
  day_index: number;
  kind: 'pool' | 'gym';
  completed_at: string;
  feedback: SessionFeedback | null;
}

export interface StrokeLogRow {
  id: number;
  user_id: string;
  log_date: string;
  distance: number;
  stroke_count: number;
  created_at: string;
}

export interface TeamRow {
  id: string;
  coach_id: string;
  name: string;
  created_at: string;
}

export interface TeamMemberRow {
  team_id: string;
  athlete_id: string;
  status: LinkStatus;
  invited_at: string;
  joined_at: string | null;
}

export interface WorkoutRow {
  id: string;
  coach_id: string;
  athlete_id: string;
  workout_date: string;
  title: string;
  pool_zone: Zone | null;
  pool_warmup: SetStep[] | null;
  pool_main: SetStep[] | null;
  pool_cooldown: SetStep[] | null;
  gym_focus: GymFocus | null;
  gym_blocks: GymBlock[] | null;
  coach_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResultRow {
  id: string;
  athlete_id: string;
  coach_id: string | null;
  distance: number;
  stroke: string;
  time_sec: number;
  result_date: string;
  note: string | null;
  created_at: string;
}

export interface MessageRow {
  id: number;
  coach_id: string;
  athlete_id: string;
  sender_id: string;
  body: string;
  sent_at: string;
  read_at: string | null;
}

export interface TeamMessageRow {
  id: number;
  team_id: string;
  sender_id: string;
  body: string;
  sent_at: string;
}
