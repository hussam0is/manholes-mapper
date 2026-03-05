---
name: Sketch Sync Testing
overview: Create a comprehensive test suite covering API integration, sync service unit tests, and end-to-end browser tests for sketch synchronization, including CRUD operations, offline handling, authentication, validation, and conflict resolution.
todos: []
---

# Comprehensive Sketch Sync Testing Plan

## Architecture Overview

The sync system has three layers to test:

```mermaid
flowchart TB
    subgraph frontend [Frontend]
        SyncService[sync-service.js]
        IndexedDB[db.js - IndexedDB]
        LegacyMain[main.js]
    end
    
    subgraph api [API Layer]
        SketchesIndex[/api/sketches]
        SketchesId[/api/sketches/id]
        Auth[auth.js]
        Validators[validators.js]
    end
    
    subgraph database [Database]
        Postgres[(PostgreSQL)]
    end
    
    LegacyMain --> SyncService
    SyncService --> IndexedDB
    SyncService --> SketchesIndex
    SyncService --> SketchesId
    SketchesIndex --> Auth
    SketchesId --> Auth
    SketchesIndex --> Validators
    SketchesId --> Validators
    SketchesIndex --> Postgres
    SketchesId --> Postgres
```

---

## 1. Extend API Integration Tests

Expand [tests/api/sketches.test.ts](tests/api/sketches.test.ts) with full CRUD and error handling:

### Tests to Add

**Create Sketch (POST /api/sketches)**

- Create sketch with valid data (nodes, edges, adminConfig)
- Create sketch with null/empty name
- Reject invalid node structure (missing x/y, missing id)
- Reject invalid edges (no tail or head)
- Reject oversized payloads (>10000 nodes, >50000 edges)

**Update Sketch (PUT /api/sketches/[id])**

- Update name only
- Update nodes/edges
- Update adminConfig
- Update non-existent sketch returns 404
- Invalid UUID format returns 400
- Partial updates preserve existing data

**Delete Sketch (DELETE /api/sketches/[id])**

- Delete existing sketch
- Delete non-existent sketch returns 404
- Delete validates UUID format

**Authentication**

- Requests without token return 401
- Requests with invalid token return 401
- User can only access their own sketches

---

## 2. Create Sync Service Unit Tests

New file: `tests/sync-service.test.ts`

Mock API calls and IndexedDB to test sync logic in isolation:

### Online Sync Tests

- `syncFromCloud()` fetches and caches sketches in IndexedDB
- `syncFromCloud()` updates legacy localStorage
- `syncFromCloud()` removes locally-cached sketches deleted from cloud
- `syncSketchToCloud()` creates new sketch when no UUID
- `syncSketchToCloud()` updates existing sketch with UUID format ID

### Offline Queue Tests

- `syncSketchToCloud()` queues operation when offline
- `processSyncQueue()` processes UPDATE operations when online
- `processSyncQueue()` processes DELETE operations when online
- `processSyncQueue()` re-queues failed operations
- Concurrent sync calls are prevented (lock mechanism)

### Debounce Tests

- `debouncedSyncToCloud()` delays API calls by 2000ms
- Rapid calls reset the debounce timer
- Only final state is synced

### Error Handling

- API unavailable marks `apiAvailable = false`
- Non-JSON response detected and handled
- Network timeout handled (30s)
- 401 errors reported with clear message

---

## 3. Validation Edge Cases

New file: `tests/api/validators.test.ts`

Unit test [api/_lib/validators.js](api/_lib/validators.js):

- `validateSketchInput()` accepts valid sketches
- `validateSketchInput()` rejects non-array nodes
- `validateSketchInput()` rejects nodes without numeric x/y
- `validateSketchInput()` rejects nodes without id
- `validateSketchInput()` rejects edges without tail AND head
- `validateSketchInput()` accepts dangling edges (one of tail/head null)
- `validateSketchInput()` enforces MAX_NODES (10000) and MAX_EDGES (50000)
- `validateUUID()` accepts valid UUIDs
- `validateUUID()` rejects invalid formats

---

## 4. Conflict Resolution Tests

Add to sync service tests:

- Local sketch newer than cloud - behavior depends on strategy (currently cloud wins)
- Cloud sketch newer than local - cloud data preserved
- Same sketch edited in both places - last write wins
- Sketch deleted in cloud but edited locally - deletion takes precedence

---

## 5. End-to-End Browser Tests (Optional)

New file: `tests/e2e/sync.spec.ts` (requires Playwright setup)

```typescript
// Example test structure
test('creates sketch and syncs to cloud', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  // Create new sketch
  // Verify sync status indicator
  // Refresh page
  // Verify sketch loads from cloud
});

test('works offline and syncs when online', async ({ page, context }) => {
  await signIn(page);
  // Go offline
  await context.setOffline(true);
  // Make changes
  // Verify queued indicator
  // Go online
  await context.setOffline(false);
  // Verify sync completes
});
```

---

## Key Files to Modify/Create

| File | Action |

|------|--------|

| `tests/api/sketches.test.ts` | Extend with full CRUD tests |

| `tests/sync-service.test.ts` | New - sync service unit tests |

| `tests/api/validators.test.ts` | New - validation unit tests |

| `tests/e2e/sync.spec.ts` | New - browser E2E tests (optional) |