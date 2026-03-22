# Memory Leak Audit — Manholes Mapper PWA

Audited: 2026-03-01
Scope: All source modules under `src/`, `public/service-worker.js`

This PWA runs for hours in the field on low-memory Android devices.
Memory leaks cause progressive heap growth and eventual crashes.

---

## Critical Leaks Found & Fixed

### 1. IndexedDB connections never closed (`src/db.js`)

**Severity: HIGH**
Every `openDb()` call opens a new IDBDatabase connection and never closes it.
With 15 call sites (every save, load, backup, sync-queue operation), dozens of
IDB connections accumulate over a work session. Each holds native resources.

**Fix:** Cache a single DB connection and reuse it. Close stale connections on
page visibility change to prevent long-lived idle handles.

### 2. `gnssState.on('position')` listener never removed (`src/gnss/point-capture-dialog.js`)

**Severity: HIGH**
`setupEventListeners()` registers `gnssState.on('position', updatePositionDisplay)`
once during `initPointCaptureDialog()` and never removes it. The handler runs
on every GNSS position update (~1/sec) even when the dialog is hidden, doing
6 `getElementById` lookups per call.

**Fix:** Register the listener when the dialog opens, unregister when it closes.

### 3. Three.js miniature module-level geometries never disposed (`src/three-d/three-d-miniature.js`)

**Severity: MEDIUM**
`_sphereGeo` and `_smallBoxGeo` are module-level singletons created on first
miniature toggle but never disposed. They persist across 3D view open/close
cycles, leaking GPU resources.

**Fix:** Dispose shared geometries in `resetMiniatureState()`.

### 4. `gnssState` listener arrays grow unboundedly (`src/gnss/gnss-state.js`)

**Severity: MEDIUM**
`gnssState.on()` pushes callbacks to arrays but provides no guard against
duplicate registration. If the same callback is registered twice (e.g.,
`updateMyLocationBtnState` in main-entry.js if `initMyLocationUI` is ever
re-called), it runs twice per event indefinitely.

**Fix:** Deduplicate listeners by checking for existing registration before push.

### 5. `initSyncService()` registers auth listener that cannot be removed (`src/auth/sync-service.js`)

**Severity: MEDIUM**
Line 1163-1181: `window.authGuard.onAuthStateChange(...)` registers a closure
that calls `syncFromCloud()`. The returned unsubscribe function is discarded.
If `initSyncService()` is called more than once, duplicate auth listeners
accumulate. While the online/offline listeners are protected by
`AbortController`, this auth listener is not.

**Fix:** Track the unsubscribe function and call it on re-init.

### 6. Service worker update interval never cleared (`src/serviceWorker/register-sw.js`)

**Severity: LOW**
The `setInterval` for 15-minute SW update checks (line 16) runs forever with
no `clearInterval`. Since this IIFE runs once on page load and the page never
unloads during normal PWA usage, this is acceptable but noted for completeness.
The interval itself is lightweight (just `reg.update()`).

**No fix needed** — acceptable for PWA lifecycle.

### 7. `capturedPoints` array grows without bound (`src/gnss/gnss-state.js`)

**Severity: LOW**
Every `capturePoint()` call pushes to `this.capturedPoints` with no limit.
In a full work day with hundreds of captures, this array grows. The data is
small per entry (~200 bytes) so this is low severity, but a cap is good practice.

**Fix:** Cap `capturedPoints` at 1000 entries, evicting oldest.

---

## Patterns Reviewed (No Leak Found)

### 3D View cleanup (`src/three-d/three-d-view.js`)
The `cleanup()` function correctly:
- Cancels `animFrameId`
- Disposes orbit controls, FPS controls, joystick
- Disconnects ResizeObserver
- Traverses scene graph disposing all geometry and materials
- Disposes materials cache
- Disposes WebGL renderer + forces context loss
- Removes label renderer DOM
- Removes overlay from DOM
- Removes document keydown listener
- Disposes issue interaction (removes event listeners)
- Resets miniature state

### FPS Controls (`src/three-d/three-d-fps-controls.js`)
`enable()` and `disable()` are symmetric — all event listeners added in
`enable()` are removed in `disable()`. `dispose()` calls `disable()`.

### Joystick (`src/three-d/three-d-joystick.js`)
Canvas element removed on `dispose()`. No event listeners registered directly.

### Auth guard intervals (`src/auth/auth-guard.js`)
`sessionRefreshInterval` is cleared before re-assignment in `initAuthMonitor()`.
No accumulation risk.

### Sync service timers (`src/auth/sync-service.js`)
`lockRefreshTimer` properly cleared in `stopLockRefreshTimer()`.
`saveDebounceTimer` properly cleared before re-assignment.
`listenerAbortController` properly aborted before re-creation.
Online debounce timer properly cleared.

### Tile cache (`src/map/tile-manager.js`)
LRU eviction capped at 500MB with `evictOldTiles()`. Bounded growth.

### Backup manager (`src/utils/backup-manager.js`)
`backupIntervalId` cleared in `stopAutoBackup()`.
`cleanupBackupManager()` clears all state.

### Menu events (`src/menu/menu-events.js`)
Uses `Set` for listeners (no duplicates). Returns unsubscribe function.

### Auth state listeners (`src/auth/auth-guard.js`)
Uses `Set` for listeners (no duplicates). Returns unsubscribe function.

### Sync state listeners (`src/auth/sync-service.js`)
Uses `Set` for listeners (no duplicates). Returns unsubscribe function.

### Browser location adapter (`src/gnss/browser-location-adapter.js`)
`geolocation.clearWatch()` properly called in `stopBrowserLocationAdapter()`.

### DOM observers (`src/dom/dom-utils.js`, `src/main-entry.js`)
`ResizeObserver` and `MutationObserver` instances persist for the app lifetime
(observing header, body). This is intentional and does not leak since the
observed elements are never removed.

### Main entry event listeners (`src/main-entry.js`)
`userMenuAbortController` properly aborted on re-render to prevent
document-level listener accumulation.
`gnssState.on('position')` / `gnssState.on('connection')` in
`initMyLocationUI()` are called once and persist for app lifetime — correct.

---

## Summary of Fixes Applied

| # | File | Fix |
|---|------|-----|
| 1 | `src/db.js` | Cache single IDB connection, reuse across calls |
| 2 | `src/gnss/point-capture-dialog.js` | Move position listener to open/close lifecycle |
| 3 | `src/three-d/three-d-miniature.js` | Dispose shared geometries on reset |
| 4 | `src/gnss/gnss-state.js` | Deduplicate listeners, cap capturedPoints |
| 5 | `src/auth/sync-service.js` | Track and unsubscribe auth listener on re-init |
