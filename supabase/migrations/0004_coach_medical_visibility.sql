-- Swim Planner — opt-in coach visibility for self-declared medical data.
-- Additive migration — safe to run after 0001_init.sql/0002_friends.sql/0003_coach_race_planning.sql
-- without dropping or recreating anything from those files.
--
-- Design: src/domain/medical.ts's MedicalProfile (self-declared injuries + conditions) was
-- deliberately local-only up to this point — "making health data visible to a coach deserves
-- its own explicit consent step, not a silent default" (see medical-storage.ts's original doc
-- comment). This migration is that explicit step: `medical_profiles` only ever holds a row for
-- an athlete who has turned on `share_with_coach` (the app itself only calls the upsert when
-- that flag is true, and deletes the row outright the moment it's turned back off — see
-- src/state/medical-context.tsx) — RLS below independently re-checks that same flag before a
-- coach can read it, as defense in depth, not as the sole boundary. This is a strictly narrower
-- grant than a coach's existing access to athlete_profiles/completions/stroke_log (0001_init.sql):
-- those are visible to any linked coach unconditionally, because a training profile isn't
-- sensitive the way a list of medical conditions is.

create table medical_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  injuries jsonb not null default '[]',
  conditions jsonb not null default '[]',
  share_with_coach boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table medical_profiles enable row level security;

-- The athlete can always read/write their own row (or an admin). A linked coach can read it
-- *only* when the athlete has both linked the coach's team AND turned sharing on — either
-- condition alone isn't enough, matching the "explicit, revocable consent" framing above.
create policy "medical_profiles_select" on medical_profiles for select
  using (
    user_id = auth.uid()
    or is_admin()
    or (share_with_coach and is_linked_coach_of(user_id))
  );
create policy "medical_profiles_write" on medical_profiles for all
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());
