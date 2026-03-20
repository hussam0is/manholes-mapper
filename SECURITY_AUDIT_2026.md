# Security Audit Report — Manholes Mapper (dev branch)
**Date:** 2026-03-20  
**Auditor:** GeoClaw (automated deep review)  
**Scope:** Full codebase — API routes, auth, frontend, infrastructure, dependencies

---

## Executive Summary

The codebase is **reasonably well-secured** for a production app. It uses parameterized SQL queries (no raw string interpolation), has CSRF protection, rate limiting, input validation, role-based access control, and a solid CSP header. However, there are several **medium and high severity issues** that should be addressed.

**Critical: 0 | High: 5 | Medium: 8 | Low: 5**

---

## 🔴 HIGH Severity

### H1. Health Endpoint Leaks Partial Database Connection String
**Location:** `api/health.js:18`  
**Description:** The health endpoint exposes the first 20 characters of `POSTGRES_URL`, which typically contains the protocol, username, and partial hostname of the database.
```js
POSTGRES_URL: process.env.POSTGRES_URL ? 'SET (' + process.env.POSTGRES_URL.substring(0, 20) + '...)' : 'MISSING',
```
**Impact:** An attacker can learn the database provider, username prefix, and hostname structure. Combined with other recon, this aids targeted attacks.  
**Fix:** Replace with a simple boolean check:
```js
POSTGRES_URL: process.env.POSTGRES_URL ? 'SET' : 'MISSING',
```

### H2. Health Endpoint Has No Authentication
**Location:** `api/health.js`  
**Description:** The `/api/health` endpoint is completely unauthenticated and returns detailed configuration info including environment variables status, auth module internals (trustedOrigins), and database connectivity.  
**Impact:** Any anonymous user can probe the deployment configuration.  
**Fix:** Either add auth check, restrict to internal/admin only, or strip all sensitive details and return only a simple `{ status: "ok" }`.

### H3. Notification IDs Not Validated Before SQL Query
**Location:** `api/notifications/index.js:56-58`  
**Description:** The `POST /api/notifications` endpoint accepts an `ids` array and passes it directly to `markNotificationsRead()` which uses `ANY(${notificationIds}::uuid[])`. While Postgres will reject non-UUID values, there's no application-level validation of the array contents.
```js
if (Array.isArray(body.ids) && body.ids.length > 0) {
  const count = await markNotificationsRead(userId, body.ids);
```
**Impact:** Without length limits, an attacker could send thousands of IDs causing expensive DB operations. Malformed IDs would cause unhandled DB errors.  
**Fix:** Validate each ID as UUID and cap array length:
```js
if (Array.isArray(body.ids)) {
  if (body.ids.length > 200) return res.status(400).json({ error: 'Too many IDs (max 200)' });
  for (const id of body.ids) {
    if (!validateUUID(id)) return res.status(400).json({ error: 'Invalid notification ID format' });
  }
  const count = await markNotificationsRead(userId, body.ids);
}
```

### H4. XSS via Unescaped Data Attributes in Notification HTML
**Location:** `src/notifications/notification-bell.js:137`  
**Description:** `sketch_id` and `node_id` from the server are injected into HTML data attributes without escaping:
```js
<div class="notification-item" data-sketch-id="${n.sketch_id}" data-node-id="${n.node_id}">
```
While `sketch_id` is a UUID (safe), `node_id` is a user-controlled TEXT field. If a node ID contains `"` characters, it breaks out of the attribute and allows attribute injection or XSS.  
**Impact:** An attacker who can create a node with a crafted ID could execute JavaScript in other users' browsers when they view notifications.  
**Fix:** Escape the values:
```js
<div class="notification-item" data-sketch-id="${escapeHtmlLocal(n.sketch_id)}" data-node-id="${escapeHtmlLocal(n.node_id)}">
```

### H5. Dependency Vulnerabilities (4 high severity)
**Location:** `package.json` (transitive dependencies)  
**Description:**
- **flatted ≤3.4.1** — Prototype pollution via `parse()` + DoS via unbounded recursion
- **kysely ≤0.28.13** — SQL injection in MySQL mode (lower risk since you use Postgres, but still a concern)
- **tar ≤7.5.10** — Symlink path traversal
- **undici 7.0.0–7.23.0** — Multiple HTTP smuggling, CRLF injection, memory exhaustion, WebSocket DoS  
**Impact:** Undici is particularly concerning as it's the HTTP client used by Node.js fetch. An attacker could exploit the smuggling/injection issues.  
**Fix:** `npm audit fix` — all have fixes available.

---

## 🟡 MEDIUM Severity

### M1. Rate Limiting Is In-Memory Only (Serverless Bypass)
**Location:** `api/_lib/rate-limit.js`  
**Description:** Rate limiting uses an in-memory `Map` per serverless instance. On Vercel, each cold start gets a fresh Map. An attacker can bypass rate limits by distributing requests across instances.  
**Note:** The code comments acknowledge this. A `rate_limit_log` DB table exists in the schema but is never queried for enforcement.  
**Impact:** Brute-force login attempts, API abuse, and DoS are not effectively rate-limited.  
**Fix:** Implement the DB-backed rate limiting using the existing `rate_limit_log` table, or use Vercel's built-in WAF/rate limiting, or add a Redis-backed solution (Upstash).

### M2. CORS Allows Any Origin in Dev Mode
**Location:** `api/_lib/cors.js:14-16`  
**Description:** When `ALLOWED_ORIGINS` is not set, the CORS handler reflects any `Origin` header:
```js
if (!allowedOrigins) {
  return requestOrigin || '*';
}
```
**Impact:** If `ALLOWED_ORIGINS` isn't set in production (misconfiguration), any website can make credentialed cross-origin requests.  
**Fix:** Default to restrictive origins even in dev. Add a check: if `VERCEL_ENV === 'production'` and `ALLOWED_ORIGINS` is empty, deny or use a safe default.

### M3. Better Auth trustedOrigins Uses Wildcard Patterns
**Location:** `lib/auth.js:64-66`  
**Description:** The trusted origins include wildcard patterns:
```js
origins.push('https://manholes-mapper-git-*-hussam0is-projects.vercel.app');
origins.push('https://manholes-mapper-*-hussam0is-projects.vercel.app');
```
**Impact:** If Better Auth's wildcard matching is overly permissive, an attacker who creates a similarly-named Vercel project could have their origin trusted. This is low probability but the attack surface exists.  
**Fix:** Use explicit origin lists or verify Better Auth's glob implementation handles this securely. Consider listing only known preview URLs.

### M4. `getOrCreateUser` Can Overwrite User ID via Email Match
**Location:** `api/_lib/db.js` (`getOrCreateUser` function)  
**Description:** If a user exists by email but with a different ID, the function updates the ID:
```js
if (result.rows[0].id !== userId) {
  await sql`UPDATE users SET id = ${userId}, updated_at = NOW() WHERE email = ${email}`;
}
```
**Impact:** If an attacker can create an auth session with the same email as an existing user (e.g., through a registration without email verification), they could hijack that user's account by overwriting their user ID. This would transfer all role/organization assignments to the attacker.  
**Fix:** Remove the ID overwrite. If IDs don't match, treat as an error or log it for investigation rather than silently updating.

### M5. No Maximum Body Size for GeoJSON Layer Upload
**Location:** `api/layers/index.js` (POST handler)  
**Description:** While `parseBody` has a 15MB global limit, GeoJSON layers can contain huge geometries. There's no specific size validation on the `geojson` field.  
**Impact:** An admin user could upload extremely large GeoJSON payloads that consume excessive database storage and slow down queries.  
**Fix:** Add a size check: `JSON.stringify(geojson).length < MAX_GEOJSON_SIZE` (e.g., 5MB).

### M6. Sketch PUT Doesn't Verify User Owns the Sketch (for non-owners)
**Location:** `api/sketches/index.js` (handleSingleSketch, PUT method)  
**Description:** The PUT handler checks lock status but the `updateSketch` DB function only verifies `user_id = ${userId}`. This means admin/super_admin users who can GET a sketch via `getSketchByIdAdmin` cannot actually update it (which is correct), but the error message is misleading ("Sketch not found" instead of "Access denied").  
**Note:** This is more of a logic gap than a vulnerability — admin users may expect to be able to edit sketches they can view.  
**Impact:** Confusing UX for admins; no direct security breach.

### M7. CSRF Cookie Uses `SameSite=None`
**Location:** `api/_lib/csrf.js:62`  
**Description:** The CSRF cookie is set with `SameSite=None; Secure`:
```js
return `csrf_token=${token}; Path=/; Secure; SameSite=None; Max-Age=604800`;
```
**Impact:** `SameSite=None` is required for the Capacitor native app (cross-origin), but it means the CSRF cookie is sent with all cross-origin requests. The double-submit pattern still provides protection, but the cookie itself is more exposed than with `SameSite=Strict`.  
**Fix:** Consider using `SameSite=Lax` as default and only `None` when the Capacitor origin is detected.

### M8. `update-vercel-env.sh` in Repo (Gitignored but Template Exists)
**Location:** `update-vercel-env.sh` (in repo root)  
**Description:** This file is listed in `.gitignore` but actually exists in the repo (6372 bytes). It likely contains logic to update Vercel environment variables and may reference credential patterns.  
**Impact:** If the gitignore rule isn't working or was added after the file was committed, it could contain or reference sensitive values.  
**Fix:** Verify it's not tracked: `git ls-files update-vercel-env.sh`. If tracked, remove with `git rm --cached`.

---

## 🟢 LOW Severity

### L1. Duplicate Code in `api/_lib/db.js`
**Location:** `api/_lib/db.js`  
**Description:** The entire file content appears to be duplicated (the same functions are defined twice). This is 1000+ lines of redundant code. While not a security vulnerability, it increases maintenance risk and could lead to divergent behavior if one copy is updated but not the other.  
**Fix:** Remove the duplicate block.

### L2. No Pagination Limit on Issue Comments
**Location:** `api/_lib/db.js` (`getIssueComments`)  
**Description:** Default limit is 100, but no maximum is enforced in the route handler. A user could request `?limit=999999`.  
**Fix:** Cap the limit in the handler similar to other endpoints.

### L3. Console Debug Logging in Production
**Location:** Multiple API routes  
**Description:** Routes use `console.debug()` and `console.warn()` with detailed request information that could end up in Vercel's log stream. While not directly exploitable, verbose logging increases the risk of sensitive data appearing in logs.  
**Fix:** Use a logging library with level control, or gate debug logs behind `NODE_ENV !== 'production'`.

### L4. `escapeHtml` Duplicated Across 8+ Files
**Location:** Multiple `src/` files  
**Description:** The `escapeHtml` function is copy-pasted across at least 8 different source files with slight variations. This increases the risk that one version has a bug or that a new file uses innerHTML without importing any escape function.  
**Fix:** Extract to a shared utility (e.g., `src/utils/escape.js`) and import everywhere.

### L5. Service Worker Cache Could Serve Stale Auth Pages
**Location:** Implied by PWA architecture  
**Description:** The service worker caches assets for offline use. If a user's session expires, cached pages may still render the authenticated UI until the next network request fails.  
**Impact:** Minimal — API calls will still fail with 401, but UI may briefly appear functional.

---

## ✅ What's Done Well

1. **Parameterized SQL** — All queries use `@vercel/postgres` tagged template literals (no string interpolation). **No SQL injection vectors found.**
2. **CSRF Protection** — Double-submit cookie pattern on all mutating endpoints.
3. **Input Validation** — Dedicated validators for UUIDs, roles, feature keys, sketch data, with prototype pollution checks.
4. **Role-Based Access Control** — Consistent 3-tier model (user → admin → super_admin) with organization scoping.
5. **Content Security Policy** — Strong CSP headers blocking inline scripts, restricting connect/img sources, denying frame-ancestors.
6. **Security Headers** — HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy all configured.
7. **Optimistic Locking** — Version-based conflict detection prevents lost updates.
8. **Error Sanitization** — Production errors are sanitized to prevent info leakage (except the health endpoint).
9. **Body Size Limits** — 15MB cap with streaming size check.
10. **Auth Secret Enforcement** — Throws in deployed environments if `BETTER_AUTH_SECRET` is missing.

---

## Recommended Priority

1. **Immediate:** H1 (health endpoint leak), H2 (health auth), H5 (npm audit fix)
2. **This Sprint:** H3 (notification IDs), H4 (notification XSS), M4 (user ID overwrite)
3. **Next Sprint:** M1 (rate limiting), M2 (CORS), M7 (CSRF SameSite)
4. **Backlog:** M3, M5, M6, L1-L5
