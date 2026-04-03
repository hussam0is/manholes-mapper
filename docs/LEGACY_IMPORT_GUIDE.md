# Legacy Sketch Import Guide

**Added**: 2026-04-04  
**Status**: Fully implemented and wired into UI

---

## Overview

The legacy import feature allows importing old manholes-mapper sketches (pre-ITM-coordinates era) by combining a legacy `sketch.json` with a `coords.csv` file containing ITM survey coordinates.

This is a two-file import process that converts old-format data into the current new-format sketch.

---

## Where to Find It

**Desktop:** Menu → "Sketch" group → "Import Legacy Sketch + Coordinates" (history icon)  
**Mobile:** Mobile menu → "Sketch & Export" group → same button

---

## File Formats

### Legacy Sketch File (`sketch.json`)
- Old-format sketch JSON with `nodes[]` and `edges[]`
- Nodes have canvas `x`/`y` positions (pixel-space, not geographic)
- No survey coordinate data embedded

### Coordinates CSV (`coords.csv`)
```
nodeId,surveyX,surveyY[,surveyZ]
1,178234.5,665890.3,52.1
2,178256.1,665912.7,51.8
```
- Column 1: Node ID (matches node IDs in the sketch JSON)
- Column 2: ITM X coordinate (easting)
- Column 3: ITM Y coordinate (northing)
- Column 4: Elevation (optional)

---

## Import Flow

1. Click "Import Legacy Sketch + Coordinates" in the menu
2. **File picker 1**: Select the legacy sketch JSON
3. **File picker 2**: Select the ITM coordinates CSV
4. App processes both files and displays the imported sketch

### What the import does:
- **Matched nodes** (have coordinates in CSV): placed at correct ITM positions on canvas, marked as `accuracyLevel=0` (Engineering), `gnssFixQuality=4` (RTK Fixed)
- **Unmatched nodes** (no coordinates): approximated via BFS graph propagation from positioned neighbors, marked as `accuracyLevel=1` (Schematic)
- **Edges**: all preserved as-is
- **Coordinate reference layer**: rebuilt from imported survey data

---

## Code Architecture

| File | Role |
|------|------|
| `frontend/src/utils/legacy-import.js` | Core conversion logic (browser-compatible, no Node.js deps) |
| `frontend/src/legacy/toolbar-events.js` | UI wiring: file picker triggers, file reading, state update |
| `frontend/src/legacy/legacy-import-loader.js` | Pre-loads PapaParse and Wicket for import wizard |
| `frontend/index.html` | `#importLegacySketchBtn`, `#importLegacySketchFile`, `#importLegacyCoordsFile` DOM elements |
| `frontend/src/menu/menu-config.js` | Declarative config entry (`importLegacySketch` in sketch group) |
| `frontend/src/menu/menu-events.js` | `legacyMappings` bridges `importLegacySketch` action → `#importLegacySketchBtn` |
| `scripts/import-legacy-sketch.cjs` | Node.js CLI version (for offline/scripted use) |

---

## Coordinate Approximation Algorithm

For nodes without ITM coordinates, positions are estimated using:

1. **Scale factor**: computed from edges connecting two surveyed nodes  
   `scale = newDist_ITM / oldDist_canvas` (averaged across all such edges)

2. **BFS propagation** (up to 15 passes):
   - Find a positioned neighbor
   - Preserve the angle from original canvas layout
   - Apply scale factor to estimate new position

3. **Fallback**: nodes with no positioned neighbors are placed at the centroid with small random jitter

---

## i18n Keys

| Key | Hebrew | English |
|-----|--------|---------|
| `importLegacySketch` | ייבא סקיצה ישנה + קואורדינטות | Import Legacy Sketch + Coordinates |
| `toasts.importingLegacy` | מייבא סקיצה ישנה... | — |
| `toasts.legacySketchImported` | סקיצה ישנה יובאה בהצלחה | — |
| `alerts.legacyImportFailed` | ייבוא סקיצה ישנה נכשל | — |
| `alerts.confirmImportReplace` | ישנן נתונים קיימים. להחליף? | — |

---

## Limitations

- Large sketches (1000+ nodes) may take a few seconds to process (all in-browser)
- Node IDs must match between sketch JSON and CSV for coordinate assignment
- The import replaces the current sketch (confirmation required if existing data)
- Survey coordinates must be in ITM (Israeli Transverse Mercator) projection
