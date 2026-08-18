# Swim Planner

An Expo (React Native + web) app that generates a personalized weekly swim training plan.

It takes into account:
- Your level and main goal (fitness, endurance, speed, technique)
- How many pool sessions per week you want, and how long each one is
- Optional strength/gym sessions per week, coordinated with pool days so a heavy leg day
  doesn't land right before a hard kick/sprint swim
- The equipment you actually own (fins, paddles, pull buoy, kickboard, snorkel, parachute,
  tempo trainer, ankle band) — sets only call for gear you have

The app is local-first: your profile is saved on-device and the week's plan is generated from
it, no account or server required.

## Getting started

```
npm install
npm start
```

Then press `w` for web, or `i`/`a` for iOS/Android simulators (or scan the QR code with Expo Go).

See `CLAUDE.md` for architecture notes and other commands (lint, test, typecheck).
