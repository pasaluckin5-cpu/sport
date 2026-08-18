# Supabase architecture proposal (draft — not yet implemented)

Status: **confirmed — ready to implement.** Supersedes the earlier Firebase draft (switched to
Supabase per request). Three decisions confirmed on top of the original draft:

1. **The coach sends the invite** — an athlete never initiates the link.
2. **Team membership is mandatory** — there's no separate 1:1 coach↔athlete link; a coach is
   only ever connected to an athlete through a team the coach owns. The earlier draft's
   standalone `coach_athletes` table is gone; `team_members` (with a `status` column) is now the
   *only* authorization link between a coach and an athlete.
3. **Workouts are structured**, not free text — a coach-authored workout reuses the app's
   existing `SetStep[]`/`GymBlock[]` shapes (JSONB columns) so it renders through the same
   `formatSetStep`/`formatGymBlock` formatters the generated plan already uses, instead of a
   separate free-text rendering path.

Nothing in `src/` has been touched yet. Next phase: install `@supabase/supabase-js`, add
`src/supabase/*`, build Auth screens, and migrate local `AsyncStorage` data into Postgres — in
that order, without deleting the local-storage path until the Supabase path has been verified
end to end.

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

-- The *only* authorization link between a coach and an athlete — team membership is mandatory,
-- there's no separate 1:1 coach_athletes table. A 'pending' row is an invite the coach sent
-- that the athlete hasn't accepted yet; only the athlete can flip it to 'active' (or delete it
-- to decline). The coach is the sole inviter — an athlete can never insert their own row here.
create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  status link_status not null default 'pending',
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (team_id, athlete_id)
);

-- A coach-authored session, distinct from the locally-generated plan — the coach's own
-- addition/override for one athlete. Structured the same way a generated day already is
-- (PoolSession's warmup/main/cooldown SetStep[] and GymSession's GymBlock[]) so it renders
-- through the exact same formatSetStep/formatGymBlock formatters the Plan screen already uses,
-- instead of a second, free-text rendering path. Both jsonb columns are nullable independently
-- so a workout can be swim-only, gym-only, or both (a double day), matching DayPlan today.
create table workouts (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  workout_date date not null,
  title text not null,
  pool_zone text,                 -- Zone, e.g. 'threshold' — null if this workout has no swim
  pool_warmup jsonb,               -- SetStep[]
  pool_main jsonb,                 -- SetStep[]
  pool_cooldown jsonb,             -- SetStep[]
  gym_focus text,                  -- GymFocus — null if this workout has no gym block
  gym_blocks jsonb,                -- GymBlock[]
  coach_note text,                 -- free-text note from the coach, shown alongside the structured sets
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pool_warmup is not null or gym_blocks is not null)  -- a workout must have at least one half
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

-- Team-wide broadcast chat: one thread per team, visible to the coach and every active member
-- at once — separate from the 1:1 `messages` thread above, which stays private between the
-- coach and one athlete. Any active member can post (a team chat, not just a coach announcement
-- channel); membership is re-checked on every read/write via team_members, so someone removed
-- from the team loses access immediately.
create table team_messages (
  id bigint generated always as identity primary key,
  team_id uuid not null references teams(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  sent_at timestamptz not null default now()
);
```

### Inviting an athlete by email (`invite_athlete_by_email` RPC)

A coach can only `insert` a `team_members` row if they already know the athlete's `uuid` — but
`profiles_select` only lets a coach read a profile they're *already* linked to, which is
circular: there's no RLS-visible way to look an athlete up by email before the link exists. The
fix is one narrow `security definer` RPC that resolves the email and creates the invite in a
single step, without ever exposing arbitrary profile rows to the client (the caller learns only
"invited" or an error — never another user's data directly):

```sql
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
```

Called from the client as `supabase.rpc('invite_athlete_by_email', { target_team, target_email })`.

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

Helper functions first (`security definer` so they can read `profiles`/`team_members`/`teams`
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

-- "Linked" now means: the caller coaches a team that this athlete is an active member of.
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

-- team_members: this is now the *only* coach<->athlete authorization link, and an invite —
-- only the team's coach can create a row (send an invite) or remove one (revoke/kick); only the
-- invited athlete can flip their own row from 'pending' to 'active' (accept) — they can't
-- create a row for themselves, and they can't accept a row that isn't theirs.
create policy "team_members_select" on team_members for select
  using (athlete_id = auth.uid() or is_admin()
    or exists (select 1 from teams t where t.id = team_members.team_id and t.coach_id = auth.uid()));
create policy "team_members_insert" on team_members for insert
  with check (
    status = 'pending'
    and exists (select 1 from teams t where t.id = team_members.team_id and t.coach_id = auth.uid())
  );
create policy "team_members_update" on team_members for update
  using (
    athlete_id = auth.uid()
    or is_admin()
    or exists (select 1 from teams t where t.id = team_members.team_id and t.coach_id = auth.uid())
  )
  with check (
    -- an athlete accepting their own invite may only flip pending -> active, nothing else
    (athlete_id = auth.uid() and status = 'active')
    or is_admin()
    or exists (select 1 from teams t where t.id = team_members.team_id and t.coach_id = auth.uid())
  );
create policy "team_members_delete" on team_members for delete
  using (
    athlete_id = auth.uid() or is_admin()
    or exists (select 1 from teams t where t.id = team_members.team_id and t.coach_id = auth.uid())
  );

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

-- team_messages: the team's coach and every *active* member can read/post; removing someone
-- from team_members (status no longer 'active') immediately cuts their access on the next
-- request, since is_active_member_of() re-checks live, not a cached membership flag.
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
6. Coach features (team management/invites, structured workout authoring, results review, the
   1:1 message thread, and the team-wide group chat) as their own screens, gated on
   `role === 'coach'`.
7. Update `docs/privacy-policy.html` and the in-app privacy section for optional accounts: what
   Supabase (hosted Postgres, EU/US region choice at project creation) stores, that a linked
   coach can see profile/history/results (not friends — separate, not-yet-designed feature), how
   to delete an account/data.
8. Verify what's testable without a live Supabase project (typecheck, lint, existing tests,
   `expo export --platform web`, and that signed-out mode is pixel-for-pixel unchanged via
   Playwright) — real Auth/DB calls need a real Supabase project's URL + anon key, which only you
   can create (supabase.com → New project → SQL editor: run the schema above → Project
   Settings → API: copy URL + anon key into `.env`).

## Resolved decisions (were open questions, now confirmed)

1. **Coach↔athlete linking**: the coach is the sole inviter. `team_members_insert` only allows a
   row when the caller owns the target team; an athlete can never create their own membership
   row, only flip an existing `'pending'` row (invited by their coach) to `'active'`.
2. **Team vs. 1:1 coaching**: team membership is mandatory — `coach_athletes` was removed
   entirely, `team_members` is the one and only coach↔athlete authorization link.
3. **`workouts`**: structured (`pool_warmup`/`pool_main`/`pool_cooldown`/`gym_blocks` as `jsonb`
   holding `SetStep[]`/`GymBlock[]`), not free text — renders through the existing
   `formatSetStep`/`formatGymBlock` formatters, one rendering path for generated and
   coach-authored sessions alike.

## Still open / out of scope for this pass

1. **Friends** (from the original request, separate from coach) aren't in this schema — scoped
   out intentionally; worth its own design pass once the coach/team model above ships, since it
   needs a much looser read grant than the coach relationship (probably a curated "public
   summary" view rather than raw table access).
2. **Team chat pagination/real-time**: `team_messages`/`messages` are plain tables for v1 (polled
   or fetched on screen focus); Supabase Realtime (`supabase.channel(...).on('postgres_changes',
   ...)`) is a natural follow-up for live delivery without a page refresh, not required to ship
   a working chat.
