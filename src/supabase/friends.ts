import { Gender } from '@/domain/types';

import { supabase } from './config';
import { ResultRow } from './types';

export type FriendshipStatus = 'pending' | 'accepted';

export interface FriendshipRow {
  requester_id: string;
  recipient_id: string;
  status: FriendshipStatus;
  created_at: string;
}

export interface Friend {
  id: string;
  email: string;
  gender: Gender | null;
}

export interface IncomingRequest {
  requesterId: string;
  requesterEmail: string;
}

export async function addFriendByEmail(email: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Not configured' };
  const { error } = await supabase.rpc('add_friend_by_email', { target_email: email });
  return { error: error ? error.message : null };
}

export async function fetchIncomingRequests(myId: string): Promise<IncomingRequest[]> {
  if (!supabase) return [];
  const { data: rows } = await supabase.from('friendships').select('*').eq('recipient_id', myId).eq('status', 'pending');
  if (!rows || rows.length === 0) return [];
  const ids = (rows as FriendshipRow[]).map((r) => r.requester_id);
  const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', ids);
  const emailById = new Map((profiles ?? []).map((p: { id: string; email: string }) => [p.id, p.email]));
  return (rows as FriendshipRow[]).map((r) => ({ requesterId: r.requester_id, requesterEmail: emailById.get(r.requester_id) ?? '?' }));
}

export async function acceptFriendRequest(requesterId: string, myId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('friendships').update({ status: 'accepted' }).match({ requester_id: requesterId, recipient_id: myId });
}

export async function removeFriendship(otherUserId: string, myId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('friendships')
    .delete()
    .or(`and(requester_id.eq.${myId},recipient_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},recipient_id.eq.${myId})`);
}

export async function fetchAcceptedFriends(myId: string): Promise<Friend[]> {
  if (!supabase) return [];
  const { data: rows } = await supabase
    .from('friendships')
    .select('*')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${myId},recipient_id.eq.${myId}`);
  if (!rows || rows.length === 0) return [];
  const otherIds = (rows as FriendshipRow[]).map((r) => (r.requester_id === myId ? r.recipient_id : r.requester_id));
  const { data: profiles } = await supabase.from('profiles').select('id, email, gender').in('id', otherIds);
  return ((profiles ?? []) as { id: string; email: string; gender: Gender | null }[]).map((p) => ({
    id: p.id,
    email: p.email,
    gender: p.gender,
  }));
}

export async function fetchFriendResults(friendId: string): Promise<ResultRow[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('results').select('*').eq('athlete_id', friendId).order('result_date', { ascending: false });
  return (data as ResultRow[]) ?? [];
}
