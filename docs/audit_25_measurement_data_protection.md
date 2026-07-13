# Audit 25 — Measurement Data Protection Edge Cases

**Date:** 2026-07-13
**Method:** 8 focused audit agents swept every surface where survey/measurement data is written, moved, or deleted (re-measure flows, delete/clear, node identity, imports, programmatic repositioning, undo/redo, sync/offline, metadata consistency). Every candidate finding was then adversarially verified by an independent agent that had to trace the exact unguarded flow in the current code before the finding was accepted. **37 findings confirmed, 1 refuted, 9 candidates could not be verified** (agent quota) and are listed separately.

This is the same family as the RTK-Fixed drag lock added on 2026-07-12: places where gold-standard survey data can be silently lost, overwritten by worse data, or where the deliverable (CSV) lies about a position.

## Already guarded (for context — no action needed)

- Canvas drag of RTK-Fixed nodes blocked via `wizardIsRTKFixed` (mouse + touch), with one-time toast.
- Touch jitter gate (22px) on measured nodes.
- Drag-demote of Float nodes clears survey fields once, round-trips them in undo.
- `positionLocked` flag for manual-coordinate nodes.
- Undo of a node with a quality-4/5 measurement asks for confirmation.
- Admin-config deep merge across localStorage / per-sketch snapshot / import.
- GNSS capture *dialog* replacing an RTK-Fixed node was claimed and **refuted** — that path is effectively guarded today.

---

## Top 10 priorities

| # | Guard to add | Why | Severity |
|---|---|---|---|
| 1 | Delete `coordinatesMap` entry on node delete + migrate it on rename (round-trip through undo) | Freed numeric id is reused first → a brand-new node silently inherits the deleted/renamed node's RTK-Fixed coordinates | Critical |
| 2 | Reset/rescope `coordinatesMap` on `newSketch` / `loadFromLibrary` / sketch switch (long-term: key storage per sketchId) | Sketch A's survey coordinates get stamped onto sketch B's same-numbered nodes as RTK Fixed | Critical |
| 3 | TSC3 re-shot confirm: matched point that is already measured and >~1m away → "update / create new / skip" dialog + undo entry | A TSC3 job whose numbering collides with existing node ids silently relocates measured manholes | Critical |
| 4 | Cords-CSV re-import conflict check: file value differs >tolerance from a fresher RTK-Fixed field measurement → keep/replace dialog | Office file silently rolls back the field's newest measurements, keeping stale metadata | Critical |
| 5 | Stop force-promoting quality to 4: `applyCoordinatesToNodes` / `initCoordinates` must preserve a known `gnssFixQuality`; only default to 4 when quality is absent (true file imports) | One reload launders a 15m phone-GPS capture into "RTK Fixed" — locked, badged, exported as Fixed | Major |
| 6 | Tighten `wizardIsRTKFixed`: inMap clause only when `gnssFixQuality == null`; precision clause excludes quality 5/6 | Plain-GPS captures and RTK-Float nodes currently classify as gold standard | Major |
| 7 | Drag-demote must also delete the node's `coordinatesMap` entry (and round-trip it in undo) | The next coordinate re-apply silently reverts the manual placement AND promotes the node back to Fixed | Major |
| 8 | Delete confirmations: tap-twice delete must not skip the data-loss dialog for measured nodes; edge delete must warn when tail/head measurements exist; redo needs the same gates as undo | Measured data deleted with zero indication | Major |
| 9 | Clear measurement metadata (`measure_precision`, `measuredAt`, `measuredBy`, `gnssHdop`) in the drag-demote clear block and load-time demotions | CSV exports a precision + date describing a measurement that no longer exists; stale ≤5cm precision can even re-lock a hand-placed node | Major |
| 10 | Precision-gate timeout (`max_epochs`) must ask "store anyway / retry / discard" instead of silently storing a non-converged point | A worker who looks away for 60s stores a ~5m point believing the gate passed | Major |

---

## Theme 1 — `coordinatesMap` lifecycle (root cause of 13 findings)

The global `coordinatesMap` (one localStorage key, `graphSketch.coordinates.v1`) is a second source of truth that is written by every capture/import path but **never deleted, migrated, or rescoped**. Because canvas ids are small reused integers, orphaned entries don't stay orphaned — they attach to future nodes.

| Gap | Evidence | Suggested guard |
|---|---|---|
| Node delete never removes the entry; `createNode` reuses the smallest free id → new node inherits gold coordinates + Fixed status | undo-redo.js:93-195 (no `.delete()` anywhere in frontend/src), graph-crud.js:69-76, coordinates.js:719-724 | In `deleteNodeShared` (and `performUndo('nodeCreate')`): capture entry into the undo action, `coordinatesMap.delete(id)` + persist; restore on undo |
| `renameNodeIdInternal` doesn't migrate the key; old id freed for reuse | storage-manager.js:66-74, details-panel.js:1059-1069 | Migrate key old→new (also `originalNodePositions`, `geoNodePositions`); refuse/confirm a new id that already exists in the map |
| `newSketch` / `loadFromLibrary` never clear the map → cross-sketch contamination | graph-crud.js:35-57, library-manager.js:256-285 | Rebuild the map from the loaded sketch's own surveyX/Y (like the JSON-import handler); long-term: per-sketchId storage key with one-time v1 migration |
| Sketch JSON / legacy import replaces the map in memory only — old map resurrects on reload | toolbar-events.js:326, :451 (no `saveCoordinatesToStorage`) | Persist immediately after replacing |
| Drag-demote leaves the entry → next `applyCoordinatesIfEnabled` reverts the placement and re-promotes to Fixed | pointer-handlers.js:604-621, coordinates.js:714-728 | Delete entry in the one-time clear block, round-trip via the nodeMove undo action |

## Theme 2 — Trust laundering (quality promotion)

Several code paths *fabricate* RTK-Fixed status for data that never earned it. Downstream, the details panel force-writes `accuracyLevel = 0` (הנדסית / engineering-grade) for any `wizardIsRTKFixed` node, so the CSV certifies it.

| Gap | Evidence | Suggested guard |
|---|---|---|
| `applyCoordinatesToNodes` / `initCoordinates` stamp `gnssFixQuality = 4` on any in-map node (incl. quality 0/1/2 phone captures, and nodes just demoted to manual by the load migration) | coordinates.js:724, :706; coordinate-handlers.js:889-901 | Preserve any known quality; default to 4 only when quality is `null` (true cords-file import); purge map entries with no matching node |
| `wizardIsRTKFixed` inMap clause counts quality 0/1/2 as Fixed | wizard-helpers.js:35-38 | `quality === 4 || (inMap && quality == null) || (precision <= 0.05 && quality !== 5 && quality !== 6)` |
| Precision ≤ 0.05 branch locks/badges RTK-Float nodes (CSV then shows accuracy_level=0 with Fix_Type='Device Float' — self-contradictory) | wizard-helpers.js:38, csv.js | Add the quality-5/6 exclusion to the precision branch |
| GNSS captures write `coordinatesMap` for ANY fix quality → one reload launders GPS to Fixed | gnss-handlers.js:172-177, 322-327 | Gate the map write on quality 4 (or precision ≤ 0.05), or store `{x,y,z,src,q}` provenance in entries |
| Every TSC3 point hardcoded quality 4 / 0.02m regardless of the controller's actual fix | tsc3-handlers.js:60-61 | Record `measureSource:'tsc3'`; leave precision null (or admin-configurable) unless the bridge carries real RMS |
| CSV/legacy import stamps Fixed with no `measuredAt`/`measuredBy`/precision → "Fixed" rows with empty Measured_Date | coordinates.js:715-728, legacy-import.js:244-246 | Stamp import date + importing user + provenance marker |

## Theme 3 — Silent overwrites of gold measurements

| Gap | Evidence | Suggested guard |
|---|---|---|
| TSC3 re-shot / point-name collision: existing-name match updates directly — no dialog, no distance check, no undo. A new TSC3 job numbered from 1..N relocates existing manholes | tsc3-connection-manager.js:89, 97-104; tsc3-handlers.js:54-73 | If matched node `hasCoordinates` and new shot >0.5-1m away (or nodeType is Home/Issue): confirm "update / create new / skip"; push an undo entry capturing prior survey fields + map entry |
| Cords-CSV merge overwrites live-captured RTK-Fixed coordinates, keeping stale capture metadata (measuredAt/By still describe the old shot) | coordinate-handlers.js:143-146, coordinates.js:719-721 | Per-node conflict detection (delta > tolerance vs a fresher quality-4 measurement) → one summary dialog "N points have newer field measurements — keep field / take file"; refresh metadata when file wins |
| "Different project area" confirm has **no abort**: OK replaces, Cancel merges anyway | coordinate-handlers.js:190-198 | Three-option dialog Replace / Merge / **Cancel** (default Cancel, touches nothing) |
| Precision-gated measure stores the last fix on `max_epochs` timeout exactly like a deliberate accept | main-entry.js:552-558, precision-measure.js:82-88 | Branch on reason: non-converged → "Store anyway / Retry / Discard" dialog; stamp below-threshold points so they don't get the RTK badge |

## Theme 4 — Delete / undo / redo confirmation gaps

| Gap | Evidence | Suggested guard |
|---|---|---|
| Details-panel tap-twice delete passes `skipConfirm=true` — RTK-Fixed node deleted with zero data-loss indication | details-panel.js:1238 | If `wizardIsRTKFixed(node) || nodeHasValuableData(node)`, keep the detailed dialog (or render the armed button with an explicit "RTK measurement will be lost" label) |
| Edge delete never consults `edgeHasValuableData` — invert measurements deleted behind generic confirm (none at all from details panel) | undo-redo.js:203-204, details-panel.js:1684 | Detailed confirm listing tail/head values when the edge carries measurements |
| Deleting the LAST measured node is never persisted: `saveToStorage` early-returns on empty sketches → node resurrects on reload and stays in the cloud | storage-manager.js:274-277 | Allow empty-payload persist when `currentSketchId` is set / a previous payload exists |
| `performRedo` re-applies every destructive action (survey clear, node/edge delete) with zero confirmation, while all matching undo paths are gated | undo-redo.js:427-583 | Mirror the undo-side confirms; on cancel push the action back |
| `nodeMove` undo doesn't round-trip `manual_x`/`manual_y` — after undoing an accidental drag, the CSV still exports the wrong ITM | pointer-handlers.js:438-451, 649-665 | Capture/restore old manual_x/y (and precision/measuredAt/measuredBy) in the drag undo entry |

## Theme 5 — Metadata consistency

| Gap | Evidence | Suggested guard |
|---|---|---|
| Drag clear wipes surveyX/Y/Z but leaves `measure_precision`, `measuredAt`, `measuredBy`, `gnssHdop` — deliverable reports precision/date of a deleted measurement; a stale ≤5cm precision can re-lock the node | pointer-handlers.js:604-621 | Null them in the same clear block (round-trip via undo); defense in depth: gate Precision/Measured_Date in csv.js on surveyX/Y presence like Fix_Type |
| Load-time demotion of quality-6/legacy nodes keeps measuredAt/measuredBy/gnssHdop | storage-manager.js:164-187 | Null them together with the survey coordinates they describe |
| Capture dialog drops accuracy/hrms — every dialog capture writes `measure_precision = null`, wiping prior precision on re-measure | point-capture-dialog.js:333-341, gnss-handlers.js:189 | Include accuracy/hrms/vrms in captureData.position; `precision = hrms ?? accuracy ?? keep-existing` |
| `manual_x/manual_y` derived against an invalid reference frame (Tel Aviv fallback, or geo anchor while in schematic view) and exported as ITM | coordinate-handlers.js:486-505, graph-crud.js:93-97 | Tag the fallback reference `isDefault` and skip derivation + `hasCoordinates` promotion against it |
| Zero-padded point names ('012') never match unpadded ids ('12') — silent 0-match imports, duplicate ghost nodes from TSC3 | coordinates.js:42-49, tsc3-connection-manager.js:89 | Canonicalize numeric-looking ids (`parseInt`-normalize) at every match boundary |
| Project-canvas repositioning overwrites every sketch's x/y with no schematicX/Y backup; jitter-placed nodes persisted; quality-blind map sync | home-renderer.js:683-698, 752-769 | Back up schematicX/Y first; flag jitter placements; filter map sync to quality-4 nodes |

## Theme 6 — Sync / offline candidates (found, NOT yet verified — verify before acting)

The verification agents for these hit a quota limit; the scenarios were reported by the finder pass with file references but have not been independently confirmed:

1. **Offline queue bypasses optimistic locking** — queued saves send `clientVersion: null`, so the server skips the version check and clobbers the other worker's data cloud-wide.
2. **Structural conflict "server-wins" leaves stale local nodes on canvas** — the very next tap pushes them back with a fresh version number, destroying the server version that just won.
3. **Lock-conflict 409 makes sync silently give up** — no retry queue, no warning; a day of RTK captures may never reach the cloud.
4. **"Metadata-only" conflict auto-merge compares only 6 node fields** — local surveyZ / fix quality / precision / measuredBy edits discarded without backup or toast.
5. **Conflict backups are write-only** — no UI lists/restores `conflict_backup_*` entries; only 5 kept with mis-sorted eviction.
6. **Project-canvas: one tap on a background sketch wipes the undo stack**, making a just-made destructive change permanent.
7. **Undo-of-create confirm uses `nodeHasValuableData` (quality 4/5 only)** instead of the canonical `wizardIsRTKFixed` — canonically-Fixed captured nodes deleted silently.

## Suggested implementation order

1. **coordinatesMap lifecycle** (Theme 1) — one cohesive change: delete-on-node-delete, migrate-on-rename, reset-on-sketch-switch, persist-on-import, delete-on-drag-demote, all round-tripped through undo. Kills 13 findings including 5 criticals.
2. **Quality laundering** (Theme 2) — tighten `wizardIsRTKFixed` + stop fabricating quality 4 in apply/init. Kills 6 findings and makes the classification trustworthy everywhere at once.
3. **Overwrite confirms** (Theme 3) — TSC3 re-shot dialog, import conflict dialog, cancel-able area dialog, non-converged measure dialog.
4. **Delete/undo/redo gates** (Theme 4).
5. **Metadata hygiene** (Theme 5) — small, mechanical.
6. **Verify then fix the sync candidates** (Theme 6) — highest potential impact but needs confirmation first.
