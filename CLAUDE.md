# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Swim Planner: an Expo (React Native + web) app that generates a personalized weekly training
plan from an athlete's profile — level, goal, how many pool sessions per week and their
duration, optional gym/strength sessions, units and pool length (meters/yards, 25/50), whatever
pool equipment they own (fins, paddles, pull buoy, kickboard, snorkel, parachute, tempo
trainer, ankle band), and optionally a recent time-trial result used to target real paces.
Setting pool sessions to 0 switches the whole app into a gym/fitness-only mode for people who
don't swim at all — see "Gym modes" below. The UI is available in English and Russian.
Everything is local-first: there is no backend, no auth, no network calls. A profile, a
completed-session history, and a language choice are saved to `AsyncStorage`; the week's plan
is derived from the profile on the fly.

## Commands

```
npm start            # expo start — dev server, press w/i/a to open a platform
npm run web           # expo start --web
npm run ios / android # expo start --ios / --android
npm run lint           # eslint . (flat config in eslint.config.js, eslint-config-expo/flat)
npm test               # vitest run — src/domain + src/i18n, see below
npx vitest run src/domain/planGenerator.test.ts -t "some test name"   # single test
npx tsc --noEmit                        # typecheck
npx expo export --platform web          # production web bundle sanity check; output in dist/ (gitignored)
node scripts/generate-icons.js          # regenerate icon.png/favicon/splash/adaptive-icon layers from SVG
```

`expo lint`'s own auto-setup and `expo install`'s version-compatibility check both call out to
a metadata service that this sandbox's proxy blocks ("HTTP Proxy Network Error: Forbidden").
That's why `npm run lint` calls `eslint .` directly against a manually-written
`eslint.config.js` rather than going through `expo lint`'s wrapper/first-run wizard, and why
new Expo-managed packages should be added with plain `npm install` rather than `npx expo
install` in this environment. CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, and
the web export sanity check on every PR — it isn't hit by this sandbox's proxy restriction
since it runs on GitHub's own runners, but it does need `expo-env.d.ts` regenerated first (see
below) since that file is gitignored.

`expo-env.d.ts` is gitignored and auto-generated (normally on first `expo start`); if it's
missing and `tsc` complains about `*.css`/`*.module.css` imports, recreate it with a single
line: `/// <reference types="expo/types" />`.

## Architecture

**The whole product is one pure function.** `src/domain/planGenerator.ts` exports
`generateWeekPlan(profile: AthleteProfile, options?: { weekKey?: string }): WeekPlan`. Given a
profile it deterministically builds a 7-day plan — no randomness, no I/O; `weekKey` (an ISO
week like `"2026-W08"`, default: today's) is the only other input, and only rotates *which*
curated zone/stroke/gym-focus sequence is used, so the same profile still varies from week to
week (see "Weekly variation" below) while staying fully reproducible in tests. This is what's
actually under test (`*.test.ts` in `src/domain`, run by `vitest`, independent of React
Native/Jest entirely since the whole `src/domain` layer has zero RN imports — **and zero i18n
imports**, see below).

**Domain output is structured, not English text.** `SetStep` and `GymBlock` (`types.ts`) carry
a `kind`/`exercise` key plus numbers (`reps`, `repDistance`, `restSec`, `paceSec`, `sets`, ...)
rather than a formatted sentence — `src/domain` must stay presentation- and language-agnostic.
Turning that into a sentence in the user's language is the UI layer's job, done by
`src/i18n/format.ts` (`formatSetStep`, `formatGymBlock`, `zoneLabel`, `swimSessionTitle`), which
takes an i18next `t` function. When adding a new `SetStepKind`/`GymExercise`, add the key to
*both* `src/i18n/locales/en.ts` and `ru.ts` (`setKind.*` / `gymExercise.*`) — nothing enforces
that at the type level, so a missing key silently falls back to showing the raw key string.

The domain layer is split by concern:
- `types.ts` — the shared vocabulary (`AthleteProfile`, `Zone`, `SetStep`, `PoolSession`,
  `GymSession`, `DayPlan`, `WeekPlan`, `PaceBenchmark`). A `DayPlan` has independent optional
  `pool` and `gym` fields (not a discriminated union), so a day can be a swim day, a gym day,
  both (a double day), or a rest day.
- `workoutLibrary.ts` — the training "knowledge base": per-`Zone` main-set builders
  (technique/aerobicBase/threshold/vo2max/sprint/recovery), warmup/cooldown builders, and gym
  exercise blocks per `GymFocus`. This encodes generic, widely-known competitive-swim coaching
  structure (warmup/main/cooldown volume split, zone-appropriate rep distances and rest,
  equipment substitution) — not any specific proprietary program. All distances are in the
  athlete's chosen `DistanceUnit` (meters or yards) and rounded to a whole number of pool
  lengths via `roundToPoolLength(distance, poolLength)` — a 50m-pool plan gets 50/100/150m
  reps, not 25m ones.
- `planGenerator.ts` — the scheduling logic on top of the library:
  - `sessionVolume` turns a session duration into a target distance via a per-level,
    per-unit pace table (`PACE_M_PER_HOUR`, converted to yards with the physical
    meters↔yards ratio — there's no separate yards pace table).
  - `POOL_DAY_PATTERNS` maps "N sessions/week" → which weekdays (0=Mon..6=Sun) get a pool
    session, spread as evenly as the count allows.
  - `ZONE_ROTATION_BY_GOAL` is a curated, goal-specific sequence of zones (fitness / endurance
    / speed / technique each order hard and easy zones differently); it's rotated by a
    week-derived offset (`weekKeyToOffset`/`rotateArray`, `src/domain/week.ts`) and then the
    first N entries are used for N sessions/week — the ordering is what keeps hard zones from
    clustering, and the rotation is what keeps consecutive weeks from being identical.
  - Gym-day placement prefers days with no pool session first, and downgrades a `lowerBody`
    gym day to `core` when the next day is a hard swim zone (threshold/vo2max/sprint), so leg
    fatigue doesn't undercut the next day's kick/pull power.
  - Equipment only shows up in a set's `equipment` field (and a session's `equipmentUsed`) when
    the athlete actually owns it — the generator must produce a fully valid plan for an athlete
    with zero equipment.
  - `AthleteProfile.benchmark` (optional `{ distance, timeSec }` time trial, in the athlete's
    unit) overrides the level-based volume estimate: `estimateDistancePerHour` derives session
    volume from the athlete's actual pace instead of `PACE_M_PER_HOUR`, and `ZONE_PACE_FACTOR`
    derives a target per-100(m/yd) pace for aerobicBase/threshold/vo2max main sets (`paceSec` on
    the step, rendered by the UI as e.g. `@ 1:40`). Technique/recovery/sprint stay effort-based
    and are never paced. A benchmark with `timeSec: 0` is treated as unset (the Profile screen
    strips it before saving) rather than dividing out a nonsense pace.

**Gym modes**: `workoutLibrary.ts` has two separate gym exercise catalogs, chosen by
`GymSession.mode`. `poolCount > 0` → `'swimDryland'`: every exercise carries a `SwimBenefit` tag
(`shoulderHealth` / `pullStrength` / `kickPower` / `corePower` / `explosiveStart` / `mobility`)
so the athlete can see *why* it's programmed — rotator-cuff/scapular work for shoulder-injury
prevention, pulling-strength work for the catch/pull phase, explosive hip extension for
starts/turns, ankle/hip mobility for kick range of motion, rotational core control for the
streamline position and body roll. `poolCount === 0` (no pool sessions at all — a pure
gym/fitness athlete) → `'generalFitness'`: the plain strength-split catalog, no swim framing,
no `benefit` tags. `TrainingGoal` (renamed from `SwimGoal` once it started applying to
non-swimmers too) also biases which `GymFocus` a gym day gets via
`GYM_FOCUS_ROTATION_BY_GOAL` — `speed` front-loads power (lowerBody/fullBody), `technique`
front-loads mobility/core (movement quality — and for swimmers, the shoulder/rotational work
that most carries over to stroke technique). Unlike the swim zone/stroke rotations, this one is
**not** rotated by week key: the goal should shape the gym split the same way every week, while
weekly variety already comes from the swim side. When `poolCount === 0`, gym days are spread
across the week with the same `POOL_DAY_PATTERNS` table used for pool days (reused purely for
its "spread N per week" property) instead of the pool-day/rest-day-aware placement used when
there's swimming to work around.

**Specialization (primary strokes & race distances)**: swimmers can optionally set
`AthleteProfile.primaryStrokes` (`RaceStroke[]` — freestyle/backstroke/breaststroke/butterfly/im)
and `primaryDistances` (`number[]`, in the athlete's unit) on the Profile screen, so the
generator can bias the plan toward what they're actually training for instead of a generic
freestyle-only default — both fields are optional and only shown when `poolSessionsPerWeek > 0`.
- `buildStrokeRotation(primaryStrokes)` (`workoutLibrary.ts`) interleaves freestyle with the
  chosen stroke(s) — `[freestyle, strokeA, freestyle, strokeB, ...]` — falling back to
  `DEFAULT_STROKE_ROTATION` (freestyle-heavy) when no strokes are set. The array length is
  deliberately `primaryStrokes.length * 2` (always even), not a fixed 7: `k % evenLength`
  preserves `k`'s parity with no wraparound exceptions, so strict freestyle/primary alternation
  is mathematically guaranteed. This matters because `POOL_DAY_PATTERNS` weekdays for a given
  session count are often all the same parity (e.g. 3/week = Mon/Wed/Fri, all even) — an odd-length
  rotation (or indexing by weekday instead of session order) can systematically collide with that
  parity and hide the primary stroke from an entire low-frequency week. `strokeFor(sessionIndex,
  weekOffset, rotation)` is indexed by the pool session's 0-based position *within the week*
  (not its weekday) for the same reason — consecutive session indices are always truly
  consecutive integers, unlike weekday numbers.
- `specialtyFactor(primaryDistances)` (`workoutLibrary.ts`) log-scales the average of the chosen
  distances between 50 (pure sprint, factor 0) and 1500 (pure distance, factor 1); no distances
  set defaults to `0.5` (neutral mid-distance). `buildMainSet` uses it to scale aerobicBase/
  threshold/vo2max rep length (`repMultiplier = 0.75 + specialty * 0.5`) and rest
  (`restBias = 1 - specialty`, more rest for sprint-biased reps) — sprint and recovery zones stay
  unmodulated since sprint work is inherently short/max-effort regardless of race distance, and
  recovery is universal. `focusEmphasis(factor)` buckets the factor into `'sprint' | 'balanced' |
  'distance'` for display.
- Technique-zone drill steps get stroke-specific wording via i18next's `context` feature:
  `formatSetStep` (`src/i18n/format.ts`) passes `context: step.stroke` so `t('setKind.drill', {
  context: 'backstroke' })` resolves to the `setKind.drill_backstroke` key (falling back to the
  generic `setKind.drill` if a stroke-specific key is missing) — real technique cues per stroke
  (e.g. fingertip drag / 6-kick switch for freestyle, one-arm drill for backstroke, pullout
  dolphin-kick progressions for breaststroke, single-arm/vertical-dolphin work for butterfly)
  rather than one generic "technique drill" line for every stroke.
- `focusNoteText` (`src/i18n/format.ts`) renders a short "coach note" (e.g. "Specialty:
  butterfly · 100m — focus on a blend of speed and endurance.") shown on the Plan screen
  (`index.tsx`) right under the week summary, or `null` when neither field is set. This is
  templating grounded in real training principles (sprint/distance training emphasis, real
  stroke-technique cues), not live coaching — it doesn't see or adapt to how a session actually
  felt, and there's no video/technique analysis.

**Progress: stroke-count tracking, world records, and ЕВСК classification goals**: a "Progress"
section on the Plan screen (below History) gives an athlete two more coach-like feedback loops
beyond the generated plan itself, both scoped to stay honest about what static reference data
can and can't tell someone:
- **Stroke-count log** (`AthleteProfile`-independent — its own `StrokeCountEntry[]`, persisted
  via `src/storage/strokeLog-storage.ts` / `src/state/strokeLog-context.tsx`): the athlete logs
  how many strokes a distance took after a session. It's a manual, low-tech version of SWOLF —
  there's no sensor, so the app can't time the swim itself, only let the athlete log the count
  and see the average per distance trend over time. Not tied to a specific pool session; just a
  running log.
- **Records & goals** (`src/domain/standards.ts`): compares `AthleteProfile.benchmark` (assumed
  freestyle, same as everywhere else in this app — `PaceBenchmark` has no stroke field) against
  two curated reference tables, gated on `AthleteProfile.gender` (new, optional, added *only* to
  unlock this gender-specific comparison — never used by the plan generator itself):
  - `WORLD_RECORDS`: current long-course-meters individual world records across all five
    strokes/13 events, men and women — manually curated, not fetched live. Comment in the file
    flags it as approximate ("current as of early 2026") since records get broken; there's no
    live-updating source wired up.
  - `EVSK_FREESTYLE_25M`: Russian ЕВСК (Единая всероссийская спортивная классификация)
    classification-rank standard times, 2024–2026 cycle, **freestyle only, 25m course** —
    deliberately scoped to the stroke/distances (100/200/400m) this app's own benchmark and
    race-distance fields already use, and to what could be directly sourced. МСМК/МС/КМС cells
    are all directly sourced (swimka.ru); I/II/III разряд cells for 200m (both genders) and
    400m (women) weren't directly found and are interpolated from the rank-to-rank ratios
    observed on the fully-sourced distances — flagged in a comment as an approximation, not an
    official figure, since presenting a fabricated "official" classification time would be
    actively misleading for something people might use for real certification.
  - `rankForTime`/`nextRankTarget` turn a benchmark time into "your time already qualifies for
    X" and "next goal: Y, get under {{time}} ({{diff}}s to find)" — the concrete, adaptive-goal
    part of the request this feature answers. `src/i18n/format.ts`'s `recordsProgressText`
    composes these into display-ready lines (or returns `'needsGender' | 'needsBenchmark'` when
    there isn't enough profile info yet) and always appends a disclaimer line pointing at
    worldaquatics.com / the federation as the source of truth, not this table.
  - This is still reference data, read once at build time, not a live feed — same honesty
    framing as the rest of the app's "how are plans generated" story (see the plan-generation
    knowledge-base description above): a smarter, better-grounded template, not a coach that
    watches the athlete swim.

**Post-session feedback & periodization**: two more coach-like adaptation loops, both still
computed rather than sensed — the app has no way to know how a session actually felt except
what the athlete explicitly logs:
- **Periodization** (`src/domain/periodization.ts`): an optional `AthleteProfile.goalRaceDate`
  (ISO `yyyy-mm-dd`, set from a "Goal race date" Profile section that mirrors the benchmark
  section's Stepper+clear-link pattern) drives a standard four-phase periodization —
  base (general prep) → build (rising load) → peak (race-specific, high intensity) → taper
  (volume cut in the final week) — bucketed purely by `daysUntilRace(weekKey, goalRaceDate)`
  (via `week.ts`'s `weekKeyToMonday`, the inverse of `isoWeekKey`, so the calculation is anchored
  to the week being generated rather than to "today" — keeping `generateWeekPlan` a pure
  function of its inputs). `volumeMultiplier(phase)` (1.0 base/build, 0.9 peak, 0.65 taper) scales
  both pool session volume (`sessionVolume(...) * volumeMult` in `assemblePoolSession`) and gym
  session duration (rounded to the nearest 15 minutes, floor 20, via `roundGymDuration`).
  `WeekPlan.periodizationPhase` is only set when a goal race date exists; the Plan screen shows a
  short phase note (`periodizationNoteText` in `src/i18n/format.ts`) under the week summary, with
  its own phrasing for a race date that's already passed (`daysUntilRace < 0`) rather than
  showing a nonsensical negative day count.
- **Post-session feedback** (`SessionFeedback` in `types.ts` — a `Difficulty`
  `'easy'|'moderate'|'hard'|'tooHard'` plus optional `PainArea[]`): once a session is marked
  done, the Plan screen's `FeedbackPrompt` (`src/app/index.tsx`) offers a one-time difficulty +
  pain-area chip prompt; submitting calls `useHistory().setFeedback`, which widens the
  completion-map value at that key from `true` to the full `SessionFeedback` object (`isCompleted`
  still just checks truthiness, so both forms count as "done"). `HistoryProvider` exposes the
  athlete's most recent entries as `recentFeedback` (newest six, by key-string sort), which
  `PlanProvider` reads via `useHistory()` and passes into `generateWeekPlan`'s
  `recentFeedback` option — this is why `HistoryProvider` was moved *above* `PlanProvider` in
  `_layout.tsx`'s provider tree (a `PlanProvider` descendant can call `useHistory()`; the reverse
  nesting couldn't). `summarizeFeedback` folds those entries into an average difficulty score
  and a `shoulderPainFlagged` bool; `feedbackVolumeMultiplier` backs volume off after a
  hard/too-hard run (and nudges it up after an easy one) but *requires at least 2 samples* to
  act, since one bad day shouldn't swing the whole week — deliberately different from
  `avoidShoulderLoad`, which reacts to a *single* flagged sample immediately (erring toward
  caution on injury risk beats waiting to confirm a trend). Shoulder-pain avoidance reuses the
  existing "downgrade a day, don't drop it" pattern already established for hard-swim-eve leg
  days: `paddles` is filtered out of the athlete's equipment for that week's pool sets, and an
  `upperBody` gym-focus day is swapped to `mobility`. The periodization and feedback volume
  multipliers combine (`Math.min(1.1, Math.max(0.5, ...))`, clamped) rather than being mutually
  exclusive — a taper week with a recent hard-session run compounds toward less volume, not more.
  Feedback objects are stored locally only (`CompletionValue = true | SessionFeedback` in
  `history-storage.ts`); the Supabase `completions` table still only tracks a boolean per row (no
  feedback column), so on sign-in the cloud-merge effect in `history-context.tsx` layers any
  locally-logged feedback objects back on top of the cloud completion map rather than letting a
  plain-boolean cloud row silently overwrite a richer local one.

**Weekly variation & history**: nothing about a *profile* changes week to week, but
`generateWeekPlan`'s week-key rotation (above) means the actual zone order, stroke emphasis,
and gym-focus order differ across calendar weeks even for an unchanged profile — so the plan
isn't the same static week forever, without needing to persist multiple weeks of plan data.
Completed sessions are tracked separately from the plan: `src/state/history-context.tsx`
(`HistoryProvider`/`useHistory`) persists a flat `{ "weekKey:dayIndex:kind": true | SessionFeedback }`
map via `src/storage/history-storage.ts` (`kind` is `'pool' | 'gym'`, so a double day tracks each
half independently — see "Post-session feedback & periodization" above for the `SessionFeedback`
value). The Plan screen's "History" section summarizes counts per week from that same map —
there's no need to snapshot old `WeekPlan`s since the map only needs *counts*, not what was in
each session.

**i18n**: `src/i18n/index.ts` initializes a shared `i18next` instance with `en`/`ru` resources
(`src/i18n/locales/{en,ru}.ts`, plain TS objects — not JSON — for type-checked keys) and
`compatibilityJSON: 'v4'` so Russian's four-way plural forms (`_one`/`_few`/`_many`/`_other`,
i18next's own CLDR-derived rules, not dependent on the JS engine's `Intl.PluralRules`) work.
`src/state/language-context.tsx` (`LanguageProvider`/`useLanguage`) persists the chosen
language via `src/storage/language-storage.ts` and calls `i18n.changeLanguage`; there's no
device-locale auto-detection — the app defaults to English and the user picks a language
explicitly in Profile, to avoid a native-locale-detection dependency that can't be verified in
this sandbox (see "Runtime verification" below). Screen copy uses `useTranslation()` directly;
domain-generated copy goes through `src/i18n/format.ts` (see above). The unit abbreviation
("m"/"yd") is intentionally *not* translated (`unitAbbrev` in `format.ts`) — it's a universal
abbreviation, not a word.

**Units & pool length**: `AthleteProfile.unit: 'meters' | 'yards'` and
`poolLength: 25 | 50` (in that unit) drive every distance the generator produces — there's no
implicit meters↔yards conversion of a *saved* profile, an athlete's numbers just mean whatever
unit they picked. Changing unit or pool length is a normal profile edit, same as changing goal
or level.

**State/persistence**: `src/state/plan-context.tsx` (`PlanProvider`/`usePlan`) loads/saves an
`AthleteProfile` via `src/storage/profile-storage.ts` (a thin `AsyncStorage` wrapper) and
re-derives `weekPlan` with `useMemo` whenever the profile changes — there's no separate
persisted "plan", so profile and plan can never drift out of sync. `LanguageProvider` and
`HistoryProvider` (above) are the other two providers, all three wired in `_layout.tsx`.
**Backup**: independently of the cloud accounts described below, `profile.tsx`'s "Backup &
restore" section always works — it copies the saved `AthleteProfile` as JSON to the clipboard
(`expo-clipboard`) and restores it from pasted text via `src/domain/profileValidation.ts`'s
`parseProfileBackup` — a real validation boundary (the pasted text is untrusted external input),
not a trivial `JSON.parse`.

**Cloud accounts (optional, Supabase)**: the app is still fully local-first by default — no
account, no data leaves the device — but Profile → Account can create an optional account
backed by Supabase (Postgres + Auth), for cross-device sync and a coach/team feature. Full
schema, entity relationships, and Row Level Security design are in
`docs/supabase-architecture.md`; the actual SQL (tables, triggers, RLS policies) is
`supabase/migrations/0001_init.sql`, meant to be run once against a fresh Supabase project via
its SQL editor. Nothing here is wired to a real project by default: `src/supabase/config.ts`'s
`isSupabaseConfigured` is `false` (and `supabase` is `null`) unless `EXPO_PUBLIC_SUPABASE_URL`/
`EXPO_PUBLIC_SUPABASE_ANON_KEY` are set (see `.env.example`) — every data-access function in
`src/supabase/*.ts` no-ops when unconfigured, so the app never depends on Supabase being present.
- **Roles**: `athlete` (default on sign-up) / `coach` / `admin`, stored on each user's own
  `profiles` row. An athlete can never self-promote — the role field is frozen for self-writes
  by a Postgres trigger (`prevent_role_self_escalation`), not just an RLS check, so there's no
  code path (this app's or any other client) that can bypass it.
- **Sync layer**: `src/state/auth-context.tsx` (`AuthProvider`/`useAuth`) tracks the Supabase
  session. `plan-context.tsx`/`history-context.tsx`/`strokeLog-context.tsx` each gained a
  same-shaped effect: on sign-in, cloud data wins if it already exists (returning user, new
  device); otherwise the local `AsyncStorage` data — if any — is uploaded once (`src/supabase/
  sync.ts`). Signing out changes nothing else — whatever's currently loaded stays in state and
  in the local cache, so the entire app keeps working exactly as it does with no account at all.
  This mirroring means every existing local-only user is unaffected; cloud sync is additive, not
  a replacement path.
- **Teams are the only coach↔athlete link**: a coach creates a team (`src/components/
  coach-dashboard.tsx`) and invites an athlete by email — the coach is always the inviter, never
  the athlete (`invite_athlete_by_email` RPC, since RLS can't let a coach look up an arbitrary
  athlete's `uuid` by email any other way — see the migration file's comment on that function).
  The invited athlete accepts/declines from `src/components/athlete-coach-panel.tsx`. A team's
  coach can then see that athlete's profile/history/stroke-log/results (`is_linked_coach_of` in
  RLS), author `workouts` for them, and message them both 1:1 (`messages`) and via a team-wide
  group chat all active members share (`team_messages`).
- **Coach-authored workouts reuse the plan's own rendering**: `workouts` rows store
  `pool_warmup`/`pool_main`/`pool_cooldown` (`SetStep[]`) and `gym_blocks` (`GymBlock[]`) as
  `jsonb` — the same shapes `generateWeekPlan` produces — so `WorkoutCard` in
  `athlete-coach-panel.tsx` renders them through the exact same `formatSetStep`/`formatGymBlock`
  formatters the Plan screen uses, instead of a second free-text rendering path. The composer UI
  (`coach-dashboard.tsx`) is intentionally simpler than the generator itself — one warm-up step,
  one main-set step, one cool-down step per workout — documented in-app (`coach.workout.
  scopeNote`) rather than silently limiting without explanation.
- **What a coach can/can't see, concretely**: linked-coach read access is scoped to profile
  settings, completion history, stroke log, and results — never another coach's athletes, and
  never an athlete not on one of the coach's teams (checked live via `is_linked_coach_of`/
  `is_active_member_of` on every request, not cached). Leaving a team (or never joining one)
  means no coach can see that athlete's data. This is the exact boundary described in the
  Privacy Policy.
- **Deletion**: Profile → Account → "Delete my cloud data" (`deleteCloudData` in
  `src/supabase/sync.ts`) removes the user's own profile/history/stroke-log/results rows. It
  does *not* delete the Supabase Auth login itself (email/password) — that needs a service-role
  operation this pure-client app deliberately doesn't have; the Privacy Policy is explicit that
  this currently requires contacting the developer.
- **Friends** (`supabase/migrations/0002_friends.sql`, `src/supabase/friends.ts`,
  `src/components/friends-panel.tsx`): a separate, symmetric relationship from coach/team — an
  athlete sends a friend request by email (`add_friend_by_email` RPC), either side can accept
  a pending request, and the grant is deliberately much narrower than a coach's: friends can see
  each other's logged `results` and basic `profiles` row (email + gender, needed to compute a
  ЕВСК rank), never the training-plan data (`athlete_profiles`/`completions`/`stroke_log`) a
  linked coach can see. `src/i18n/format.ts`'s `friendResultProgressText` reuses the same
  world-record/ЕВСК-rank comparison the individual "Records & goals" section uses, so a friend's
  logged result shows the same kind of "next goal" line.

**Bluetooth heart rate — implemented but dormant**: `src/bluetooth/` (platform-split
`ble-engine.native.ts`/`.web.ts` on `react-native-ble-plx`, standard BLE Heart Rate Service),
`src/state/heart-rate-context.tsx`, and `src/components/heart-rate-section.tsx` exist and are
verified to typecheck/lint/build, but are deliberately **not** wired into `_layout.tsx`/
`index.tsx`, and `app.json` has no `react-native-ble-plx` plugin entry — kept code-only rather
than shipped as a visible feature. See docs/supabase-architecture.md's "Bluetooth heart rate
(dormant)" section for the physical caveat that shaped its design (Bluetooth doesn't propagate
through water, so this is only ever useful for checking pulse at the wall, not mid-swim), what
exists, and exactly what re-wiring it involves.

**Sharing**: each day's `Collapsible` on the Plan tab has a "Share" action
(`src/utils/share.ts`'s `shareOrCopy`) that opens the native share sheet on iOS/Android
(`Share.share` from `react-native`) so an athlete can send a session to a coach or training
partner via any installed app; react-native-web has no `Share` implementation, so on web (and
if the native share sheet errors/is unavailable) it falls back to a clipboard copy instead. The
shared text itself is built by `src/i18n/format.ts`'s `formatDayShareText`, reusing the same
`formatSetStep`/`formatGymBlock` formatters the Plan screen renders with, so it's already
localized and unit-aware.

**Screens** (`src/app/`, expo-router, two tabs):
- `index.tsx` — "Plan" tab. Empty state with a CTA into onboarding if no profile is saved yet;
  otherwise a week summary plus one `Collapsible` (`src/components/ui/collapsible.tsx`) per day
  showing warmup/main/cooldown sets and/or the gym session for that day, a per-session
  "mark done" toggle, a "History" `Collapsible` summarizing completed weeks, a "Progress"
  `Collapsible` (stroke-count log + records/goals), and — only when signed in —
  `AthleteCoachPanel` (pending coach invites, and once on a team: coach-authored workouts,
  results, and both chat threads).
- `profile.tsx` — "Profile" tab/onboarding form (language, level, goal, units/pool length,
  session counts/durations, equipment, pace benchmark, gender, strokes/distances, backup, an
  `AccountSection` for optional cloud sign-in/out, `CoachDashboard` when signed in as a coach,
  and an inline translated privacy policy `Collapsible`). Deliberately mounts its form
  (`ProfileForm`) only after
  `usePlan().isReady`, so the form's `useState` initializer can seed itself from the loaded
  profile directly — avoiding a `setState`-in-`useEffect` (flagged by `eslint-config-expo`'s
  `react-hooks/set-state-in-effect` rule) to sync it after the fact. The `LanguageProvider` and
  `HistoryProvider` above don't need this trick since they seed from a *default* (`'en'`, `{}`)
  that's valid on its own, not from a value that only makes sense once loaded.

Routing has exactly two top-level routes and intentionally does **not** use a nested
stack/detail route for individual sessions, or a route for the privacy policy — day detail and
the privacy policy are both shown inline via `Collapsible` accordions instead, to avoid fighting
the template's dual native/web tab-bar setup (see below).

## Template quirks worth knowing before touching navigation

This was scaffolded from the current `create-expo-app` default template (Expo SDK 57, React
Native 0.86, React 19, New Architecture, React Compiler on), which renders tabs differently per
platform:
- `src/components/app-tabs.tsx` — native (iOS/Android): `expo-router/unstable-native-tabs`,
  each tab backed by a real PNG icon under `src/assets/images/tabIcons/`.
- `src/components/app-tabs.web.tsx` — web: `expo-router/ui`'s `Tabs`, a custom-styled pill bar.

Both are wired off the same route filenames (`index`, `profile`) and must be kept in sync by
hand — there's no single source of truth for the tab list. Adding a third tab means editing
both files (and adding an icon asset for the native one).

`AGENTS.md` (imported above) is the template's own reminder that Expo SDK 57 is very new;
when the exact behavior of an Expo/router/RN API here matters, check
https://docs.expo.dev/versions/v57.0.0/ rather than assuming older-SDK docs apply.

## Icon/splash/branding assets

`assets/images/{icon,favicon,splash-icon,android-icon-*}.png` are all generated by
`scripts/generate-icons.js` (a `sharp`-based script, `sharp` is a devDependency only for this)
from hand-coded SVG in that same file — a swimmer glyph plus wave strokes on a blue gradient.
To restyle the app icon, edit the SVG-building functions in that script and re-run it rather
than hand-editing PNGs; there's a `wideWaves` variant for full-bleed hero art (icon.png/
favicon.png) and a `compactWaves`/safe-zone-sized variant for the Android adaptive-icon layers
and the splash logomark, since those get cropped to a circle/squircle by the OS. The template's
own iOS 26 "Liquid Glass" icon format (`assets/expo.icon/`, `ios.icon` in app.json) was dropped
in favor of the plain `icon.png` on all platforms, to avoid hand-authoring that newer bundle
format blind. `src/components/animated-icon.tsx`'s `AnimatedSplashOverlay` (rendered from
`_layout.tsx` on every native launch) shows `splash-icon.png`; keep it in sync if the splash
asset's shape changes.

## Store submission (EAS)

`eas.json` has `development`/`preview`/`production` build profiles, and `app.json`'s
`ios.bundleIdentifier`/`android.package` are set to a placeholder (`com.swimplanner.app`) —
see the "Publishing" section in `README.md` for the full account-setup and build/submit steps,
none of which can be done from here since they need the user's own Apple/Google/Expo
credentials. `docs/privacy-policy.html` (standalone, bilingual) and `docs/store-listing.md`
(draft App Store/Play copy in English and Russian, plus `docs/screenshots/`) exist so those are
ready to go once there's a build to submit; both are referenced from README's Publishing
section.

**GitHub Pages deploy**: `.github/workflows/deploy-pages.yml` builds the web export and
publishes it to GitHub Pages on every push to `main` (and on manual dispatch), bundling
`docs/privacy-policy.html` alongside it — this is also the practical way to get real Auth/RLS
testing against a configured Supabase project: this sandbox's outbound network is policy-blocked
for arbitrary hosts (confirmed for `*.supabase.co` specifically — a 403 at the proxy, not an app
bug), so a real Supabase round-trip has to happen from an actual browser outside this sandbox,
and a deployed Pages URL is the simplest way to get one. `EXPO_PUBLIC_SUPABASE_URL`/
`EXPO_PUBLIC_SUPABASE_ANON_KEY` are read from repository *variables* (not secrets — see
`docs/supabase-architecture.md`'s note on the anon key) at build time, since Expo inlines
`EXPO_PUBLIC_*` vars into the bundle rather than reading them at runtime; without them set the
deployed build just runs in local-only mode, same as any build with no `.env`.

## Runtime verification in this sandbox

This sandbox has no iOS Simulator, no Android emulator, and no physical device (no `xcrun`,
`adb`, or `emulator` on `PATH`) — so native runtime behavior (real `NativeTabs`, safe-area
insets on an actual notch, the native splash transition) cannot be verified here, only read for
correctness. What *can* be, and should be after any UI change: `npx expo export --platform web`
as a bundling smoke test, and driving `npx expo start --web` with Playwright
(`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`, `args: ['--no-sandbox']`
— see the environment's Playwright note) to click through real flows — onboarding, language
switching, marking a session done, backup/restore — and check for thrown console/page errors.
That covers all the shared React logic (everything except the two `app-tabs.*` files' actual
native chrome) since screens don't otherwise branch on platform. Prefer this over trusting
`tsc`/`eslint` alone for anything state- or navigation-related.
