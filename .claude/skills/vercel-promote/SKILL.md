---
name: vercel-promote
description: Promote the latest dev preview deployment to production on Vercel for the manholes-mapper project. Run this EVERY time a commit is pushed to the dev branch — the project workflow requires promoting every push — and whenever the user says "promote", "deploy to production", "ship it", "release", "push to prod", "make it live", or asks why production is behind dev. Prefers Vercel MCP tools when connected; falls back to the authenticated Vercel CLI.
---

# Promote dev → production on Vercel

Project: `manholes-mapper` (projectId `prj_Nk3oHkTZXsIceR9mGlg5lg27k2Go`, team `hussam0is-projects`).
Production: https://manholes-mapper.vercel.app
Dev preview alias: https://manholes-mapper-git-dev-hussam0is-projects.vercel.app

Pushing to `dev` only builds a **preview** deployment. Production updates when that deployment
is explicitly promoted — that is what this skill does. The project rule is: **every commit pushed
to dev gets promoted**, so run this at the end of any turn that pushed to dev.

## Step 0 — Preconditions

1. Working tree committed and pushed to `dev` (`git status` clean). Record the pushed SHA:
   `git rev-parse HEAD`.
2. **Service-worker check.** If the pushed commits touched non-fingerprinted files
   (`frontend/public/service-worker.js`, `frontend/styles.css`) without bumping `APP_VERSION`
   at the top of `frontend/public/service-worker.js`, bump it now, commit, push, and continue
   with that new SHA — otherwise phones keep serving stale cached files indefinitely.

## Step 1 — Pick the tooling: MCP first, CLI fallback

The repo configures a Vercel MCP server (`vercel` in `.mcp.json`, needs `VERCEL_API_KEY`).
If its tools are connected (search deferred tools for "vercel"), use its deployment tools for
steps 2–3: list/get deployments to find the dev preview and poll its state, and a promote tool
if one exists. Exact tool names vary by server version — discover them rather than assuming.

If the MCP is not connected, or has no promote-capable tool, use the Vercel CLI — it is logged
in as `hussam0is`. Every CLI command needs `--scope hussam0is-projects`.
(As of 2026-07 the MCP does not start locally: `VERCEL_API_KEY` was wiped from `.env.local`,
so the CLI path is the working one.)

**Never run `vercel link` or `vercel env pull`** — they overwrite `.env.local` and the
local-only keys in it exist nowhere else.

## Step 2 — Wait for the dev preview build to be Ready

The preview for the pushed commit must finish building before it can be promoted.

```
npx vercel ls manholes-mapper --scope hussam0is-projects
```

Take the newest **Preview** deployment URL and confirm it was built from the pushed commit:

```
npx vercel inspect <deployment-url> --scope hussam0is-projects
```

The output includes the git commit SHA — match it against step 0. If the newest preview is
older than the push, the build hasn't been created yet; wait and re-list. Poll every ~30 s
(builds typically take 1–3 min; give up after ~10 min and report).

- State `Ready` → continue to step 3.
- State `Error` → fetch logs with `npx vercel inspect <url> --logs --scope hussam0is-projects`,
  report the build failure, and **stop — do not promote**.

## Step 3 — Promote

```
npx vercel promote <deployment-url> --scope hussam0is-projects --yes
```

This triggers a **fresh production build** — it is not an instant alias swap. Poll
`npx vercel ls manholes-mapper --scope hussam0is-projects` until the new **Production**
deployment shows `Ready` (1–3 min typical). If the production build errors, production keeps
serving the previous deployment — fetch its logs and report; do not retry blindly.

## Step 4 — Verify

1. `curl -s -o /dev/null -w "%{http_code}" https://manholes-mapper.vercel.app/api/health`
   → expect `200`.
2. Optionally `npx vercel inspect` the new production deployment and confirm its commit SHA
   matches step 0.
3. Allow ~1 min for CDN cache invalidation before testing on phones/TSC5.

## Step 5 — Report

Tell the user: the promoted SHA + commit subject, that production
(https://manholes-mapper.vercel.app) now serves it, and whether `APP_VERSION` was bumped.

## Rollback

If a promoted build misbehaves, `npx vercel rollback --scope hussam0is-projects` returns
production to the previous deployment instantly.
