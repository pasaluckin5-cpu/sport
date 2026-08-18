# Supabase architecture proposal (draft — not yet implemented)

Status: **proposal for review** (supersedes the earlier Firebase draft — switched to Supabase
per request). Nothing in `src/` has been touched for this. Once this is approved, the next
phase is: install `@supabase/supabase-js`, add `src/supabase/*`, build Auth screens, and migrate
local `AsyncStorage` data into Postgres — in that order, without deleting the local-storage path
until the Supabase path has been verified end to end.

## Why Postgres/RLS instead of Firestore rules

Same reasoning as before (schema + access rules first, so the client isn't built against a
shape that then needs the security model retrofitted), but the actual relationships in this app
— a coach *has many* athletes, a result *belongs to* one athlete, a team *has many* members —
are genuinely relational (foreign keys, joins), which Postgres expresses far more directly than
Firestore's document/subcollection model did (no more composite-ID tricks to fake a join).

## Roles

Same three roles as before, now a Postgres enum on `profiles.role`:

- `athlete` — the default every sign-up gets.
- `coach` — sees their linked athletes, authors workouts, logs/reviews results, messages
  athletes, manages teams.
- `admin` — the only role that can change another user's `role`.

**"An athlete can't just change their own role to coach"** is enforced by a `BEFORE UPDATE`
trigger on `profiles` (not by the RLS policy alone — see below for why the trigger is the more
robust mechanism here), which raises an error if `role` changes and the caller isn't an admin.

**Bootstrapping the first admin:** exactly like the Firebase draft, there's no admin yet to
promote the first one, so the project owner signs up normally (becomes `athlete` via the
auto-provisioning trigger below), then runs one manual `update profiles set role = 'admin'
where email = '...'` once in the Supabase SQL editor. No server code needed for this.

## Schema (Postgres, `public` schema)

```sql
create type user_role as enum ('athlete', 'coach', 'admin');
create type gender as enum ('male', 'female');
create type link_status as enum ('pending', 'active');
create type race_stroke as enum ('freestyle', 'backstroke', 'breaststroke', 'butterfly', 'im');

-- Mirrors auth.users (Supabase-managed) 1:1 — auto-created by a trigger on sign-up, see below.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role user_role not null default 'athlete',
  gender gender,
  created_at timestamptz not null default now()
);

-- Mirrors today's AthleteProfile 1:1.
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

-- One row per completed session (today's single JSON map becomes real rows — trivial to query
-- "this week's completions" or "this athlete's history" with a plain WHERE instead of parsing a map).
create table completions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  week_key text not null,
  day_index int not null,
  kind text not null check (kind in ('pool','gym')),
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

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, athlete_id)
);

-- The core authorization link between a coach and an athlete — teams are organizational sugar
-- on top of this, not a substitute for it (an athlete can be coached 1:1 with no team at all).
create table coach_athletes (
  coach_id uuid not null references profiles(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  status link_status not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id)
);

-- A coach-authored session, distinct from the locally-generated plan — the coach's own
-- addition/override for one athlete.
create table workouts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  workout_date date not null,
  title text not null,
  description text not null,  -- v1: free text; see "open questions" re: structured SetStep[] shape
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table results (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid references profiles(id) on delete set null,  -- set when a coach logged it
  distance numeric not null,
  stroke race_stroke not null,
  time_sec numeric not null,
  result_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create table messages (
  id bigint generated always as identity primary key,
  coach_id uuid not null references profiles(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz
);
```

### Auto-provisioning a `profiles` row on sign-up

Rather than have the client insert its own `profiles` row after sign-up (which would need an
`insert` policy that then has to defend against a client claiming `role = 'coach'` at creation
time), a trigger on Supabase's own `auth.users` table creates it server-side, hardcoded to
`'athlete'` — the client never gets an insert path for `profiles` at all, which is a strictly
stronger guarantee than a policy check:

```sql
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
```

## Row Level Security

Helper functions first (`security definer` so they can read `profiles`/`coach_athletes`
regardless of the calling user's own RLS grants — the standard Supabase pattern for avoiding
recursive-policy evaluation):

```sql
create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_coach() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach');
$$;

create or replace function is_linked_coach_of(target_athlete uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from coach_athletes
    where coach_id = auth.uid() and athlete_id = target_athlete and status = 'active'
  );
$$;
```

The role-freeze trigger (this is the mechanism that actually blocks self-promotion — a `with
check` on the `profiles` UPDATE policy could try to compare NEW vs. OLD `role` too, but that
self-referential-subquery pattern is a known sharp edge in Postgres RLS; a `BEFORE UPDATE`
trigger is the standard, unambiguous way to freeze one column):

```sql
create or replace function prevent_role_self_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not is_admin() then
    raise exception 'Only an admin can change a user role';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_role_self_escalation
before update on profiles
for each row execute function prevent_role_self_escalation();
```

Policies, table by table (every table has `alter table X enable row level security;` first):

```sql
-- profiles: no client-facing insert policy at all (the trigger above owns row creation).
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_admin() or is_linked_coach_of(id));
create policy "profiles_update" on profiles for update
  using (id = auth.uid() or is_admin());
create policy "profiles_delete" on profiles for delete
  using (id = auth.uid() or is_admin());

-- athlete_profiles / completions / stroke_log: same "own row, or admin, or linked coach can
-- read; only own row or admin can write" shape for all three.
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
  using (coach_id = auth.uid() or is_admin()
    or exists (select 1 from team_members tm where tm.team_id = teams.id and tm.athlete_id = auth.uid()));
create policy "teams_write" on teams for all
  using (coach_id = auth.uid() or is_admin()) with check (coach_id = auth.uid() or is_admin());

-- team_members
create policy "team_members_select" on team_members for select
  using (athlete_id = auth.uid() or is_admin()
    or exists (select 1 from teams t where t.id = team_members.team_id and t.coach_id = auth.uid()));
create policy "team_members_write" on team_members for all
  using (is_admin() or exists (select 1 from teams t where t.id = team_members.team_id and t.coach_id = auth.uid()))
  with check (is_admin() or exists (select 1 from teams t where t.id = team_members.team_id and t.coach_id = auth.uid()));

-- coach_athletes: either party can propose a link; only the coach (or admin) can accept/edit it.
create policy "coach_athletes_select" on coach_athletes for select
  using (coach_id = auth.uid() or athlete_id = auth.uid() or is_admin());
create policy "coach_athletes_insert" on coach_athletes for insert
  with check (coach_id = auth.uid() or athlete_id = auth.uid());
create policy "coach_athletes_update" on coach_athletes for update
  using (coach_id = auth.uid() or is_admin());
create policy "coach_athletes_delete" on coach_athletes for delete
  using (coach_id = auth.uid() or athlete_id = auth.uid() or is_admin());

-- workouts: only a linked coach can author one for their own athlete.
create policy "workouts_select" on workouts for select
  using (athlete_id = auth.uid() or coach_id = auth.uid() or is_admin());
create policy "workouts_insert" on workouts for insert
  with check (is_coach() and coach_id = auth.uid() and is_linked_coach_of(athlete_id));
create policy "workouts_update" on workouts for update
  using (coach_id = auth.uid() or is_admin());
create policy "workouts_delete" on workouts for delete
  using (coach_id = auth.uid() or is_admin());

-- results: this is the literal "can't see another athlete's results" example from the request.
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
```

Checked against the two literal examples from the request:
- *"An athlete can't just change their own role to coach"* → blocked by
  `prevent_role_self_escalation()`, a trigger, not a policy the client could route around by
  hitting a different table/RPC.
- *"An athlete can't view another athlete's results"* → `results_select` only allows the row's
  own `athlete_id`, an `admin`, or that athlete's `active` linked coach — never "any signed-in
  user."

## Supabase URL/anon key isn't a secret — the service_role key is

Same point as the Firebase draft, translated: the **anon key** (paired with the project URL) is
meant to ship in client code — Supabase's own docs say so explicitly — because it grants
nothing by itself; every table has RLS enabled, so access is entirely governed by the policies
above plus real authentication. It'll be read from `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY` env vars rather than hardcoded, mainly so a dev vs. prod project
can be swapped without an app code change.

What must **never** appear in this repo or any client code is the **`service_role` key** (bypasses
RLS entirely — Supabase's equivalent of a Firebase Admin SDK key). This architecture has no
server component, so there's no legitimate reason for that key to exist anywhere in the app; the
one-time admin bootstrap and the `handle_new_user` trigger both run inside Postgres itself (via
the SQL editor / a migration), never through client code, so it's never needed there either.

## Auth integration notes (Expo/React Native)

- `@supabase/supabase-js`, with `AsyncStorage` passed as the `storage` option and
  `detectSessionInUrl: false` — the standard config for React Native so the session persists
  across app restarts without relying on browser URL handling.
- Email/password to start (simplest, no OAuth redirect complexity in Expo); magic-link email
  sign-in is a natural v2 if wanted.
- `supabase.auth.onAuthStateChange` drives `AuthProvider`/`useAuth`, mirroring the existing
  `HistoryProvider`/`PlanProvider` pattern already in `src/state/`.

## Migration plan (once this is approved)

1. `npm install @supabase/supabase-js`, add `src/supabase/config.ts` (env-based) — no behavior
   change yet.
2. Run the schema + trigger + RLS SQL above via the Supabase SQL editor (or a versioned
   migration file under `supabase/migrations/` if using the Supabase CLI).
3. Auth: sign-up/sign-in screens, `AuthProvider`/`useAuth`. Signed-out = today's exact
   experience, unchanged.
4. Sync layer: `profile-storage.ts`, `history-storage.ts`, `strokeLog-storage.ts` gain a
   Postgres-backed counterpart used *only* when signed in; `AsyncStorage` stays the always-on
   local cache and the entire experience when signed out — local mode isn't a fallback bolted on
   after the fact, Supabase is additive on top of it.
5. One-time migration-on-sign-in: if local `AsyncStorage` has profile/history/strokeLog data and
   the signed-in user's Postgres rows don't exist yet, upload it once.
6. Coach features (team management, workout authoring, results review, messaging) as their own
   screens, gated on `role === 'coach'`.
7. Update `docs/privacy-policy.html` and the in-app privacy section for optional accounts: what
   Supabase (hosted Postgres, EU/US region choice at project creation) stores, that a linked
   coach can see profile/history/results (not friends — separate, not-yet-designed feature), how
   to delete an account/data.
8. Verify what's testable without a live Supabase project (typecheck, lint, existing tests,
   `expo export --platform web`, and that signed-out mode is pixel-for-pixel unchanged via
   Playwright) — real Auth/DB calls need a real Supabase project's URL + anon key, which only you
   can create (supabase.com → New project → SQL editor: run the schema above → Project
   Settings → API: copy URL + anon key into `.env`).

## Open questions before implementing

1. **Coach↔athlete linking flow**: who initiates? The `coach_athletes_insert` policy supports
   either direction (athlete requests a coach by email/code, or coach invites an athlete) at
   `status: 'pending'` — only the coach finalizes it to `'active'`. Just need to confirm the UX.
2. **Team vs. 1:1 coaching**: is a `team` required, or optional organizational grouping on top of
   `coach_athletes` (the real authorization link)? Schema above treats it as optional — confirm
   that's right.
3. **`workouts.description`**: free text for v1, or reuse the existing `SetStep[]`/`GymBlock[]`
   structured shape so a coach-authored workout renders through the same `formatSetStep`/
   `formatGymBlock` formatters the generated plan already uses? More work up front, avoids two
   rendering paths.
4. **Friends** (from the original request, separate from coach) aren't in this schema yet —
   scoped out intentionally, same as the Firebase draft; worth its own design pass once this core
   schema is settled, since it needs a much looser read grant than the coach relationship
   (probably a curated "public summary" view rather than raw table access).
