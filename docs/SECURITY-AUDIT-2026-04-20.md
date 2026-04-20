# Security Audit — Manholes Mapper (Public Repo)

**Date:** 2026-04-20
**Repo:** https://github.com/hussam0is/manholes-mapper (public)
**Branch audited:** `dev` (HEAD `99943ea`)
**Scope:** Git history, dependencies, API surface, frontend, CI/CD, secret handling

---

## TL;DR

The repo is **not compromised** — no live credentials are currently leaked, no malicious code was found in any branch, and the codebase reflects a prior security audit (March 2026) whose fixes are still in place. However, three kinds of issues remain:

- **1 HIGH** — git history still contains an old Neon Postgres password (already rotated, so not exploitable, but should be scrubbed for cleanliness).
- **3 HIGH** — npm dependencies have known CVEs with fixes available (`vite`, `@xmldom/xmldom`, `defu`).
- **Several MEDIUM/LOW** — hardening opportunities in CORS, auth rate limiting, and route-level authorization.

---

## CRITICAL
_None._

---

## HIGH

### H1 — Rotated credential still in public git history
- **Where:** commits `051f1c4e`, `c0c11eb2`, `72bba215`, `1f7426a3` (and several branches, including `remotes/origin/master`, `remotes/origin/dev`)
- **What:** A Neon Postgres connection string with password `npg_Y5Pbts4zrZBc` (user `neondb_owner`, host `ep-polished-wave-aiccisto-pooler.c-4.us-east-1.aws.neon.tech`) was committed in the file `update-vercel-env.sh`. It was removed from the working tree on 2026-03-22 by commit `1f7426a3` ("security(C2): remove update-vercel-env.sh from git tracking"), but remains fully visible in git history.
- **Status:** **Rotated.** The current `.env.local` uses a different password (`npg_SCQA8fmVd2Gr`), confirming the old credential was cycled. Impact today: none.
- **Recommendation (low urgency):** If you want to scrub history, use `git filter-repo --invert-paths --path update-vercel-env.sh` (or BFG Repo-Cleaner), force-push all branches, and ask GitHub support to purge cached forks/PRs. Otherwise, leave as-is — the secret is dead.

### H2 — npm high-severity vulnerabilities (fixes available)
`npm audit` reports three high-severity advisories in currently-installed deps:

| Package | CVE / Advisory | Impact | Fix |
|---|---|---|---|
| `vite` 7.1.3 → <=7.3.1 | GHSA-p9ff-h696-f583 (arbitrary file read via dev-server WS), GHSA-v2wj-q39q-566r (`server.fs.deny` bypass), GHSA-4w7w-66w2-5vf9 (path traversal in `.map`) | Dev-only exposure (Vite dev server reads files from project root); not a production risk since `dist/` is pre-built and served statically | `npm i -D vite@latest` |
| `@xmldom/xmldom` <0.8.12 | GHSA-wh4c-j3r5-mjhp (XML injection via unsafe CDATA serialization) | Transitive — likely pulled in by a build tool; verify user input never reaches it | `npm audit fix` |
| `defu` <=6.1.4 | GHSA-737v-mqg7-c878 (prototype pollution via `__proto__` in defaults) | Transitive; your own code already has `hasPrototypePollutionKeys()` guards on admin config | `npm audit fix` |

**Recommendation:** Run `npm audit fix` and re-run the test suite. For the Vite bump, test dev workflow after.

### H3 — Auth routes bypass the shared CORS helper
- **Where:** `api/auth/index.js` sets `Access-Control-Allow-Origin` directly from `req.headers.origin || req.headers.referer || '*'` instead of calling `handleCors()` from `api/_lib/cors.js`. Combined with `Access-Control-Allow-Credentials: true`, any browser origin can initiate authenticated requests to `/api/auth/*` (sign-in, sign-up, session).
- **Impact:** Login/signup responses can be read cross-origin by any site an authenticated user visits. Practical exploitation requires the victim to already have a session cookie, but this makes CSRF and credential-leak scenarios easier.
- **Recommendation:** Route `/api/auth/*` through `handleCors()` like every other endpoint, or mirror its allow-list logic.

### H4 — CORS allows any origin with credentials when `ALLOWED_ORIGINS` is unset
- **Where:** `api/_lib/cors.js:20` (`if (!envOrigins) return null; // dev mode — allow any`) + `:64` (`Access-Control-Allow-Credentials: true`).
- **Impact:** In any deployed environment where `ALLOWED_ORIGINS` is not set, the API reflects the request `Origin` and grants credentials. `lib/auth.js` auto-derives safe trusted origins from `VERCEL_URL`, but `cors.js` does not — so a missing env var on Vercel would be silently insecure.
- **Recommendation:** In `getAllowedOrigins()`, hard-fail (or auto-derive from `VERCEL_URL` like `lib/auth.js` does) whenever `process.env.VERCEL_ENV` is `'production'` or `'preview'`. Never return `null` in a deployed env.

---

## MEDIUM

### M1 — Rate limiter not applied to `/api/auth/*`
`api/_lib/rate-limit.js` exports a stricter `MAX_REQUESTS_AUTH = 20`, but `api/auth/index.js` never calls `applyRateLimit()`. Brute-forcing sign-in is limited only by the default 100/min/IP limit (and Vercel infra). Wrap the Better Auth handler with `applyRateLimit(req, res, MAX_REQUESTS_AUTH)`.

### M2 — In-memory rate limiter is per-instance
Acknowledged in the module header. `checkDbRateLimit()` exists but is not used on sensitive endpoints. Consider switching auth endpoints to the DB-backed variant (or rely on infra-level WAF/Vercel limits and document that decision).

### M3 — `GET /api/organizations` not restricted to super_admin
The POST path correctly gates org creation on `isSuperAdmin`, but the list endpoint returns all orgs to any admin. In a multi-tenant model, an org-level admin can see peers. Restrict listing to super_admin, or scope the result to the caller's org.

### M4 — `SameSite=None` session cookies
Required by the Capacitor cross-origin architecture (documented), but it does mean CSRF protection depends entirely on CORS + the JSON-only API contract. Keep `api/_lib/csrf.js` in use for state-changing endpoints and confirm it's wired into every mutating handler.

### M5 — No email verification
`emailAndPassword.requireEmailVerification: false` in `lib/auth.js`. Acceptable for a field-ops internal app but worth documenting. For a public-signup flow it would be a real risk.

---

## LOW / ADVISORY

- **L1** `api/health.js` exposes `VERCEL_REGION`. Minor infra fingerprinting.
- **L2** `frontend/src/capacitor-api-proxy.js` hardcodes the production API origin. Not a security bug; just worth making env-configurable for staging tests.
- **L3** `lib/auth.js` falls back to `'dev-secret-change-in-production'` if `BETTER_AUTH_SECRET` is unset AND no deployed-env markers are present. The guard (`throw` when `VERCEL_ENV`/`VERCEL_URL`/`NODE_ENV==='production'`) is correct — but a local developer running `vercel dev` without the env var will succeed with the stub secret. Harmless locally; document it in the README.
- **L4** `script-src 'self'` in CSP is good; `style-src 'unsafe-inline'` is acceptable for Tailwind. No further CSP tightening needed.
- **L5** `.env.local` is correctly gitignored and has never been committed (verified via `git log --all --full-history -- .env.local`).
- **L6** `docker-compose.test.yml`, `install.cmd`, `quick-test.cjs`, and `test-factory.cjs` were read — no credentials, no dangerous shell calls that accept user input.

---

## PASS — Verified clean

- **No current secrets in the tree.** Scanned for `sk-*`, `ghp_*`, `AKIA*`, `eyJ*` (JWTs), `npg_*`, and `postgres://user:pass@`. Matches are all in docs, tests, or local-only `.claude/settings.local.json` (which is gitignored).
- **No malicious code** in any branch I inspected (including the many `claude/*`, `cursor/*`, `worktree-agent-*` branches — these are agent worktrees, not injected backdoors).
- **SQL injection:** All DB access uses `@vercel/postgres` tagged templates (`sql\`...\``) — parameterized by construction.
- **XSS:** The March 2026 audit patched 13 dropdown/label injection sites; `escapeHtml()` / `_escapeHtml()` is applied consistently. No `eval`, `new Function`, `document.write`, or `dangerouslySetInnerHTML` with user input.
- **Prototype pollution:** `validators.hasPrototypePollutionKeys()` is applied to `adminConfig`. Dangerous deep-merge sinks were not found on the server side.
- **IDOR:** Sketch/project/user/org routes all check ownership (`user_id = ${userId}`) or role before returning data. Sketch locks use atomic acquisition with 30-min expiry.
- **Input validation:** UUID regex on all ID path params. Sketch size caps (10k nodes / 50k edges). 15 MB body cap with streaming enforcement. Role/feature whitelists.
- **CSP + security headers:** `vercel.json` sets strict CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking mic/camera, `Cache-Control: no-store` on `/api/*`.
- **GitHub Actions:** `deploy.yml` and `qa.yml` have no embedded secrets, no `pull_request_target` with checkout of untrusted code, and no script-injection via `github.event.*` string interpolation. Postgres test creds (`test:test`) are ephemeral per-run.
- **`.mcp.json`:** Uses `${POSTGRES_URL}` / `${VERCEL_API_KEY}` / `${CLICKUP_API_TOKEN}` interpolation — no tokens hardcoded.
- **`.gitignore`:** Properly excludes `.env*`, `update-vercel-env.sh`, `.claude/.watchdog/`, `.claude/settings.local.json.bak`, `node_modules/`, `dist/`.
- **Session management:** 7-day sessions, 5-min cookie cache, `Secure` + `SameSite=None`, HTTP-only (Better Auth default). No session data in `localStorage`.

---

## Recommended action list (in priority order)

1. Run `npm audit fix` (H2). Re-test.
2. Patch CORS: force `cors.js` to auto-derive or fail when deployed (H3, H4). Route `/api/auth/*` through the shared helper.
3. Apply `MAX_REQUESTS_AUTH` rate limit on `/api/auth/*` (M1).
4. Scope `GET /api/organizations` to super_admin (M3).
5. Optional: scrub `update-vercel-env.sh` from git history with `git filter-repo` (H1) — cosmetic only, password is already dead.
6. Document `SameSite=None` + email-verification-off choices in README (M4, M5).
