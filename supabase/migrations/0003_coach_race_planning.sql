-- Swim Planner — coach-set goal race date + synced session feedback.
-- Additive migration — safe to run after 0001_init.sql/0002_friends.sql without dropping or
-- recreating anything from those files.
--
-- Design: extends the coach<->athlete relationship from 0001_init.sql so a coach's "I write the
-- training for my athlete" role covers periodization and post-session feedback too, not just
-- one-off workouts —
-- (1) a coach can set (or clear) a linked athlete's goal race date, which drives periodization
--     (base/build/peak/taper — src/domain/periodization.ts) and the race day plan
--     (src/domain/raceDayPlan.ts), via the same narrow security-definer RPC pattern as
--     invite_athlete_by_email() in 0001_init.sql rather than a broad RLS write grant on
--     athlete_profiles for coaches — the coach can set exactly this one column, nothing else in
--     the athlete's training profile.
-- (2) completions gains an optional `feedback` jsonb column (mirrors src/domain/types.ts's
--     SessionFeedback — difficulty + optional pain areas + zone) so a linked coach can see how a
--     session actually felt, not just that it happened. No RLS change needed here: the existing
--     completions_write policy already lets an athlete write any column on their own rows, and
--     completions_select already grants a linked coach read access to the whole row.

alter table athlete_profiles add column if not exists goal_race_date date;
alter table completions add column if not exists feedback jsonb;

-- A coach can set (or clear, with race_date = null) a linked athlete's goal race date — and
-- *only* that column, not the rest of their training profile — mirroring
-- invite_athlete_by_email()'s pattern: a narrow, security-definer RPC rather than a blanket RLS
-- write grant on athlete_profiles for coaches.
create or replace function set_athlete_goal_race_date(target_athlete uuid, race_date date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_linked_coach_of(target_athlete) then
    raise exception 'Only a linked coach can set this athlete''s goal race date';
  end if;

  update athlete_profiles set goal_race_date = race_date, updated_at = now()
  where user_id = target_athlete;
end;
$$;

grant execute on function set_athlete_goal_race_date(uuid, date) to authenticated;
