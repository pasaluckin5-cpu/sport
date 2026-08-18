# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Swim Planner: an Expo (React Native + web) app that generates a personalized weekly swim
training plan from an athlete's profile — level, goal, how many pool sessions per week and
their duration, optional gym/strength sessions, whatever pool equipment they own (fins,
paddles, pull buoy, kickboard, snorkel, parachute, tempo trainer, ankle band), and optionally a
recent time-trial result used to target real paces. Everything is local-first: there is no
backend, no auth, no network calls. A profile is saved to `AsyncStorage` and the week's plan is
derived from it on the fly.

## Commands

```
npm start            # expo start — dev server, press w/i/a to open a platform
npm run web           # expo start --web
npm run ios / android # expo start --ios / --android
npm run lint           # eslint . (flat config in eslint.config.js, eslint-config-expo/flat)
npm test               # vitest run — domain logic only, see below
npx vitest run src/domain/planGenerator.test.ts -t "some test name"   # single test
npx tsc --noEmit                        # typecheck
npx expo export --platform web          # production web bundle sanity check; output in dist/ (gitignored)
node scripts/generate-icons.js          # regenerate icon.png/favicon/splash/adaptive-icon layers from SVG
```

`expo lint`'s own auto-setup and `expo install`'s version-compatibility check both call out to
a metadata service that this sandbox's proxy blocks ("HTTP Proxy Network Error: Forbidden").
That's why ESLint is configured manually here (`eslint.config.js`) instead of via `expo lint`'s
first-run wizard, and why new Expo-managed packages should be added with plain `npm install`
rather than `npx expo install` in this environment.

`expo-env.d.ts` is gitignored and auto-generated (normally on first `expo start`); if it's
missing and `tsc` complains about `*.css`/`*.module.css` imports, recreate it with a single
line: `/// <reference types="expo/types" />`.

## Architecture

**The whole product is one pure function.** `src/domain/planGenerator.ts` exports
`generateWeekPlan(profile: AthleteProfile): WeekPlan`. Given a profile it deterministically
builds a 7-day plan — no randomness, no I/O. This is what's actually under test
(`planGenerator.test.ts`, run by `vitest`, independent of React Native/Jest entirely since the
whole `src/domain` layer has zero RN imports).

The domain layer is split by concern:
- `types.ts` — the shared vocabulary (`AthleteProfile`, `Zone`, `SetStep`, `PoolSession`,
  `GymSession`, `DayPlan`, `WeekPlan`). A `DayPlan` has independent optional `pool` and `gym`
  fields (not a discriminated union), so a day can be a swim day, a gym day, both (a double
  day), or a rest day.
- `workoutLibrary.ts` — the training "knowledge base": per-`Zone` main-set builders
  (technique/aerobicBase/threshold/vo2max/sprint/recovery), warmup/cooldown builders, and gym
  exercise blocks per `GymFocus`. This encodes generic, widely-known competitive-swim coaching
  structure (warmup/main/cooldown volume split, zone-appropriate rep distances and rest,
  equipment substitution) — not any specific proprietary program.
- `planGenerator.ts` — the scheduling logic on top of the library:
  - `sessionVolumeM` turns a session duration into a target distance via a per-level pace
    table (`PACE_M_PER_HOUR`).
  - `POOL_DAY_PATTERNS` maps "N sessions/week" → which weekdays (0=Mon..6=Sun) get a pool
    session, spread as evenly as the count allows.
  - `ZONE_ROTATION_BY_GOAL` is a curated, goal-specific sequence of zones (fitness / endurance
    / speed / technique each order hard and easy zones differently); the first N entries are
    used for N sessions/week, so the ordering is what keeps hard zones from clustering.
  - Gym-day placement prefers days with no pool session first, and downgrades a `lowerBody`
    gym day to `core` when the next day is a hard swim zone (threshold/vo2max/sprint), so leg
    fatigue doesn't undercut the next day's kick/pull power.
  - Equipment only shows up in a set's `equipment` field (and a session's `equipmentUsed`) when
    the athlete actually owns it — the generator must produce a fully valid plan for an athlete
    with zero equipment.
  - `AthleteProfile.benchmark` (optional `{ distanceM, timeSec }` time trial) overrides the
    level-based volume estimate: `estimateMPerHour` derives session volume from the athlete's
    actual pace instead of `PACE_M_PER_HOUR`, and `ZONE_PACE_FACTOR` derives a target per-100m
    pace for aerobicBase/threshold/vo2max main sets (appended to the set label, e.g. `@ 1:40`).
    Technique/recovery/sprint stay effort-based and are never paced. A benchmark with
    `timeSec: 0` is treated as unset (the Profile screen strips it before saving) rather than
    dividing out a nonsense pace.

**State/persistence**: `src/state/plan-context.tsx` (`PlanProvider`/`usePlan`) is the only
stateful piece — it loads/saves an `AthleteProfile` via `src/storage/profile-storage.ts`
(a thin `AsyncStorage` wrapper) and re-derives `weekPlan` with `useMemo` whenever the profile
changes. There is no separate persisted "plan" — it's always freshly generated from the
profile, so profile and plan can never drift out of sync.

**Screens** (`src/app/`, expo-router, two tabs):
- `index.tsx` — "Plan" tab. Empty state with a CTA into onboarding if no profile is saved yet;
  otherwise a week summary plus one `Collapsible` (`src/components/ui/collapsible.tsx`) per day
  showing warmup/main/cooldown sets and/or the gym session for that day.
- `profile.tsx` — "Profile" tab/onboarding form (level, goal, session counts/durations,
  equipment). Deliberately mounts its form (`ProfileForm`) only after `usePlan().isReady`, so
  the form's `useState` initializer can seed itself from the loaded profile directly — avoiding
  a `setState`-in-`useEffect` (flagged by `eslint-config-expo`'s `react-hooks/set-state-in-effect`
  rule) to sync it after the fact.

Routing has exactly two top-level routes and intentionally does **not** use a nested
stack/detail route for individual sessions — day detail is shown inline via `Collapsible`
accordions instead, to avoid fighting the template's dual native/web tab-bar setup (see below).

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
credentials.
