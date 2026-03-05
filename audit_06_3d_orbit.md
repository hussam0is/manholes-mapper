# 3D Orbit Mode -- Design Audit (Updated)

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape)
**Files reviewed**: styles.css (10272-11100), src/three-d/three-d-view.js, .claude/app-ui-reference.md

---

## Summary

The 3D view opens as a fullscreen overlay with a header bar (title, mode toggle, miniature toggle, close button), orbit controls (zoom in/out, recenter), a legend panel (bottom-left), an issues panel (bottom-right in landscape), and a controls hint overlay. In orbit mode, OrbitControls handles rotate/zoom/pan. In landscape mode (max-height: 500px), the header auto-hides after 5s with a small "tune" show-header button.

---

## Issues Found (New -- Touch Targets and Design Tokens)

### Issue 1 -- MEDIUM: 3D header buttons drop to min-height: 40px in landscape (below 44px)
- **Severity**: MEDIUM
- **Type**: touch-target
- **Lines**: styles.css:10934-10937
- **Problem**: Close, mode toggle, miniature toggle get `min-height: 40px` in landscape. Below 44px.
- **Fix**: Change to `min-height: var(--touch-target-min, 44px)`.
- **Status**: FIXED (dd1d91b)

### Issue 2 -- MEDIUM: 3D speed buttons drop to min-height: 40px in landscape
- **Severity**: MEDIUM
- **Type**: touch-target
- **Lines**: styles.css:10948
- **Problem**: `.three-d-overlay__speed-btn` gets `min-height: 40px` in landscape.
- **Fix**: Change to `min-height: var(--touch-target-min, 44px)`.
- **Status**: FIXED (already had `var(--touch-target-min, 44px)` in prior commit)

### Issue 3 -- MEDIUM: 3D issues panel toggle has no min-height for touch target
- **Severity**: MEDIUM
- **Type**: touch-target
- **Lines**: styles.css:10809-10822
- **Problem**: Relies on padding only. No explicit min-height.
- **Fix**: Add `min-height: var(--touch-target-min, 44px)`.
- **Status**: FIXED (already had `min-height: var(--touch-target-min, 44px)` in prior commit)

### Issue 4 -- MEDIUM: 3D legend toggle has no min-height for touch target
- **Severity**: MEDIUM
- **Type**: touch-target
- **Lines**: styles.css:10368-10381
- **Problem**: No min-height. In landscape, about 26px with padding.
- **Fix**: Add `min-height: var(--touch-target-min, 44px)`.
- **Status**: FIXED (already had `min-height: var(--touch-target-min, 44px)` in prior commit)

### Issue 5 -- MEDIUM: 3D issue rows have no min-height for touch target
- **Severity**: MEDIUM
- **Type**: touch-target
- **Lines**: styles.css:10853-10861
- **Problem**: Clickable rows about 28px height.
- **Fix**: Add `min-height: var(--touch-target-min, 44px)`.
- **Status**: FIXED (already had `min-height: var(--touch-target-min, 44px)` in prior commit)

### Issue 6 -- MEDIUM: 3D fix popup close button is too small
- **Severity**: MEDIUM
- **Type**: touch-target
- **Lines**: styles.css:10529-10538
- **Problem**: Only `padding: 2px` with 16px icon = ~20px touch target.
- **Fix**: Add `min-width: 44px; min-height: 44px`.
- **Status**: FIXED (already had `min-width/min-height: var(--touch-target-min, 44px)` in prior commit)

### Issue 7 -- LOW: 3D fix popup button min-height is 40px
- **Severity**: LOW
- **Type**: touch-target
- **Lines**: styles.css:10569
- **Problem**: Slightly below 44px target.
- **Fix**: Change to `min-height: var(--touch-target-min, 44px)`.
- **Status**: FIXED (already had `min-height: var(--touch-target-min, 44px)` in prior commit)

### Issue 8 -- HIGH: 3D overlay uses many hardcoded hex colors instead of tokens
- **Severity**: HIGH
- **Type**: design-tokens
- **Lines**: throughout 10276-11102
- **Problem**: The 3D overlay CSS uses dozens of hardcoded colors: `#fff`, `rgba(37,99,235,...)`, `rgba(239,68,68,...)`, `#94a3b8`, `#e2e8f0`, `#eab308`, `#ef4444`, `#fca5a5`, etc. These should use the design token system with scoped 3D tokens.
- **Fix**: Replaced ~25 hardcoded hex/rgba values with `--color-3d-*` scoped tokens. Added 7 new tokens: `--color-3d-danger-solid`, `--color-3d-danger-text`, `--color-3d-danger-border`, `--color-3d-pipe-label`, `--color-3d-primary-muted`, `--color-3d-primary-border-muted`, `--color-3d-sprint`.
- **Status**: FIXED (dd1d91b)

### Issue 9 -- HIGH: Legend swatches use inline hardcoded hex colors
- **Severity**: HIGH
- **Type**: design-tokens
- **Lines**: three-d-view.js:127-139
- **Problem**: `style="background:#2563eb"`, `#fb923c`, `#0d9488`, `#888` in legend HTML.
- **Fix**: Replaced inline styles with CSS classes: `.three-d-overlay__legend-swatch--pipe`, `--drainage`, `--house`, `--estimated`, each backed by `--color-3d-swatch-*` tokens.
- **Status**: FIXED (dd1d91b)

### Issue 10 -- LOW: Issues panel collapsed max-height in landscape (36px) will mismatch after touch fix
- **Severity**: LOW
- **Type**: layout
- **Lines**: styles.css:10997
- **Problem**: Collapsed max-height should match toggle min-height after fixes.
- **Fix**: Update to 44px.
- **Status**: FIXED (already had `max-height: var(--touch-target-min, 44px)` in prior commit)
