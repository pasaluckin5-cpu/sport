# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This repository is currently empty of code (only a placeholder `README.md`). No language, framework,
build system, or test tooling has been chosen yet. There are no build/lint/test commands to document
because none exist yet — update this file once a stack is chosen and tooling is added.

## Product intent

The goal is a mobile app (app store) that generates/plans swimming training programs. Requirements
gathered from the project owner so far:

- Generates or lays out a swim training plan, informed by professional athletes' training practices
  or other credible training sources.
- Accounts for the athlete's available equipment/inventory (e.g. fins, paddles, pull buoy, kickboard,
  snorkel) when building sets.
- Accounts for how many training sessions per week the athlete wants and each session's duration.
- Accounts for the athlete also doing separate gym/strength sessions (dry-land training) alongside
  pool sessions, so the plan should balance/coordinate with those.

When implementation begins, prefer capturing architectural decisions (chosen stack, data model for
plans/sessions/inventory, any training-plan generation logic or rules engine) here so future sessions
don't need to rediscover them from scratch.
