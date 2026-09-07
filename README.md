# Swim Planner

An Expo (React Native + web) app that generates a personalized weekly training plan for
swimmers — or, if you don't swim, a standalone gym/fitness plan.

It takes into account:
- Your level and main goal (fitness, endurance, speed, technique)
- How many pool sessions per week you want, and how long each one is — set this to **0** and
  the app switches entirely to a gym/fitness-only plan for people who just go to the gym
- Optional strength/gym sessions per week. If you swim, these are swim-specific dryland
  exercises — shoulder-health/rotator-cuff work, pulling strength, explosive starts-and-turns
  power, kick-range mobility, rotational core control — each one labeled with what it's actually
  for, and coordinated with pool days so a heavy leg day doesn't land right before a hard
  kick/sprint swim. If you don't swim, it's a standard general-fitness split instead.
- Meters or yards, and your pool length (25 or 50) — every set is a whole number of pool lengths
- The equipment you actually own (fins, paddles, pull buoy, kickboard, snorkel, parachute,
  tempo trainer, ankle band) — sets only call for gear you have
- Optionally, a recent time trial (e.g. 400m), so main-set paces are targeted to you instead
  of a rough estimate by level
- Optionally, your main competitive stroke(s) and race distance(s) — the plan interleaves that
  stroke into your sessions with real, stroke-specific technique drills, and biases main-set rep
  length/rest toward sprint- or distance-style training depending on your race distance, with a
  short "coach note" on the Plan tab explaining the focus

The plan varies from week to week (zone order, stroke emphasis, and gym focus rotate on a
weekly cycle) instead of being the exact same week forever, and you can mark sessions done and
see a history of completed weeks. Right after marking a session done you can log how it felt
(easy/moderate/hard/too hard) and flag any pain — the plan learns from your *entire* logged
history (an exponential moving average, not just a flat average of the last few sessions), backs
off overall volume after a sustained hard/too-hard trend, eases off a *specific* zone you've
consistently found too tough (e.g. always struggles with sprint sets) rather than cutting
everywhere, and eases volume back further if your completion rate has been low lately. Any
flagged shoulder pain immediately drops paddles and swaps upper-body gym work for mobility.
Optionally set a goal race date and the plan periodizes toward it — base, build, peak, then a
taper in the final week — instead of staying flat every week; once the race is close, a
"Race day plan" section gives you a pre-race warmup, a pacing strategy with target splits (from
your time trial pace), and race tactics for your distance and stroke. A "Progress" section lets
you log stroke counts over a distance (a low-tech SWOLF-style efficiency tracker) and, if you set
a gender and a freestyle time trial, compares your time against current world records and
Russian ЕВСК classification standards, with a concrete next-rank goal to chase. The UI is
available in English and Russian, switchable in the Profile tab.

**Can't swim at all yet?** The separate "Learn" tab is a self-paced learn-to-swim program —
water comfort, floating, gliding, kicking, arm stroke, breathing, then putting it all together —
independent of the main training profile. Pick how many minutes you can practice per day: the
program has a fixed amount of content, so more time per day finishes it in fewer days rather
than cramming in more material, down to a two-week floor (skills need repeated days to actually
stick, not just total minutes). Progress is a simple day-by-day checklist, stored on-device only.

The app is local-first: your profile is saved on-device and the week's plan is generated from
it, no account or server required. You can always copy your profile as text (Profile → Backup &
restore) and paste it back in on a new device.

**Optional cloud accounts & coaching (Supabase).** Profile → Account lets you create an account
to sync your profile/history/stroke log across devices, and unlocks a coach/team feature: a
coach creates a team, invites athletes by email, and can then see their profile/history/results,
assign structured workouts (rendered the same way the generated plan is), and message them
one-to-one or in a team-wide group chat. There's also a lighter-weight **friends** feature on the
Plan tab — add a friend by email and, once they accept, follow their logged results with the
same world-record/classification-rank comparison your own Progress section uses; a friend only
ever sees your results and basic profile, never your training-plan settings or history the way a
coach can. All of this is entirely opt-in — the app works fully offline with no account, exactly
as above, unless you choose to sign in. See `docs/supabase-architecture.md` for the
schema/permissions design and `.env.example` for the setup needed to point the app at your own
Supabase project.

## Getting started

```
npm install
npm start
```

Then press `w` for web, or `i`/`a` for iOS/Android simulators (or scan the QR code with Expo Go).

See `CLAUDE.md` for architecture notes and other commands (lint, test, typecheck).

## Publishing to the App Store / Google Play

Builds are configured with [EAS Build](https://docs.expo.dev/build/introduction/) (`eas.json`).
This repo has everything that can be set up without your own accounts; the rest needs
credentials only you can provide:

1. **Pick real bundle identifiers.** `app.json`'s `ios.bundleIdentifier` and `android.package`
   are currently placeholders (`com.swimplanner.app`) — change them to something under a domain
   you control (reverse-DNS, e.g. `com.yourname.swimplanner`) before your first build. They
   must be globally unique and, once published, are very hard to change.
2. **Accounts you'll need:**
   - A free [Expo account](https://expo.dev/signup), to run builds via EAS.
   - An [Apple Developer Program](https://developer.apple.com/programs/) membership
     ($99/year) to submit to the App Store.
   - A [Google Play Console](https://play.google.com/console/signup) account ($25 one-time) to
     submit to Google Play.
3. **Log in and link the project** (one-time):
   ```
   npx eas-cli login
   npx eas-cli build:configure
   ```
   This adds an `extra.eas.projectId` to `app.json` tied to your Expo account.
4. **Build:**
   ```
   npx eas-cli build --platform ios --profile production
   npx eas-cli build --platform android --profile production
   ```
   The first iOS build will walk you through Apple credentials (or generate them for you); the
   first Android build generates a signing keystore that EAS stores for you.
5. **Submit:**
   ```
   npx eas-cli submit --platform ios
   npx eas-cli submit --platform android
   ```
   iOS submission needs an App Store Connect app record created first (in App Store Connect,
   or via `eas submit`'s prompts). Android submission needs a Google Play service account key
   — see [EAS's Android submission docs](https://docs.expo.dev/submit/android/).

`eas.json` also has a `development` profile (installs a dev client for local native debugging)
and a `preview` profile (an internal-distribution build you can share without going through a
store) if you want a build before you're ready to submit anywhere.

### Privacy policy URL

Both stores require a public privacy policy URL in the listing, even though this app collects
nothing. The policy text lives in two places, kept in sync by hand:
- In-app: the "Privacy policy" section at the bottom of the Profile screen (translated).
- Standalone: `docs/privacy-policy.html` (bilingual EN/RU in one static page).

To get a public URL for App Store Connect / Play Console — and a way to try the live app itself
in a real browser, including sign-up against your Supabase project, which needs real outbound
network access — `.github/workflows/deploy-pages.yml` builds the web export on every push to
`main` and publishes it to GitHub Pages:

1. **Settings → Pages → Source: GitHub Actions** (one-time, replaces the older
   "deploy from a branch" setup).
2. Optional, to test cloud accounts on the deployed site: **Settings → Secrets and variables →
   Actions → Variables** → add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   (the same values from `.env` — these aren't secrets, see `docs/supabase-architecture.md`, so
   plain repo *variables* are fine, no need for *secrets*). Without them the deployed site just
   runs in local-only mode, same as a build with no `.env`.
3. Push to `main` (or run the workflow manually from the Actions tab) — the site appears at
   `https://<your-username>.github.io/<repo>/`, and the privacy policy at
   `https://<your-username>.github.io/<repo>/privacy-policy.html`.

### Store listing copy

Draft App Store/Google Play listing copy (title, short/full description, keywords, EN + RU) is
in `docs/store-listing.md`. Screenshots aren't included in the repo (binary, and tied to a
specific build) — see that file for how to generate them.
