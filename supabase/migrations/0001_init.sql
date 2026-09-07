-- Swim Planner — initial Supabase schema, roles, and Row Level Security.
-- Design rationale lives in docs/supabase-architecture.md — read that first if changing this.
-- Run via the Supabase SQL editor (or `supabase db push` if using the CLI) against a fresh
-- project, after enabling Email/Password auth and before pointing the app at it.
--
-- Safe to re-run from scratch: if a previous attempt failed partway through (e.g. a syntax
-- error further down), this cleanup section drops everything the script below creates before
-- recreating it, rather than erroring on "already exists". Only appropriate before the app has
-- any real users/data — this is an init migration, not a repeatable up-migration.

drop trigger if exists on_auth_user_created on auth.users;

-- `drop trigger if exists ... on profiles` errors with 42P01 ("relation does not exist") on a
-- truly fresh project where `profiles` was never created yet — IF EXISTS only covers the
-- trigger, not the table it's attached to. Guard on the table's existence first so this script
-- works both on a fresh project and as a from-scratch re-run.
do $$
begin
  if to_regclass('public.profiles') is not null then
    drop trigger if exists trg_prevent_role_self_escalation on profiles;
  end if;
end $$;

drop table if exists team_messages cascade;
drop table if exists messages cascade;
drop table if exists results cascade;
drop table if exists workouts cascade;
drop table if exists team_members cascade;
drop table if exists teams cascade;
drop table if exists stroke_log cascade;
drop table if exists completions cascade;
drop table if exists athlete_profiles cascade;
drop table if exists profiles cascade;

drop function if exists handle_new_user() cascade;
drop function if exists prevent_role_self_escalation() cascade;
drop function if exists is_admin() cascade;
drop function if exists is_coach() cascade;
drop function if exists is_linked_coach_of(uuid) cascade;
drop function if exists is_active_member_of(uuid) cascade;
drop function if exists invite_athlete_by_email(uuid, text) cascade;

drop type if exists user_role cascade;
drop type if exists gender cascade;
drop type if exists link_status cascade;
drop type if exists race_stroke cascade;

-- ============================================================================================
-- Types
-- ============================================================================================

create type user_role as enum ('athlete', 'coach', 'admin');
create type gender as enum ('male', 'female');
create type link_status as enum ('pending', 'active');
create type race_stroke as enum ('freestyle', 'backstroke', 'breaststroke', 'butterfly', 'im');

-- ============================================================================================
-- Tables
-- ============================================================================================

-- Mirrors auth.users (Supabase-managed) 1:1 — auto-created by handle_new_user() below.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role user_role not null default 'athlete',
  gender gender,
  created_at timestamptz not null default now()
);

-- Mirrors the app's local AthleteProfile shape 1:1 (src/domain/types.ts).
create table athlete_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  level text not null,
  goal text not null,
  pool_sessions_per_week int not null,
  pool_session_duration_min int not null,
  gym_sessions_per_week int not null,
  equipment text[] not null default '{}',
  unit text not null,
  pool_length int not null,
  benchmark_distance numeric,
  benchmark_time_sec numeric,
  primary_strokes race_stroke[],
  primary_distances numeric[],
  updated_at timestamptz not null default now()
);

-- One row per completed session — mirrors the local CompletionMap, but as real rows instead of
-- a single JSON blob, so per-week/per-athlete queries are a plain WHERE instead of a map parse.
create table completions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  week_key text not null,
  day_index int not null,
  kind text not null check (kind in ('pool', 'gym')),
  completed_at timestamptz not null default now(),
  unique (user_id, week_key, day_index, kind)
);

create table stroke_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  log_date date not null default current_date,
  distance numeric not null,
  stroke_count int not null,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- The *only* authorization link between a coach and an athlete — team membership is mandatory,
-- there is no separate 1:1 link table. A 'pending' row is an invite the coach sent that the
-- athlete hasn't accepted yet; only the invited athlete can flip it to 'active', and only the
-- team's coach can create or remove a row — an athlete can never insert their own membership.
create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  status link_status not null default 'pending',
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (team_id, athlete_id)
);

-- A coach-authored session, distinct from the locally-generated plan. Structured the same way a
-- generated day already is (PoolSession's warmup/main/cooldown SetStep[], GymSession's
-- GymBlock[]) so it renders through the app's existing formatSetStep/formatGymBlock formatters
-- instead of a second, free-text rendering path. Both halves are independently nullable so a
-- workout can be swim-only, gym-only, or both, matching DayPlan today.
create table workouts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  workout_date date not null,
  title text not null,
  pool_zone text,
  pool_warmup jsonb,
  pool_main jsonb,
  pool_cooldown jsonb,
  gym_focus text,
  gym_blocks jsonb,
  coach_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workouts_has_a_half check (pool_warmup is not null or gym_blocks is not null)
);

create table results (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid references profiles(id) on delete set null,
  distance numeric not null,
  stroke race_stroke not null,
  time_sec numeric not null,
  result_date date not null,
  note text,
  created_at timestamptz not null default now()
);

-- 1:1 coach<->athlete thread.
create table messages (
  id bigint generated always as identity primary key,
  coach_id uuid not null references profiles(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz
);

-- Team-wide broadcast chat: one thread per team, visible to the coach and every *active* member
-- at once — separate from the private 1:1 `messages` thread above. Membership is re-checked
-- live on every read/write via is_active_member_of(), so removing someone from the team cuts
-- their chat access on their very next request, not just from then on.
create table team_messages (
  id bigint generated always as identity primary key,
  team_id uuid not null references teams(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  sent_at timestamptz not null default now()
);

-- ============================================================================================
-- Auto-provisioning: a profiles row is created server-side on sign-up, hardcoded to 'athlete' —
-- the client never gets an insert path for profiles at all (see RLS section below).
-- ============================================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role) values (new.id, new.email, 'athlete');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ============================================================================================
-- Role-freeze: the trigger, not just an RLS check, is what actually blocks an athlete from
-- self-promoting to coach/admin — see docs/supabase-architecture.md for why a trigger is more
-- robust here than a self-referential `with check` on the profiles UPDATE policy.
--
-- The `auth.uid() is not null` guard matters: a request routed through the app (PostgREST, an
-- anon/authenticated JWT) always has a uid, so the escalation check applies to it as intended.
-- A query run directly in the Supabase SQL Editor (or any other direct/service-role Postgres
-- connection) has no JWT at all, so auth.uid() is null there — without this guard, the bootstrap
-- update this file documents below (and any later manual role change) would always fail with
-- "Only an admin can change a user role", since there's no way to already be an admin before an
-- admin exists. Skipping the check specifically when there's no uid doesn't weaken it: that path
-- is only reachable with direct database access, which is already outside anything RLS or this
-- trigger is meant to constrain.
-- ============================================================================================

create or replace function prevent_role_self_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
    and auth.uid() is not null
    and not exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    ) then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_role_self_escalation
before update on profiles
for each row execute function prevent_role_self_escalation();

-- ============================================================================================
-- RLS helper functions (security definer so they can read profiles/team_members/teams
-- regardless of the calling user's own RLS grants — avoids recursive-policy evaluation).
-- ============================================================================================

create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_coach() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach');
$$;

-- "Linked" means: the caller coaches a team that this athlete is an active member of.
create or replace function is_linked_coach_of(target_athlete uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from team_members tm
    join teams t on t.id = tm.team_id
    where t.coach_id = auth.uid() and tm.athlete_id = target_athlete and tm.status = 'active'
  );
$$;

create or replace function is_active_member_of(target_team uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = target_team and athlete_id = auth.uid() and status = 'active'
  );
$$;

-- Same reasoning as is_linked_coach_of/is_active_member_of above, for a different pair of
-- tables: teams_select (below) needs to check "does auth.uid() belong to this team" (any
-- status, so a not-yet-accepted invitee can still see the team they were invited to), and
-- team_members' own policies need to check "does auth.uid() coach this team". Written as plain
-- `exists (select 1 from team_members ...)` / `exists (select 1 from teams ...)` directly inside
-- each other's policies, these two checks form a cycle — evaluating teams_select requires
-- evaluating team_members' RLS, which requires evaluating teams' RLS again, and so on forever
-- (Postgres error 42P17, "infinite recursion detected in policy"). A security-definer function
-- bypasses RLS on the table it queries (it runs as the function's owner, not the calling role),
-- which is exactly what breaks the cycle here, the same way is_linked_coach_of already avoids
-- recursing through team_members' own policies.
create or replace function is_member_of_team(target_team uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = target_team and athlete_id = auth.uid()
  );
$$;

create or replace function is_coach_of_team(target_team uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from teams
    where id = target_team and coach_id = auth.uid()
  );
$$;

-- A coach can only insert a team_members row if they already know the athlete's uuid — but
-- profiles_select (below) only lets a coach read a profile they're *already* linked to, so
-- there's no RLS-visible way to look an athlete up by email before the link exists. This RPC is
-- the one deliberate, narrow exception: it resolves an email to a uuid and creates the invite in
-- a single security-definer step, without ever exposing arbitrary profile rows to the client —
-- the caller learns nothing except "invited" or an error, never another user's data directly.
create or replace function invite_athlete_by_email(target_team uuid, target_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  target_uid uuid;
begin
  if not exists (select 1 from teams where id = target_team and coach_id = auth.uid()) then
    raise exception 'Only the team''s coach can invite athletes';
  end if;

  select id into target_uid from profiles where email = target_email and role = 'athlete';
  if target_uid is null then
    raise exception 'No athlete account found for that email';
  end if;

  insert into team_members (team_id, athlete_id, status)
  values (target_team, target_uid, 'pending')
  on conflict (team_id, athlete_id) do nothing;
end;
$$;

grant execute on function invite_athlete_by_email(uuid, text) to authenticated;

-- ============================================================================================
-- Row Level Security
-- ============================================================================================

alter table profiles enable row level security;
alter table athlete_profiles enable row level security;
alter table completions enable row level security;
alter table stroke_log enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table workouts enable row level security;
alter table results enable row level security;
alter table messages enable row level security;
alter table team_messages enable row level security;

-- profiles: no client-facing insert policy at all — handle_new_user() owns row creation.
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_admin() or is_linked_coach_of(id));
create policy "profiles_update" on profiles for update
  using (id = auth.uid() or is_admin());
create policy "profiles_delete" on profiles for delete
  using (id = auth.uid() or is_admin());

-- athlete_profiles / completions / stroke_log: own row, or admin, or linked coach can read;
-- only the owner or admin can write.
create policy "athlete_profiles_select" on athlete_profiles for select
  using (user_id = auth.uid() or is_admin() or is_linked_coach_of(user_id));
create policy "athlete_profiles_write" on athlete_profiles for all
  using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

create policy "completions_select" on completions for select
  using (user_id = auth.uid() or is_admin() or is_linked_coach_of(user_id));
create policy "completions_write" on completions for all
  using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

create policy "stroke_log_select" on stroke_log for select
  using (user_id = auth.uid() or is_admin() or is_linked_coach_of(user_id));
create policy "stroke_log_write" on stroke_log for all
  using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

-- teams
create policy "teams_select" on teams for select
  using (coach_id = auth.uid() or is_admin() or is_member_of_team(id));
create policy "teams_write" on teams for all
  using (coach_id = auth.uid() or is_admin()) with check (coach_id = auth.uid() or is_admin());

-- team_members: the only coach<->athlete authorization link, and an invite. Only the team's
-- coach can create a row (send an invite) or remove one (revoke/kick); only the invited athlete
-- can flip their own row from 'pending' to 'active' (accept) — never create one for themselves,
-- never accept a row that isn't theirs, never set any status but 'active' on their own row.
create policy "team_members_select" on team_members for select
  using (athlete_id = auth.uid() or is_admin() or is_coach_of_team(team_id));
create policy "team_members_insert" on team_members for insert
  with check (status = 'pending' and is_coach_of_team(team_id));
create policy "team_members_update" on team_members for update
  using (athlete_id = auth.uid() or is_admin() or is_coach_of_team(team_id))
  with check (
    (athlete_id = auth.uid() and status = 'active')
    or is_admin()
    or is_coach_of_team(team_id)
  );
create policy "team_members_delete" on team_members for delete
  using (athlete_id = auth.uid() or is_admin() or is_coach_of_team(team_id));

-- workouts: only a linked coach can author one for their own athlete.
create policy "workouts_select" on workouts for select
  using (athlete_id = auth.uid() or coach_id = auth.uid() or is_admin());
create policy "workouts_insert" on workouts for insert
  with check (is_coach() and coach_id = auth.uid() and is_linked_coach_of(athlete_id));
create policy "workouts_update" on workouts for update
  using (coach_id = auth.uid() or is_admin());
create policy "workouts_delete" on workouts for delete
  using (coach_id = auth.uid() or is_admin());

-- results: the literal "can't see another athlete's results" example — only the row's own
-- athlete_id, an admin, or that athlete's active linked coach, never any other athlete.
create policy "results_select" on results for select
  using (athlete_id = auth.uid() or is_admin() or is_linked_coach_of(athlete_id));
create policy "results_insert" on results for insert
  with check (athlete_id = auth.uid()
    or (is_coach() and coach_id = auth.uid() and is_linked_coach_of(athlete_id)));
create policy "results_update" on results for update
  using (athlete_id = auth.uid() or coach_id = auth.uid() or is_admin());
create policy "results_delete" on results for delete
  using (athlete_id = auth.uid() or coach_id = auth.uid() or is_admin());

-- messages: only the two parties on the thread; immutable once sent (no update policy at all).
create policy "messages_select" on messages for select
  using (coach_id = auth.uid() or athlete_id = auth.uid() or is_admin());
create policy "messages_insert" on messages for insert
  with check (sender_id = auth.uid() and (coach_id = auth.uid() or athlete_id = auth.uid()));
create policy "messages_delete" on messages for delete using (is_admin());

-- team_messages: the team's coach and every active member can read/post.
create policy "team_messages_select" on team_messages for select
  using (
    is_admin()
    or exists (select 1 from teams t where t.id = team_messages.team_id and t.coach_id = auth.uid())
    or is_active_member_of(team_id)
  );
create policy "team_messages_insert" on team_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      exists (select 1 from teams t where t.id = team_messages.team_id and t.coach_id = auth.uid())
      or is_active_member_of(team_id)
    )
  );
create policy "team_messages_delete" on team_messages for delete using (is_admin());

-- ============================================================================================
-- Bootstrapping the first admin (one-time, manual): sign up normally through the app first
-- (you'll get 'athlete' via handle_new_user()), then run:
--
--   update profiles set role = 'admin' where email = 'you@example.com';
--
-- in the SQL editor. This intentionally can't be done any other way — see "Roles" in
-- docs/supabase-architecture.md for why there's no bootstrap admin API.
-- ============================================================================================
