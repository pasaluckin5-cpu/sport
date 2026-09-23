import { supabase } from './config';
import { TeamMemberRow, TeamRow } from './types';

/** Coach side: the coach's own team (v1 — one team per coach), created lazily on first use. */
export async function fetchMyTeam(coachId: string): Promise<TeamRow | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('teams').select('*').eq('coach_id', coachId).maybeSingle();
  return (data as TeamRow | null) ?? null;
}

export async function createTeam(coachId: string, name: string): Promise<{ team: TeamRow | null; error: string | null }> {
  if (!supabase) return { team: null, error: 'Not configured' };
  const { data, error } = await supabase.from('teams').insert({ coach_id: coachId, name }).select().single();
  return { team: error ? null : (data as TeamRow), error: error ? error.message : null };
}

export interface TeamMemberWithEmail extends TeamMemberRow {
  email: string;
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMemberWithEmail[]> {
  if (!supabase) return [];
  const { data: members } = await supabase.from('team_members').select('*').eq('team_id', teamId);
  if (!members || members.length === 0) return [];
  const ids = (members as TeamMemberRow[]).map((m) => m.athlete_id);
  const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', ids);
  const emailById = new Map((profiles ?? []).map((p: { id: string; email: string }) => [p.id, p.email]));
  return (members as TeamMemberRow[]).map((m) => ({ ...m, email: emailById.get(m.athlete_id) ?? '?' }));
}

/** Resolves the invite by email server-side (invite_athlete_by_email RPC) — see
 *  docs/supabase-architecture.md for why a plain profiles lookup by email isn't possible here. */
export async function inviteAthleteByEmail(teamId: string, email: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' };
  const { error } = await supabase.rpc('invite_athlete_by_email', { target_team: teamId, target_email: email });
  return { error: error ? error.message : null };
}

export async function removeTeamMember(teamId: string, athleteId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('team_members').delete().match({ team_id: teamId, athlete_id: athleteId });
}

/** Athlete side. */
export interface PendingInvite extends TeamMemberRow {
  teamName: string;
}

export async function fetchMyInvites(athleteId: string): Promise<PendingInvite[]> {
  if (!supabase) return [];
  const { data: memberships } = await supabase
    .from('team_members')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('status', 'pending');
  if (!memberships || memberships.length === 0) return [];
  const teamIds = (memberships as TeamMemberRow[]).map((m) => m.team_id);
  const { data: teams } = await supabase.from('teams').select('id, name').in('id', teamIds);
  const nameById = new Map((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
  return (memberships as TeamMemberRow[]).map((m) => ({ ...m, teamName: nameById.get(m.team_id) ?? '?' }));
}

export async function acceptInvite(teamId: string, athleteId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('team_members')
    .update({ status: 'active', joined_at: new Date().toISOString() })
    .match({ team_id: teamId, athlete_id: athleteId });
}

export async function declineInvite(teamId: string, athleteId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('team_members').delete().match({ team_id: teamId, athlete_id: athleteId });
}

export interface MyTeam {
  team: TeamRow;
}

export async function fetchMyActiveTeam(athleteId: string): Promise<TeamRow | null> {
  if (!supabase) return null;
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return null;
  const { data: team } = await supabase.from('teams').select('*').eq('id', membership.team_id).maybeSingle();
  return (team as TeamRow | null) ?? null;
}
