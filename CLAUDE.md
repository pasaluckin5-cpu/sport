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

**Weekly variation & history**: nothing about a *profile* changes week to week, but
`generateWeekPlan`'s week-key rotation (above) means the actual zone order, stroke emphasis,
and gym-focus order differ across calendar weeks even for an unchanged profile — so the plan
isn't the same static week forever, without needing to persist multiple weeks of plan data.
Completed sessions are tracked separately from the plan: `src/state/history-context.tsx`
(`HistoryProvider`/`useHistory`) persists a flat `{ "weekKey:dayIndex:kind": true }` map via
`src/storage/history-storage.ts` (`kind` is `'pool' | 'gym'`, so a double day tracks each half
independently). The Plan screen's "History" section summarizes counts per week from that same
map — there's no need to snapshot old `WeekPlan`s since the map only needs *counts*, not what
was in each session.

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
**Backup**: since there's no account/cloud sync, `profile.tsx`'s "Backup & restore" section
copies the saved `AthleteProfile` as JSON to the clipboard (`expo-clipboard`) and restores it
from pasted text via `src/domain/profileValidation.ts`'s `parseProfileBackup` — a real
validation boundary (the pasted text is untrusted external input), not a trivial `JSON.parse`.
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
  "mark done" toggle, and a "History" `Collapsible` summarizing completed weeks.
- `profile.tsx` — "Profile" tab/onboarding form (language, level, goal, units/pool length,
  session counts/durations, equipment, pace benchmark, backup, and an inline translated privacy
  policy `Collapsible`). Deliberately mounts its form (`ProfileForm`) only after
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
section, including how to get a public URL for the privacy policy via GitHub Pages.

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
