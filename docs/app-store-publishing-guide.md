# Publishing Swim Planner to the App Store — self-contained guide

This is a complete, start-to-finish walkthrough for building and submitting this app to the
App Store **without needing Claude Code or any other assistant** — everything else in this
repo is already prepared (bundle ID, icons, `eas.json`, privacy policy, store listing copy).
What's left needs your own accounts and credentials, which nobody else can provide for you.

You'll need a **Windows or Mac computer** for this — a phone browser can do the Apple/App Store
Connect website steps, but the actual build/submit commands need a real terminal.

## What's already done for you in this repo

- `app.json`: bundle ID set to `com.swimflow.swimplanner`, all icons/splash assets generated.
- `eas.json`: build profiles ready (`development`/`preview`/`production`).
- `docs/privacy-policy.html`: bilingual privacy policy, already live at
  `https://<your-github-username>.github.io/sport/privacy-policy.html` (via the GitHub Pages
  deploy that's already wired up — see README's "Privacy policy URL" section if you need to
  re-check this).
- `docs/store-listing.md`: draft title, description, keywords, in English and Russian — copy
  straight into App Store Connect's listing fields.
- `docs/screenshots/`: reference screenshots — see the note at the bottom about why you'll
  likely want to re-take these at exact App Store resolution before final submission.

## Step 0 — Install Node.js

Node.js is the runtime the build tools (`npm`, `eas-cli`) run on.

1. Go to **nodejs.org**.
2. Download the **LTS** version for your OS, run the installer, accept all defaults.
3. Open a terminal (**Terminal** on Mac, **Command Prompt** or **PowerShell** on Windows) and
   check it worked:
   ```
   node --version
   ```
   Should print something like `v22.x.x`. If it errors "command not found", restart your
   terminal (or your computer) and try again.

## Step 1 — Get this project onto your computer

**If you have `git` installed:**
```
git clone https://github.com/pasaluckin5-cpu/sport.git
cd sport
```

**If you don't:** on the repo's GitHub page, click the green **Code** button → **Download ZIP**,
extract it anywhere, then in your terminal `cd` into the extracted folder (drag the folder onto
the terminal window on Mac to auto-fill its path).

## Step 2 — Install dependencies

```
npm install
```
Takes a minute or two the first time.

## Step 3 — Install EAS CLI and log into Expo

```
npm install -g eas-cli
eas login
```
Enter the email/password of the Expo account you already created at expo.dev.

## Step 4 — Confirm the Apple side is ready

Before building, make sure all three of these are true (covered in earlier setup — revisit if
any aren't done yet):

1. **developer.apple.com/account** shows your Apple Developer Program membership as **Active**
   (not pending, no errors). If you hit "Unable to find a team with the given Team ID" — that's
   an Apple-side account issue, not something fixable here; contact Apple Developer Support at
   **developer.apple.com/contact** and quote the exact error until it's resolved. Nothing below
   will work until this shows Active.
2. The bundle ID **`com.swimflow.swimplanner`** is registered under **Certificates, Identifiers
   & Profiles → Identifiers** in your Apple Developer account.
3. An app record exists in **App Store Connect → My Apps** using that same bundle ID (created
   via **+ → New App**).

## Step 5 — Link this project to your Expo account

```
eas build:configure
```
Pick **iOS** when asked. This writes a `projectId` into `app.json` tied to your Expo account —
if you want to keep this change for later, commit it (`git add app.json && git commit -m
"Add EAS project id"`).

## Step 6 — Build

```
eas build --platform ios --profile production
```

The first time, EAS needs a way to manage your Apple signing credentials. **Recommended: use an
App Store Connect API Key instead of your Apple ID password** — safer, and works non-interactively:

1. App Store Connect → **Users and Access → Integrations → App Store Connect API** → generate a
   key with the **App Manager** role.
2. Download the `.p8` file **immediately** (Apple only lets you download it once) and note the
   **Key ID** and **Issuer ID** shown on that page.
3. When `eas build` asks how to authenticate with Apple, choose the API Key option and give it
   those three pieces of information.

The build runs on Expo's own servers (their free tier includes a limited number of builds per
month) and takes roughly 10–20 minutes — `eas` prints a URL where you can watch progress live.

## Step 7 — Submit to App Store Connect

```
eas submit --platform ios
```
It'll offer the build you just made — confirm, and it uploads the binary straight into the app
record from Step 4. This step also needs the same Apple credentials as the build step.

## Step 8 — Fill in the store listing

Back in App Store Connect, open your app's page and fill in:

- **Description / keywords / promotional text** — copy from `docs/store-listing.md` (both an
  English and a Russian version are there — App Store Connect lets you add both as separate
  localizations).
- **Privacy Policy URL** — `https://<your-github-username>.github.io/sport/privacy-policy.html`.
- **Screenshots** — see the note below; the ones in `docs/screenshots/` may not match Apple's
  required exact pixel dimensions.
- **App Privacy (data collection) questionnaire** — answer based on what this app actually
  collects: email address (only if the user creates an optional account), and self-declared
  health-adjacent data (injuries/conditions — optional, local-only unless the user explicitly
  opts into sharing with a coach). See `docs/supabase-architecture.md` for the exact schema if
  you need precise wording.
- **Age rating questionnaire** — answer honestly; this app has no objectionable content and no
  public user-generated content (coach/friend sharing is opt-in and private between the parties
  involved, not visible to other users).

## Step 9 — Submit for review

Once the build is attached and every required listing field is filled in, App Store Connect
will let you click **Add for Review** / **Submit for Review**. Apple typically reviews a first
submission within 24–48 hours; you'll get an email either way (approved, or with specific
rejection reasons you can act on and resubmit).

## About screenshots

`app.json` has `ios.supportsTablet: true`, so Apple may ask for iPad screenshots too unless you
explicitly mark the app as iPhone-only in App Store Connect. The images already in
`docs/screenshots/` were taken for internal drafting and likely aren't at Apple's exact required
resolution (currently 1290×2796 for the largest iPhone size, at time of writing — check App
Store Connect's screenshot uploader, it tells you the exact sizes it wants). Easiest way to get
real ones: after Step 6's build finishes, install it via TestFlight on an actual device (or the
iOS Simulator on a Mac) and take screenshots directly there.

## Troubleshooting

- **"Unable to find a team with the given Team ID..."** — Apple-side account provisioning
  issue. Contact developer.apple.com/contact, quote the exact error text. Nothing on the code
  side can fix this.
- **`eas build` fails** — it always prints a link to the full build log; the most common causes
  are a missing/misconfigured credential (re-run `eas credentials` to check) or a real compile
  error (would show up in `npx tsc --noEmit`/`npm run lint` locally first).
- **App Store Connect doesn't show your bundle ID when creating a new app** — you likely skipped
  Step 4.2 (registering the Identifier) or it hasn't finished propagating yet; wait a few
  minutes and refresh.
