# Vercel + Better Auth: Body Parser Issue

> **Date:** 2026-03-24  
> **Status:** Resolved  
> **Affected:** All POST routes under `/api/auth/*`

---

## Problem

- Better Auth's `toNodeHandler` expects to read the raw HTTP body stream from the Node.js `req` object
- Vercel serverless functions **pre-parse** the request body by default, consuming the stream before the handler runs
- This causes `toNodeHandler` to receive an empty/consumed stream and throw **"Invalid JSON"** on any POST request (sign-in, sign-up)
- GET requests (like `get-session`) work fine since they have no body to parse

## Root Cause

- Vercel's Node.js serverless runtime automatically parses JSON bodies **before** the handler runs
- The stream is consumed — when Better Auth tries to `req.on('data', ...)` it gets nothing
- This is invisible in local dev (where body parsing may work differently) and **only manifests on Vercel**

## Fix

```js
export const config = {
  runtime: 'nodejs',
  api: {
    // ⚠️ REQUIRED: Better Auth's toNodeHandler reads the raw body stream.
    // Vercel's default body parser consumes the stream before the handler runs,
    // causing "Invalid JSON" errors on all POST requests.
    // Do NOT remove this without understanding the consequences.
    bodyParser: false,
  },
};
```

## How to Prevent Regression

1. Any auth route using `toNodeHandler` from Better Auth **MUST** have `bodyParser: false`
2. Add a comment in the config explaining **WHY** (see fix above)
3. If someone restructures or merges the auth handler, verify the config is preserved
4. Add a smoke test to CI: `POST /api/auth/sign-up/email` should **NOT** return 500

## Debugging Timeline

| Step | Result |
|------|--------|
| `GET /api/auth/get-session` | → 200 null ✅ (no body, so no parser issue) |
| `POST /api/auth/sign-in/email` | → 500 "Invalid JSON" ❌ (body consumed by Vercel parser) |
| Attempted fix: dynamic imports | Didn't help — error was body-related, not import-related |
| Attempted fix: Web API handler (`auth.handler`) | Crashed due to Node.js compat issues |
| Attempted fix: Re-serialize `req.body` as Readable stream | Error persisted — `req.body` was undefined, stream was simply empty |
| **Final fix: `bodyParser: false`** | ✅ Tells Vercel to skip pre-parsing; `toNodeHandler` reads the raw stream successfully |

## Key Takeaway

When using **ANY** Node.js HTTP handler library (Better Auth, Express middleware, tRPC, etc.) that reads the raw request body stream on Vercel, you **MUST** set `api.bodyParser = false` in the function config.

This is a common gotcha [documented in Vercel's docs](https://vercel.com/docs/functions/runtimes/node-js#advanced-usage) but easy to miss — especially because:

- It only affects **POST/PUT/PATCH** (requests with bodies)
- **GET** requests work fine, giving a false sense that the handler is correctly wired
- Local dev servers often handle body parsing differently, so the bug is **invisible until deployed**
