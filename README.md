# Swim Planner

An Expo (React Native + web) app that generates a personalized weekly swim training plan.

It takes into account:
- Your level and main goal (fitness, endurance, speed, technique)
- How many pool sessions per week you want, and how long each one is
- Optional strength/gym sessions per week, coordinated with pool days so a heavy leg day
  doesn't land right before a hard kick/sprint swim
- The equipment you actually own (fins, paddles, pull buoy, kickboard, snorkel, parachute,
  tempo trainer, ankle band) — sets only call for gear you have
- Optionally, a recent time trial (e.g. 400m), so main-set paces are targeted to you instead
  of a rough estimate by level

The app is local-first: your profile is saved on-device and the week's plan is generated from
it, no account or server required.

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
