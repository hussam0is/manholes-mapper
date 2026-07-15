---
name: vercel-promote
description: Verify that a push to dev deployed to production on Vercel for the manholes-mapper project (since the 2026-07-15 account move, dev IS the production branch — no promote step exists anymore). Run this EVERY time a commit is pushed to the dev branch, and whenever the user says "promote", "deploy to production", "ship it", "release", "push to prod", "make it live", or asks why production is behind dev.
---

# Verify dev → production deployment on Vercel

Project: `manholes-mapper` on team **`gis-6579s-projects`** (moved from `hussam0is-projects`
on 2026-07-15 after the GitHub repo transferred to `geopoint-ltd`).
Production: https://manholes-mapper-three.vercel.app
**The production branch IS `dev`** — every push to `dev` auto-builds a production deployment.
There is no promote step anymore; this skill now verifies the auto-deploy succeeded.

## Step 0 — Preconditions

1. Working tree committed and pushed to `dev` (`git status` clean). Record the pushed SHA:
   `git rev-parse HEAD`.
2. **Service-worker check.** If the pushed commits touched non-fingerprinted files
   (`frontend/public/service-worker.js`, `frontend/styles.css`) without bumping `APP_VERSION`
   at the top of `frontend/public/service-worker.js`, bump it now, commit, push, and continue
   with that new SHA — otherwise phones keep serving stale cached files indefinitely.

## Step 1 — Tooling

Use the Vercel REST API with the token from the Windows **User-scope env var `VERCEL_API_KEY`**
(scoped to `gis-6579s-projects`; a session launched before the var was set won't have it —
read it via `[Environment]::GetEnvironmentVariable('VERCEL_API_KEY','User')` in PowerShell).
The CLI also works: every command needs `--scope gis-6579s-projects --token <token>`
(the CLI's cookie login is still the old `hussam0is` account — always pass the token).

**Never run `vercel link` or `vercel env pull` against the repo directory** — they overwrite
`.env.local` and the local-only keys in it exist nowhere else (old-DB credentials included).

## Step 2 — Wait for the production build to be Ready

```
npx vercel ls manholes-mapper --scope gis-6579s-projects --token <token>
```

Take the newest **Production** deployment and confirm (via `npx vercel inspect <url> ...` or
`GET https://api.vercel.com/v13/deployments/<id>?slug=gis-6579s-projects`) that its git SHA
matches step 0. Poll every ~30 s (builds typically take ~1 min; give up after ~10 min and report).

- State `Ready` → continue.
- State `Error` → fetch logs (`npx vercel inspect <url> --logs ...`), report the build
  failure, and stop. Production keeps serving the previous deployment on a failed build.

## Step 3 — Verify

1. `curl -s -o /dev/null -w "%{http_code}" https://manholes-mapper-three.vercel.app/api/health`
   → expect `200`.
2. Allow ~1 min for CDN cache invalidation before testing on phones/TSC5.

## Step 4 — Report

Tell the user: the deployed SHA + commit subject, that production
(https://manholes-mapper-three.vercel.app) now serves it, and whether `APP_VERSION` was bumped.

## Rollback

`npx vercel rollback --scope gis-6579s-projects --token <token>` returns production to the
previous deployment instantly.

## History

Until 2026-07-15 the project lived on `hussam0is-projects`, where `dev` only built previews and
each push required an explicit `vercel promote`. That account's production
(https://manholes-mapper.vercel.app) still serves the last pre-transfer build and the OLD
database — field devices with the installed APK/PWA keep hitting it until they migrate to the
new URL.
