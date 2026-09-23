-- Swim Planner — friends can see each other's training plan (profile settings), not just results.
-- Additive migration — safe to run after 0001_init.sql/0002_friends.sql/0003_coach_race_planning.sql/
-- 0004_coach_medical_visibility.sql without dropping or recreating anything from those files
-- except the one policy this widens.
--
-- Design: 0002_friends.sql deliberately scoped the friends grant to `results` (plus the
-- `profiles` row needed to interpret them) — friends could not see `athlete_profiles`, so there
-- was no way to reconstruct or preview a friend's weekly plan (`generateWeekPlan` is a pure
-- function of just `AthleteProfile` — see src/domain/planGenerator.ts — so seeing the plan
-- requires seeing the profile that generates it). This migration widens exactly that one table's
-- select policy to also allow a friend, using the same `is_friend_of()` function 0002 already
-- defined. `completions`/`stroke_log` (history, feedback, stroke log) stay coach-only — a friend
-- sees what the plan looks like, not the athlete's actual training history or how sessions felt,
-- which is a materially more personal window into someone's life than "here's this week's plan."
-- Accepting a friend request is itself the consent step here (same as joining a coach's team
-- already implies sharing the training profile with that coach — no *additional* per-field
-- opt-in the way medical data required in 0004, since a plan built from public-ish settings
-- (level, goal, schedule) isn't the same sensitivity class as self-declared health data).

drop policy if exists "athlete_profiles_select" on athlete_profiles;
create policy "athlete_profiles_select" on athlete_profiles for select
  using (user_id = auth.uid() or is_admin() or is_linked_coach_of(user_id) or is_friend_of(user_id));
