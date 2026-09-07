-- Swim Planner — friends: symmetric, results-only visibility between athletes.
-- Additive migration — safe to run after 0001_init.sql without dropping/recreating anything
-- from that file (it only creates new objects and adds new, additional policies).
--
-- Design: docs/supabase-architecture.md's "Still open" section flagged friends as needing a
-- much looser read grant than the coach relationship. This scopes that grant to `results` (plus
-- the `profiles` row needed to interpret them — email for display, gender for ЕВСК rank
-- comparison) — never `athlete_profiles`/`completions`/`stroke_log`, which stay coach-only.
-- Postgres OR's multiple permissive policies together for the same command, so the two new
-- policies below on `results`/`profiles` are additive: they widen who can read, they don't
-- replace the existing 0001 policies on those tables.

create type friendship_status as enum ('pending', 'accepted');

create table friendships (
  requester_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  status friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (requester_id, recipient_id),
  constraint friendships_no_self_friend check (requester_id <> recipient_id)
);

alter table friendships enable row level security;

create or replace function is_friend_of(target uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester_id = auth.uid() and recipient_id = target)
        or (recipient_id = auth.uid() and requester_id = target))
  );
$$;

-- Either party can see their own friendship rows (both directions of a symmetric relationship).
create policy "friendships_select" on friendships for select
  using (requester_id = auth.uid() or recipient_id = auth.uid() or is_admin());
-- Only the requester can propose one, and only ever starting 'pending'.
create policy "friendships_insert" on friendships for insert
  with check (requester_id = auth.uid() and status = 'pending');
-- Only the recipient can accept (flip pending -> accepted) — the requester can't self-accept.
create policy "friendships_update" on friendships for update
  using (recipient_id = auth.uid() or is_admin())
  with check (recipient_id = auth.uid() or is_admin());
-- Either party can remove the row — unfriend, or decline/cancel a pending request.
create policy "friendships_delete" on friendships for delete
  using (requester_id = auth.uid() or recipient_id = auth.uid() or is_admin());

-- Resolves a friend request by email the same way invite_athlete_by_email() resolves a coach
-- invite in 0001_init.sql — a stranger's uuid isn't otherwise discoverable via profiles_select.
create or replace function add_friend_by_email(target_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  target_uid uuid;
begin
  select id into target_uid from profiles where email = target_email;
  if target_uid is null then
    raise exception 'No account found for that email';
  end if;
  if target_uid = auth.uid() then
    raise exception 'You cannot add yourself as a friend';
  end if;

  insert into friendships (requester_id, recipient_id, status)
  values (auth.uid(), target_uid, 'pending')
  on conflict (requester_id, recipient_id) do nothing;
end;
$$;

grant execute on function add_friend_by_email(text) to authenticated;

-- Widen `results` and `profiles` reads to accepted friends (additive to 0001's policies).
create policy "results_select_friends" on results for select
  using (is_friend_of(athlete_id));
create policy "profiles_select_friends" on profiles for select
  using (is_friend_of(id));
