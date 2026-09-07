import { supabase } from './config';
import { MessageRow, TeamMessageRow } from './types';

/** 1:1 coach<->athlete thread. */
export async function fetchThread(coachId: string, athleteId: string): Promise<MessageRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .order('sent_at', { ascending: true });
  return (data as MessageRow[]) ?? [];
}

export async function sendMessage(coachId: string, athleteId: string, senderId: string, body: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('messages').insert({ coach_id: coachId, athlete_id: athleteId, sender_id: senderId, body });
}

/** Team-wide group chat — coach + every active member. */
export async function fetchTeamChat(teamId: string): Promise<TeamMessageRow[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('team_messages').select('*').eq('team_id', teamId).order('sent_at', { ascending: true });
  return (data as TeamMessageRow[]) ?? [];
}

export async function sendTeamMessage(teamId: string, senderId: string, body: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('team_messages').insert({ team_id: teamId, sender_id: senderId, body });
}
