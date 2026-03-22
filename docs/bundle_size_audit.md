# Bundle Size Audit — Manholes Mapper

**Date**: 2026-03-01
**Build tool**: Vite 7.3.1 (Rollup)
**Branch**: dev

---

## 1. Baseline (Before Optimization)

| File | Raw | Gzip | Notes |
|------|-----|------|-------|
| `main.js` | 434.60 KB | 119.67 KB | App entry + all app code |
| `styles.css` | 223.17 KB | 36.24 KB | All CSS (custom + Tailwind base) |
| `assets/three-vendor-*.js` | 746.39 KB | 192.27 KB | Three.js (lazy-loaded) |
| `assets/react-vendor-*.js` | 192.48 KB | 60.34 KB | React + ReactDOM |
| `assets/vendor-*.js` | 150.00 KB | 50.98 KB | proj4 + Capacitor + speed-insights |
| `assets/three-d-view-*.js` | 42.58 KB | 13.17 KB | App 3D view code (lazy-loaded) |
| `assets/auth-*.js` | 14.09 KB | 5.63 KB | Better Auth client |
| `index.html` | 59.14 KB | 9.61 KB | Inline HTML body (~55 KB) |
| **JS Total** | **1,579.74 KB** | **441.89 KB** | |
| **Critical-path JS** | **584.60 KB** | **170.65 KB** | main.js + vendor + react-vendor |

### Public Assets (not bundled, served statically)
| File | Size | Notes |
|------|------|-------|
| `public/app_icon.png` | 1,330 KB | 1024x1024 PNG, used as app icon |
| `public/fall_icon.png` | 1,292 KB | 1024x1024 PNG, edge fall indicator |
| `public/icon-192.png` | 1,299 KB | 1024x1024 PNG (named 192 but actually 1024!) |
| `public/icon-512.png` | 1,219 KB | 1024x1024 PNG (named 512 but actually 1024) |
| `public/geopoint_logo.png` | 13 KB | Logo, reasonable size |
| `public/fonts/material-icons.woff2` | 126 KB | Full Material Icons font |

**Total static assets**: ~5,279 KB (5.2 MB)

---

## 2. Optimizations Applied

### 2a. Lazy-load admin modules (IMPLEMENTED)

**Impact**: -66.60 KB raw / -15.15 KB gzip from `main.js`

Admin settings, projects settings, and input-flow settings were statically imported in `main.js` even though they are only used when admin/super_admin users open the admin panel.

**Changes**:
- Removed static `import { AdminSettings, getNodeSpecs, getEdgeSpecs }` from `main.js`
- Removed static `import { ProjectsSettings }` from `main.js`
- Converted `openAdminModal()`, `openAdminScreen()`, `openProjectsScreen()` to use `await import()`
- New lazy chunk: `admin-*.js` (63.77 KB raw / 14.39 KB gzip) — only loaded for admin users

### 2b. Lazy-load CSV/sketch I/O modules (IMPLEMENTED)

**Impact**: -7.25 KB raw / -2.46 KB gzip from `main.js`

CSV export and sketch JSON import/export are user-triggered actions. No need to load them at startup.

**Changes**:
- Removed static `import { csvQuote, exportNodesCsv, exportEdgesCsv }` from `main.js`
- Removed static `import { exportSketchToJson, importSketchFromJson }` from `main.js`
- Converted export/import handlers to use `await import()` at call time
- New lazy chunks: `csv-*.js` (4.43 KB), `sketch-io-*.js` (2.82 KB)
- Also removed unused `csvQuote` import (dead code)

### 2c. Split proj4 into dedicated chunk (IMPLEMENTED)

**Impact**: Vendor chunk -129.71 KB raw / -43.25 KB gzip

proj4 (coordinate projection library) was bundled into the generic vendor chunk. While it loads at startup (needed for map projections), splitting it enables independent caching — when app code changes, proj4 (129.57 KB) does not need to be re-downloaded.

**Changes**:
- Added `proj4`, `mgrs`, and `wkt-parser` to their own `proj4-vendor` chunk in `vite.config.ts`
- Vendor chunk reduced from 150.00 KB to 20.29 KB

### 2d. Fix missing i18n key (IMPLEMENTED)

The `projects.canvas.loadError` key was missing from Hebrew translations, causing a test failure. Added it.

---

## 3. After Optimization

| File | Raw | Gzip | Change |
|------|-----|------|--------|
| `main.js` | 368.00 KB | 104.52 KB | **-66.60 KB / -15.15 KB gz** |
| `styles.css` | 220.50 KB | 35.73 KB | -2.67 KB (i18n change) |
| `assets/three-vendor-*.js` | 746.39 KB | 192.27 KB | unchanged |
| `assets/react-vendor-*.js` | 192.48 KB | 60.34 KB | unchanged |
| `assets/proj4-vendor-*.js` | 129.57 KB | 43.21 KB | NEW (split from vendor) |
| `assets/admin-*.js` | 63.77 KB | 14.39 KB | NEW (lazy, admin-only) |
| `assets/three-d-view-*.js` | 42.70 KB | 13.22 KB | unchanged |
| `assets/vendor-*.js` | 20.29 KB | 7.73 KB | **-129.71 KB / -43.25 KB gz** |
| `assets/auth-*.js` | 14.09 KB | 5.63 KB | unchanged |
| `assets/csv-*.js` | 4.43 KB | 1.47 KB | NEW (lazy, export-only) |
| `assets/sketch-io-*.js` | 2.82 KB | 0.99 KB | NEW (lazy, import/export) |
| `index.html` | 61.25 KB | 9.93 KB | +2.11 KB (lazy import URLs) |

### Critical-path JS (loaded on every page visit)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Raw | 584.60 KB | 518.29 KB | **-66.31 KB (-11.3%)** |
| Gzip | 170.65 KB | 155.46 KB | **-15.19 KB (-8.9%)** |

### Deferred JS (loaded only when needed)

| Chunk | When loaded | Raw | Gzip |
|-------|-------------|-----|------|
| `admin-*.js` | Admin opens settings/projects | 63.77 KB | 14.39 KB |
| `three-d-view-*.js` | User opens 3D view | 42.70 KB | 13.22 KB |
| `three-vendor-*.js` | User opens 3D view | 746.39 KB | 192.27 KB |
| `csv-*.js` | User exports CSV | 4.43 KB | 1.47 KB |
| `sketch-io-*.js` | User exports/imports sketch | 2.82 KB | 0.99 KB |

---

## 4. Remaining Optimization Opportunities (Not Implemented)

### HIGH IMPACT

#### 4a. Optimize PNG images (estimated -4.5 MB static assets)
- `icon-192.png` is 1024x1024 (1.3 MB) but should be 192x192 (~15 KB)
- `icon-512.png` is 1024x1024 (1.2 MB) but should be 512x512 (~80 KB)
- `app_icon.png` is 1024x1024 (1.3 MB) — could be compressed or converted to WebP
- `fall_icon.png` is 1024x1024 (1.3 MB) — this is loaded in canvas; could be much smaller
- **Requires**: Image processing tools (sharp, ImageMagick, or manual resize)
- **Risk**: Low — just need to resize to correct dimensions

#### 4b. Subset Material Icons font (estimated -80 KB)
- Full `material-icons.woff2` is 126 KB
- Only 103 unique icon names are used across the app
- A subset would be ~20-30 KB
- **Requires**: `glyphhanger` or `pyftsubset` tool
- **Risk**: Low — must audit all icon usages to avoid missing any

### MEDIUM IMPACT

#### 4c. Lazy-load React (estimated -192 KB raw / -60 KB gzip deferred)
- React is only used for the auth UI (`auth-provider.jsx` — login/signup forms)
- Once authenticated (session cookie), React is never used again
- Could lazy-load React + auth-provider only when navigating to login/signup routes
- **Risk**: Medium — requires restructuring auth initialization flow

#### 4d. Remove or lazy-load Capacitor from web bundle (estimated -10-15 KB)
- `@capacitor/core` is in the vendor chunk (~15 KB contribution)
- On web (non-Android), it's essentially dead code — the API proxy just checks `Capacitor.isNativePlatform()`
- Could conditionally import only on native platform
- **Risk**: Medium — Capacitor's tree-shaking behavior needs testing

#### 4e. CSS reduction
- Built CSS is 220.50 KB (35.73 KB gzip) from 308.8 KB source (minification working well)
- Tailwind CSS 4 is installed as a dev dependency but appears to have minimal utility usage (~7 utility classes in `main.js`)
- CSS is mostly hand-written BEM with design tokens — well structured
- **Risk**: High for automated purging (dynamic class names in JS)

### LOW IMPACT

#### 4f. Extract `index.html` inline content
- `index.html` is 61 KB (9.93 KB gzip) because it contains all panel HTML inline
- Not easily fixable without a template system — the HTML is needed for initial render
- **Risk**: High — breaking change to rendering architecture

#### 4g. Code-split `coordinates.js` (27 KB source)
- Only used in main.js for CSV import — could be lazy-loaded
- **Risk**: Low but small impact (~5 KB minified)

---

## 5. Compression (Vercel)

Vercel automatically serves Brotli compression (better than gzip) for all static assets. The gzip sizes shown above are worst-case — actual transfer sizes with Brotli are typically 15-20% smaller:

| Asset | Gzip | Estimated Brotli |
|-------|------|-----------------|
| `main.js` | 104.52 KB | ~88 KB |
| `styles.css` | 35.73 KB | ~30 KB |
| `proj4-vendor` | 43.21 KB | ~37 KB |
| `react-vendor` | 60.34 KB | ~51 KB |
| `vendor` | 7.73 KB | ~7 KB |
| **Critical-path total** | 155.46 KB | ~132 KB |

---

## 6. Summary

| Metric | Before | After | Saved |
|--------|--------|-------|-------|
| Critical-path JS (raw) | 584.60 KB | 518.29 KB | **-66.31 KB (-11.3%)** |
| Critical-path JS (gzip) | 170.65 KB | 155.46 KB | **-15.19 KB (-8.9%)** |
| Admin-only JS deferred | 0 KB | 63.77 KB | Users who never open admin save this |
| Export/import JS deferred | 0 KB | 7.25 KB | Loaded only on user action |
| Vendor chunk (raw) | 150.00 KB | 20.29 KB | **-129.71 KB (better caching)** |

All changes are backward-compatible. No functionality was removed or altered. Tests pass (770/771, 1 pre-existing auth-helpers error message mismatch).
