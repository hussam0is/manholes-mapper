# API Error Handling Audit Report

**Date:** 2026-03-01
**Auditor:** CodeSmith (Claude Opus 4.6)
**Scope:** All 12 API route handlers in `api/` + 5 library files in `api/_lib/`

---

## Executive Summary

The API codebase has a solid foundation: parameterized SQL queries (no SQL injection), `sanitizeErrorMessage()` for production error masking, UUID validation on most routes, and rate limiting on all endpoints. However, the audit identified **14 concrete issues** across consistency, input validation, auth coverage, and edge case handling.

**Severity breakdown:** 3 High, 6 Medium, 5 Low

---

## Findings

### 1. [HIGH] Missing rate limiting on `/api/auth/*` handler

**File:** `api/auth/index.js`
**Issue:** The auth handler does not call `applyRateLimit()`. Auth endpoints (login, signup) are the most critical to rate-limit to prevent brute-force attacks. The `MAX_REQUESTS_AUTH = 20` constant exists but is never used.
**Fix:** Add `applyRateLimit(req, res, MAX_REQUESTS_AUTH)` to the auth handler.

### 2. [HIGH] `parseBody()` does not validate Content-Type header

**File:** `api/_lib/auth.js`
**Issue:** POST/PUT routes accept any Content-Type. A request with `Content-Type: text/plain` or missing Content-Type would reach `request.json()` which may throw an opaque error, or the Node.js stream parser would attempt to JSON.parse non-JSON data. No route validates Content-Type before calling `parseBody()`.
**Fix:** Add Content-Type validation in `parseBody()` to reject non-JSON bodies with a clear 415 (Unsupported Media Type) error.

### 3. [HIGH] `parseBody()` swallows invalid JSON with unhelpful error

**File:** `api/_lib/auth.js`
**Issue:** When `request.json()` fails (Web API path) or `JSON.parse(data)` fails (Node.js stream path), the error bubbles up as a generic SyntaxError. Callers catch this in their outer try/catch and return 500 instead of 400. Invalid JSON payloads should return 400 with a clear message.
**Fix:** Wrap JSON parse in `parseBody()` with a try/catch that throws a marked error with `status = 400`.

### 4. [MEDIUM] Inconsistent error format for `parseBody` failures

**File:** Multiple route handlers
**Issue:** When `parseBody()` throws (e.g., oversized payload, invalid JSON), the error falls into the outer catch block and returns `{ error: sanitizeErrorMessage(error) }` with status 500. The 413 status from oversized payloads is lost because it's set on the Error object but never read by the catch handler.
**Fix:** In each route handler's catch block, check `error.status` and use it when available.

### 5. [MEDIUM] `/api/organizations` POST missing name length validation

**File:** `api/organizations/index.js`
**Issue:** The POST handler checks `!name || !name.trim()` but does not enforce `MAX_NAME_LENGTH`. The `validateOrganizationInput()` function in validators.js does check length, but it is never called here.
**Fix:** Use `validateOrganizationInput()` for name validation in both index.js and [id].js.

### 6. [MEDIUM] `/api/projects` POST missing name length validation

**File:** `api/projects/index.js`
**Issue:** Project name validation only checks `!name || !name.trim()` but does not enforce max length. Similarly, `/api/projects/[id]` PUT only checks `!name.trim()`.
**Fix:** Add name length validation to project POST and PUT handlers.

### 7. [MEDIUM] `/api/layers` POST missing layerType/name length validation

**File:** `api/layers/index.js`
**Issue:** Layer creation validates presence of `name`, `layerType`, `geojson` but does not validate:
- `name` max length
- `layerType` against allowed values
- `geojson` structure (at minimum, must be an object)
**Fix:** Add validation for name length, layerType whitelist, and basic geojson structure check.

### 8. [MEDIUM] `/api/users/[id]` PUT does not validate organizationId UUID format

**File:** `api/users/[id].js`
**Issue:** When a super_admin sets `organizationId` on a user, the UUID format is not validated. The `validateUserUpdateInput()` function exists in validators.js but is never called.
**Fix:** Use `validateUserUpdateInput()` for body validation.

### 9. [MEDIUM] `/api/projects/[id]` POST duplicate does not validate `name` length

**File:** `api/projects/[id].js`
**Issue:** When duplicating a project, `body.name` is used directly without length validation. A malicious client could supply an extremely long name.
**Fix:** Add name length check for the duplicate action.

### 10. [LOW] Auth handler does not restrict HTTP methods

**File:** `api/auth/index.js`
**Issue:** Better Auth internally handles method routing, but the handler accepts any HTTP method (e.g., DELETE, PATCH) and forwards them to Better Auth. Not a security risk per se, but inconsistent with other handlers that return 405.
**Status:** Acceptable -- Better Auth handles this internally.

### 11. [LOW] Layers collection GET does not validate `projectId` UUID format

**File:** `api/layers/index.js`
**Issue:** `req.query.projectId` is passed directly to `getProjectById()` without UUID validation. The parameterized query protects against injection, but a malformed ID would cause an unnecessary DB round-trip.
**Fix:** Add `validateUUID(projectId)` check.

### 12. [LOW] `sanitizeErrorMessage` called inconsistently

**File:** Multiple routes
**Issue:** Most routes correctly use `sanitizeErrorMessage(error)` in their catch blocks, but `api/auth/index.js` hardcodes `'Internal server error'` instead. Minor inconsistency.
**Fix:** Use `sanitizeErrorMessage()` in auth handler too for consistency.

### 13. [LOW] CORS `resolveOrigin()` reflects any origin when `ALLOWED_ORIGINS` is not set

**File:** `api/_lib/cors.js`
**Issue:** When `ALLOWED_ORIGINS` env var is not set (dev mode), the function returns the request's Origin header verbatim. This is acceptable for development but could be risky if deployed without `ALLOWED_ORIGINS`. The env var is set on Vercel, so production is protected.
**Status:** Acceptable for dev. Document the requirement to set `ALLOWED_ORIGINS` in production.

### 14. [LOW] Error status from `parseBody` 413 not propagated

**File:** `api/_lib/auth.js`
**Issue:** `parseBody()` sets `error.status = 413` on the Error object for oversized payloads, but no route handler reads this property. The 413 gets swallowed into a 500.
**Fix:** Route catch blocks should check `error.status` and use it.

---

## What's Already Good

1. **SQL injection prevention:** All queries use `@vercel/postgres` tagged template literals (`sql\`...\``) with parameterized values (`${var}`). Zero string concatenation in SQL.
2. **Auth coverage:** Every route (except `/api/auth/*` which IS the auth handler) calls `verifyAuth()` and returns 401 on failure.
3. **UUID validation:** All `[id]` routes validate UUID format before DB queries.
4. **Error masking:** `sanitizeErrorMessage()` hides internal errors in production.
5. **Rate limiting:** Applied to all routes (except auth, which is now fixed).
6. **CORS:** Properly configured with credential support and origin validation.
7. **Pagination bounds:** All list endpoints clamp `limit` and `offset` to safe ranges.
8. **RBAC:** Role checks are thorough -- super_admin, admin, user scoping is correct.
9. **Optimistic locking:** Sketch updates support `clientUpdatedAt` for conflict detection.
10. **Lock system:** Sketch locks with 30-min expiry and force-unlock for admins.

---

## Changes Made

### `api/_lib/auth.js`
- Added Content-Type validation in `parseBody()` -- rejects non-JSON with 415
- Added try/catch around JSON parsing with 400 status for invalid JSON
- Both errors are marked with `.status` for proper propagation

### `api/_lib/error-handler.js` (NEW)
- Created shared `handleApiError()` utility that reads `error.status` and returns the appropriate HTTP status code (400, 413, 415, 503, or 500)
- Used by all route handlers for consistent error response formatting

### `api/auth/index.js`
- Added `applyRateLimit(req, res, MAX_REQUESTS_AUTH)` for brute-force protection
- Uses `sanitizeErrorMessage()` for consistency

### `api/organizations/index.js`
- POST: Uses `validateOrganizationInput()` for name validation (includes length check)

### `api/organizations/[id].js`
- PUT: Uses `validateOrganizationInput()` for name validation

### `api/projects/index.js`
- POST: Added name length validation (MAX_NAME_LENGTH = 200)

### `api/projects/[id].js`
- PUT: Added name length validation
- POST duplicate: Added name length validation

### `api/layers/index.js`
- GET collection: Added `validateUUID(projectId)` check
- POST: Added name length validation, layerType whitelist, geojson object check

### `api/users/[id].js`
- PUT: Added `validateUserUpdateInput()` for body validation

### All route handlers
- Updated catch blocks to use `handleApiError(error, res, routeLabel)` for consistent error propagation (reads `error.status` for 400/413/415/503)
