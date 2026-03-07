# Security Vulnerability Audit Report

**Date:** 2026-03-07
**Scope:** Full codebase review — API routes, client-side code, auth system, dependencies, configuration
**Methodology:** Static analysis of all source files, dependency audit, configuration review

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 3 | Requires immediate action |
| High | 3 | Fix before next release |
| Medium | 8 | Plan remediation |
| Low | 8 | Address when convenient |

**Positive findings:** No SQL injection (parameterized queries throughout), no `eval()`/`document.write()`, comprehensive `escapeHtml()` usage, proper security headers, CSV formula injection prevention, HTTP-only session cookies.

---

## CRITICAL Findings

### C1: Authentication Bypass in `/api/stats` Endpoint

**File:** `api/stats/index.js`, lines 21-29
**Description:** Two compounding bugs make this endpoint completely unauthenticated:

1. `applyRateLimit(req)` is called with one argument instead of `applyRateLimit(req, res)` — the rate limit check never works properly.
2. `verifyAuth(req)` returns an object `{ userId, error, user }` which is always truthy. The check `if (!session)` will never be true, so **authentication is never enforced**.

**Impact:** Any unauthenticated user can access `GET /api/stats/leaderboard` to retrieve survey precision data and usernames from all sketches across all organizations.

**Remediation:**
```js
if (applyRateLimit(req, res)) return;

const { userId, error: authError } = await verifyAuth(request);
if (authError) {
  return res.status(401).json({ error: authError });
}
```

### C2: Hardcoded Database Credentials in Git-Tracked File

**File:** `update-vercel-env.sh` (tracked in git)
**Description:** Contains plaintext Neon Postgres connection strings with username `neondb_owner`, password, and host endpoint.

**Remediation:**
1. **Rotate the database password immediately** via Neon console.
2. `git rm update-vercel-env.sh` and add to `.gitignore`.
3. Consider using BFG Repo Cleaner to purge from git history.

### C3: Hardcoded Admin Credentials in Git-Tracked Scripts

**Files (7 files):** `scripts/capture-final.mjs`, `scripts/capture-remaining.mjs`, `scripts/capture-app-state.mjs`, `scripts/capture-app-state-v2.mjs`, `scripts/capture-app-state-v3.mjs`, `scripts/design-audit-capture.mjs`, `scripts/verify-app-v105.mjs`
**Description:** All contain `{ email: 'admin@geopoint.me', password: 'Geopoint2026!' }` in plaintext.

**Remediation:**
1. Change the admin password immediately.
2. Refactor scripts to read credentials from environment variables.
3. Purge credentials from git history.

---

## HIGH Findings

### H1: Default Dev Secret Fallback in Better Auth

**File:** `lib/auth.js`, line 44
**Description:** Falls back to `'dev-secret-change-in-production'` when `BETTER_AUTH_SECRET` is not set and not in production. Vercel preview deployments may use this weak secret, enabling session cookie forgery.

**Remediation:** Require `BETTER_AUTH_SECRET` in all deployed environments (check for `VERCEL_URL` or `VERCEL_ENV`).

### H2: `trustedOrigins: ["*"]` Enables CSRF on Auth Endpoints

**File:** `lib/auth.js`, lines 61-69
**Description:** When `ALLOWED_ORIGINS` is not set, Better Auth's `trustedOrigins` defaults to `["*"]`. Combined with `sameSite: "none"` cookies (line 79), any website can make credentialed requests to auth endpoints.

**Remediation:** Default to the Vercel deployment URL rather than `*`. Require `ALLOWED_ORIGINS` in all environments.

### H3: npm Dependency Vulnerability

**Package:** `tar` (<=7.5.9) — Hardlink Path Traversal (GHSA-qffp-2rhf-9h96)
**Remediation:** Run `npm audit fix`.

---

## MEDIUM Findings

### M1: `/api/stats` Leaderboard Has No Authorization Scoping

**File:** `api/stats/index.js`, lines 46-64
**Description:** Even after fixing auth, there is no check that the user belongs to the project's organization. Any authenticated user can request leaderboard data for any project by UUID.

### M2: Any Authenticated User Can Lock Any Sketch (IDOR)

**File:** `api/sketches/index.js`, lines 346-408
**Description:** POST lock operations (`lock`, `unlock`, `refresh`) do not verify sketch ownership or organization membership. Any user can lock any sketch by ID, blocking the legitimate owner for 30 minutes.

### M3: Issue Comments Accessible Cross-Organization (IDOR)

**File:** `api/issue-comments/index.js`, lines 45-103
**Description:** Any authenticated user can read/post comments on any sketch's issue nodes without ownership or organization checks. Users can also create mention notifications targeting arbitrary user IDs.

### M4: Admin `forceUnlock` Crosses Organization Boundaries

**File:** `api/sketches/index.js`, lines 392-403
**Description:** Checks admin role but does not verify the sketch belongs to the admin's organization.

### M5: In-Memory Rate Limiting (Serverless Limitation)

**File:** `api/_lib/rate-limit.js`
**Description:** Rate limits use an in-memory `Map` that resets with each serverless cold start. The auth rate limit (20/min) intended to prevent brute-force is unreliable.

### M6: Email Verification Disabled

**File:** `lib/auth.js`, line 51
**Description:** `requireEmailVerification: false` allows account creation with any email without verification.

### M7: Reference Layer Names Rendered Without escapeHtml

**File:** `src/legacy/main.js`, lines 10974-10978
**Description:** Layer `l.name` and `l.id` from server data are injected directly into innerHTML. A compromised admin could set a layer name containing script-executing HTML.

### M8: No-op escapeHtml Fallback in project-stats-page

**File:** `src/pages/project-stats-page.js`, line 15
**Description:** `const esc = window.escapeHtml || ((s) => s)` falls back to identity function if the global is not yet loaded, then used with `err.message`.

---

## LOW Findings

### L1: `createdBy`/`lastEditedBy` Are Client-Controlled (Spoofable Identity)

**File:** `api/sketches/index.js`, lines 220-221
**Description:** These audit trail fields come from the request body, not the authenticated session.

### L2: `nodeId` in Issue-Comments Has No Format/Length Validation

**File:** `api/issue-comments/index.js`, lines 53, 71

### L3: Notification `ids` Array Not Validated as UUIDs

**File:** `api/notifications/index.js`, line 63
**Description:** Invalid UUIDs produce 500 errors instead of 400.

### L4: `inputFlowConfig`/`adminConfig` Have No Schema/Size Validation

**Files:** `api/projects/index.js`, `api/sketches/index.js`
**Description:** Arbitrary JSON up to 15MB body limit can be stored.

### L5: CSP Allows `ws:/wss:` to Any Host

**File:** `vercel.json`, line 55
**Description:** `connect-src` permits WebSocket to any origin.

### L6: Sketch Import Lacks Property-Level Sanitization

**File:** `src/utils/sketch-io.js`, line 66
**Description:** String properties in imported JSON files not sanitized before eventual innerHTML rendering.

### L7: Admin Settings Label Fallback Unescaped

**File:** `src/admin/admin-settings.js`, lines 208-212

### L8: CSP Missing `frame-ancestors` Directive

**File:** `vercel.json`, line 55
**Description:** `X-Frame-Options: DENY` is set but the modern CSP equivalent `frame-ancestors 'none'` is missing.

---

## Priority Action Plan

| Priority | Action | Effort |
|----------|--------|--------|
| 1 | Fix `/api/stats` auth bypass (C1) | 15 min |
| 2 | Rotate DB password, remove `update-vercel-env.sh` from git (C2) | 30 min |
| 3 | Change admin password, env-var-ify scripts (C3) | 30 min |
| 4 | Require `BETTER_AUTH_SECRET` in deployed envs (H1) | 10 min |
| 5 | Fix `trustedOrigins` default (H2) | 10 min |
| 6 | `npm audit fix` (H3) | 5 min |
| 7 | Add org scoping to stats, locks, comments (M1-M4) | 2-3 hrs |
| 8 | Escape layer names in main.js (M7) | 5 min |
| 9 | Fix escapeHtml fallbacks (M8) | 10 min |
