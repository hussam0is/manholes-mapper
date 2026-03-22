# Security Audit Report -- Manholes Mapper

**Date:** 2026-03-01
**Scope:** Full-stack OWASP Top 10 audit (frontend + API)
**Status:** Vulnerabilities identified and fixed

---

## 1. Cross-Site Scripting (XSS)

### 1.1 Findings

The application uses `innerHTML` extensively (~100+ locations) to render dynamic content. A global `escapeHtml()` function exists and is used in many places, but several admin-controlled data paths were missing escaping.

**Vulnerabilities found and fixed:**

| File | Issue | Severity | Fix |
|------|-------|----------|-----|
| `src/admin/admin-settings.js` | Option labels from `adminConfig` rendered unescaped in defaults `<option>` tags (line 249) | MEDIUM | Added `_escapeHtml()` to option value and label |
| `src/admin/admin-settings.js` | Default value in text input `value` attribute unescaped (line 260) | MEDIUM | Wrapped `current` with `_escapeHtml()` |
| `src/admin/input-flow-settings.js` | Trigger value options rendered without escaping `o.label` and `o.code` (line 515) | MEDIUM | Added `_escapeHtml()` to all option attributes and text |
| `src/admin/input-flow-settings.js` | Text input `currentValue` injected unescaped into `value` attribute (line 519) | MEDIUM | Wrapped with `_escapeHtml()` |
| `src/admin/input-flow-settings.js` | Rule card name, trigger labels, and action summary unescaped (line 316) | MEDIUM | All user-derived text now escaped |
| `src/admin/input-flow-settings.js` | Action dropdowns: field labels, action type labels, option codes/labels unescaped | MEDIUM | All `<option>` tags now use `_escapeHtml()` |
| `src/legacy/main.js` | Node material options from `adminConfig` unescaped (line 5285) | MEDIUM | Added `escapeHtml()` to value and label |
| `src/legacy/main.js` | Node access, accuracy, maintenance status option labels unescaped | MEDIUM | All `<option>` tags now escaped |
| `src/legacy/main.js` | Edge type, material, engineering status, fall position option labels unescaped | MEDIUM | All `<option>` tags now escaped |
| `src/legacy/main.js` | Connected edge panel: same option labels unescaped (lines 5461-5472) | MEDIUM | All escaped |
| `src/legacy/main.js` | Dangling edge `tailLabel` unescaped in innerHTML (line 7970) | LOW | Added `escapeHtml()` |
| `src/project/sketch-side-panel.js` | `displayName` (sketch name) unescaped in list and issues views | MEDIUM | Added `esc()` helper using `window.escapeHtml` |
| `src/project/sketch-side-panel.js` | Issue `nodeLabel` and `typeText` unescaped in issue rows | LOW | Wrapped with `esc()` |

**Already properly escaped (no action needed):**
- `src/main-entry.js` -- user menu (name, email, image, role) all use `escapeHtml()`
- `src/legacy/main.js` -- sketch list items (id, title, createdBy, modifiedBy, ownerDisplay) all use `escapeHtml()`
- `src/legacy/main.js` -- project dropdown (`escapeHtml(p.id)`, `escapeHtml(p.name)`)
- `src/legacy/main.js` -- node detail panel (`escapeHtml(node.id)`, `escapeHtml(node.note)`)
- `src/legacy/main.js` -- edge detail panel (`escapeHtml(edge.tail)`, `escapeHtml(edge.head)`)
- `src/admin/admin-panel.js` -- all user/org names use `_escapeHtml()`
- `src/admin/admin-settings.js` -- option card labels/codes use `_escapeHtml()`
- `src/admin/projects-settings.js` -- project names/descriptions use `_escapeHtml()`
- `src/three-d/three-d-issues.js` -- uses its own `esc()` wrapper
- No `insertAdjacentHTML`, `outerHTML`, or `document.write` usage found

### 1.2 Attack Vector

An admin user could craft malicious option labels (e.g., `<img onerror=alert(1)>`) in admin settings, which would execute as HTML in other users' browsers when rendering dropdowns. Now all admin-configurable text is escaped before DOM insertion.

---

## 2. SQL Injection

### Finding: PASS -- No vulnerabilities

All database queries use `@vercel/postgres` tagged template literals (`sql\`...\``), which automatically parameterize all interpolated values. No string concatenation is used for query construction.

Example: `sql\`SELECT ... WHERE id = ${sketchId} AND user_id = ${userId}\``

This prevents SQL injection by design.

---

## 3. Authentication Bypass

### Finding: PASS -- No vulnerabilities

- Every API route calls `verifyAuth(request)` before processing
- Auth check returns `401` if session is invalid
- The `/api/auth/*` route delegates entirely to Better Auth's handler
- `getOrCreateUser()` is called after auth to map Better Auth sessions to app users
- No routes skip authentication

---

## 4. CSRF Protection

### Finding: PASS -- Acceptable for architecture

- **Cookie settings:** `sameSite: "none"`, `secure: true` (required for cross-origin Capacitor app)
- `SameSite=None` is necessary because the Android Capacitor app runs on `https://localhost` and sends requests to the production API
- Better Auth session tokens use cookie-based auth with 7-day expiry
- CORS is configured with specific `ALLOWED_ORIGINS` in production (not `*`)
- Capacitor origin `https://localhost` is always allowed

**Note:** `SameSite=None` means CSRF is theoretically possible, but the risk is mitigated by:
1. CORS origin checking prevents unauthorized cross-origin requests from browsers
2. The API only accepts JSON (`Content-Type: application/json`), which cannot be sent via HTML forms
3. All state-changing operations require authenticated sessions

---

## 5. Insecure Direct Object References (IDOR)

### Finding: PASS -- Proper authorization

- **Sketches:** Regular users can only access their own sketches (`WHERE user_id = ${userId}`). Admins can access org sketches. Super admins can access all.
- **Projects:** Non-super-admins can only access projects in their own organization (`project.organization_id !== currentUser.organization_id`)
- **Organizations:** Only admin/super_admin can list/modify orgs
- **Users:** Org admins can only manage users in their org. Super admins can manage all.
- **Features:** Org admins can only manage features for users in their org
- **Layers:** Access scoped to organization via project ownership check
- **Sketch locks:** Only the lock holder can update; only admins can force-unlock

---

## 6. Rate Limiting

### Finding: PASS -- Implemented with known limitation

- Rate limiter at `api/_lib/rate-limit.js`: 100 requests/minute per IP (default), 20/minute for auth
- Uses sliding window algorithm with 60-second window
- IP extracted from `x-forwarded-for` header (Vercel provides this)
- Periodic cleanup prevents memory leaks (5-minute interval)
- Applied on every API route via `applyRateLimit(req, res)`

**Known limitation:** In-memory rate limiter per serverless instance. Under high traffic with many cold starts, different instances have separate counters. For stricter enforcement, consider Vercel Edge Config or Redis. This is acceptable for the current traffic profile.

---

## 7. Input Validation

### 7.1 Finding: PASS -- Comprehensive validation

**API-level validation (`api/_lib/validators.js`):**
- UUID format validation on all path parameters (sketch ID, project ID, org ID, user ID, layer ID, feature target ID)
- Sketch input validation: node/edge structure, max 10,000 nodes / 50,000 edges, name max 200 chars, string max 1,000 chars
- Role validation: whitelist of `['user', 'admin', 'super_admin']`
- Feature key validation: whitelist of known feature keys
- Organization name: required, non-empty, max 200 chars

**Request body size limit:** 15MB max enforced via `Content-Length` header check and streaming size check in `parseBody()`

### 7.2 Vulnerability found and fixed

| File | Issue | Severity | Fix |
|------|-------|----------|-----|
| `api/layers/index.js` | `projectId` from query parameter not validated with `validateUUID()` in GET handler | LOW | Added UUID validation (already parameterized in SQL, so injection risk was nil, but defense in depth) |

---

## 8. Sensitive Data Exposure

### Finding: PASS -- Properly managed

- **Environment variables:** `.env.local` is in `.gitignore`, not committed
- **Error messages:** `sanitizeErrorMessage()` returns generic messages in production, detailed messages only in development
- **API responses:** No password hashes, internal IDs, or secrets exposed. User data is role-filtered.
- **Console logging:** Debug logs use `console.debug()` (suppressed in production). No secrets logged.
- **Session management:** 7-day expiry, 24-hour refresh interval, 5-minute cookie cache

### Advisory: Dev secret fallback

`lib/auth.js` falls back to `'dev-secret-change-in-production'` when `BETTER_AUTH_SECRET` is not set and not in production. This is guarded by an environment check (`VERCEL_ENV === 'production'` throws), so the fallback only applies in local development. This is acceptable but should be documented.

---

## 9. Content Security Policy (CSP)

### Finding: PASS -- Properly configured

**CSP from `vercel.json`:**
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: https://*.arcgisonline.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org;
connect-src 'self' ws: wss: https://*.arcgisonline.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org;
worker-src 'self';
manifest-src 'self'
```

**Additional security headers:**
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (clickjacking prevention)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(self), microphone=(), camera=()`
- API routes: `Cache-Control: no-store, max-age=0`

**Note:** `style-src 'unsafe-inline'` is required for Tailwind CSS runtime styles. This is a common trade-off.

---

## 10. Client-Side Storage Security

### Finding: ACCEPTABLE -- No high-sensitivity data

**localStorage stores:**
- Sketch data (nodes, edges, admin config) -- functional data, not secrets
- Language preference, UI settings (autosave, size scale, auto size)
- Sketch library cache (list of sketch metadata)
- Coordinate scale, view stretch factors

**IndexedDB stores:**
- Sketch backups, sync queue, current sketch data

**No secrets in client storage.** Session tokens are in HTTP-only cookies managed by Better Auth. No passwords, API keys, or auth tokens are stored in localStorage/IndexedDB.

---

## 11. Additional Security Controls (Already in Place)

| Control | Status | Notes |
|---------|--------|-------|
| Formula injection in CSV export | PASS | `csvQuote()` in `src/utils/csv.js` prefixes `=+\-@\t\r` with `'` |
| XSS prevention utility | PASS | `escapeHtml()` replaces `& < > " '` with HTML entities |
| CORS | PASS | `ALLOWED_ORIGINS` env var in production; Capacitor origin always allowed |
| UUID validation | PASS | Regex validation on all route path params |
| Parameterized queries | PASS | All SQL uses `@vercel/postgres` tagged templates |
| Error sanitization | PASS | Generic errors in production via `sanitizeErrorMessage()` |
| Body size limits | PASS | 15MB max with streaming enforcement |
| Optimistic locking | PASS | `clientUpdatedAt` version check prevents lost updates |
| Sketch locking | PASS | 30-minute lock expiry with atomic acquisition |

---

## Summary

| Category | Status | Fixes Applied |
|----------|--------|---------------|
| 1. XSS | FIXED | 13 locations across 4 files |
| 2. SQL Injection | PASS | None needed |
| 3. Auth Bypass | PASS | None needed |
| 4. CSRF | PASS | Architecture-appropriate |
| 5. IDOR | PASS | None needed |
| 6. Rate Limiting | PASS | Known serverless limitation |
| 7. Input Validation | FIXED | 1 missing UUID check |
| 8. Sensitive Data | PASS | None needed |
| 9. CSP Headers | PASS | None needed |
| 10. Client Storage | PASS | None needed |

**Total vulnerabilities fixed:** 14 XSS injection points + 1 missing input validation
