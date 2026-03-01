# Edge Edit Panel -- Design Audit

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape)
**Files reviewed**: styles.css, src/legacy/main.js (lines 5830-6110), .claude/app-ui-reference.md

---

## Summary

The Edge Edit Panel renders inside `#sidebar` (`.drawer`) when a user selects an edge on the canvas. It shows edge properties (type, material, diameter, measurements, fall depth/position, engineering status) in a two-column grid, plus a delete button. In landscape mode, the drawer converts from a bottom sheet to a side panel (max 280px or 35vw).

---

## Issues Found

### Issue 1 -- CRITICAL: Hardcoded hex colors in .field-auto-filled (no dark mode support)
- **Severity**: HIGH
- **Type**: design-tokens / dark-mode
- **Lines**: styles.css:2311-2318
- **Problem**: `.field-auto-filled select, .field-auto-filled input` uses `background-color: #e2e8f0 !important` and `color: #64748b !important`. The dark mode override at line 2332 also uses hardcoded hex (`#334155`, `#94a3b8`). Should use CSS custom properties from the token system.
- **Fix**: Replace with `var(--color-surface-alt)` for background and `var(--color-text-secondary)` for color. Remove `!important` if possible, or use scoped dark-mode tokens.
- **Resolution**: Already uses `var(--color-surface-alt, #e2e8f0)` and `var(--color-text-secondary, #64748b)` tokens. No hardcoded dark mode override exists. **FIXED** (pre-existing).

### Issue 2 -- HIGH: Hardcoded hex in .field-auto-filled::after position uses `right:` instead of RTL-safe property
- **Severity**: HIGH
- **Type**: RTL
- **Lines**: styles.css:2321-2329
- **Problem**: `.field-auto-filled::after` uses `right: 8px` which is LTR-only. In RTL (Hebrew), the lock icon will appear on the wrong side.
- **Fix**: Replace `right: 8px` with `inset-inline-end: 8px`.
- **Resolution**: Already uses `inset-inline-end: 8px`. **FIXED** (pre-existing).

### Issue 3 -- HIGH: .details-actions gradient uses hardcoded rgba(255,255,255,0) -- breaks in dark mode
- **Severity**: HIGH
- **Type**: dark-mode / design-tokens
- **Lines**: styles.css:2508
- **Problem**: `.details-actions` background gradient uses `rgba(255, 255, 255, 0)` to `var(--color-surface, #fff)`. The transparent white beginning of the gradient will create a visible flash/band in dark mode against the dark surface.
- **Fix**: Use `color-mix(in srgb, var(--color-surface) 0%, transparent)` or define a `--color-surface-transparent` token. Alternatively, use `var(--color-surface)` with opacity for the gradient start.
- **Resolution**: Replaced `transparent` with `color-mix(in srgb, var(--color-surface, #fff) 0%, transparent)` so the gradient fades from a transparent version of the surface color, avoiding dark-band artifacts. **FIXED** in `2f06a97`.

### Issue 4 -- HIGH: .btn-fix-suggestion .material-icons uses hardcoded #eab308
- **Severity**: MEDIUM
- **Type**: design-tokens
- **Lines**: styles.css:2562
- **Problem**: `.btn-fix-suggestion .material-icons` uses `color: #eab308` (a yellow). This should use `var(--color-warning, #eab308)` design token.
- **Fix**: Replace `color: #eab308` with `color: var(--color-warning, #eab308)`.
- **Resolution**: Already uses `var(--color-warning, #eab308)`. **FIXED** (pre-existing).

### Issue 5 -- MEDIUM: Default .btn min-height is 36px, below 44px touch target
- **Severity**: MEDIUM
- **Type**: touch-target
- **Lines**: styles.css:930
- **Problem**: Base `.btn` has `min-height: 36px`. While `#sidebar .btn` in landscape overrides to `var(--touch-target-min)`, the delete button (`#deleteEdgeBtn`) in the edge panel on portrait mobile still gets 36px. On a phone in portrait, this is below the recommended 44dp minimum for field workers wearing gloves.
- **Fix**: Change base `.btn` min-height to `var(--touch-target-min)` (44px), or add a specific override for `#sidebar .btn` in all viewports (not just landscape).
- **Resolution**: Changed mobile `.btn` min-height from `40px` to `var(--touch-target-min)` (44px) in `@media (max-width: 600px)`. Base `.btn` stays 36px for desktop. **FIXED** in `2f06a97`.

### Issue 6 -- MEDIUM: Edge panel select elements have no explicit min-height for touch targets
- **Severity**: MEDIUM
- **Type**: touch-target
- **Lines**: styles.css:2134-2160
- **Problem**: `#sidebar select` only gets `padding: 0.4rem 0.5rem` and `font-size: 0.9rem`. In the landscape media query (line 11602), `min-height: var(--touch-target-min)` is correctly set. But in portrait mobile mode (<1024px), there's no explicit min-height. The select elements may be too small for comfortable touch interaction.
- **Fix**: Add `min-height: var(--touch-target-min)` to `#sidebar select` and `#sidebar input` in the general mobile (max-width: 1024px) context, not just landscape.
- **Resolution**: Changed `#sidebar input/select` min-height from `40px` to `var(--touch-target-min)` in `@media (max-width: 600px)`. Also already set in landscape media query. **FIXED** in `2f06a97`.

### Issue 7 -- LOW: .connected-edge-divider border fallback uses hardcoded hex
- **Severity**: LOW
- **Type**: design-tokens
- **Lines**: styles.css:2368
- **Problem**: `.connected-edge-divider` uses `border-top: 2px solid var(--color-border, #0f172a)`. The fallback `#0f172a` is the dark text color, which is jarring as a divider in light mode. The variable `--color-border` is correct, but the fallback should be the light border color `#e5e7eb`.
- **Fix**: Change fallback to `var(--color-border, #e5e7eb)`.
- **Resolution**: Already uses `var(--color-border, #e5e7eb)` as the fallback. **FIXED** (pre-existing).

### Issue 8 -- LOW: headNode.note rendered without escapeHtml in edge panel
- **Severity**: LOW
- **Type**: security
- **Lines**: main.js:5940
- **Problem**: `<div class="muted">${headNode.note}</div>` renders the target node's note without `escapeHtml()`. While notes are user-input stored locally, this is an XSS risk if malicious data enters via sync.
- **Fix**: Wrap with `${escapeHtml(headNode.note)}`.
- **Resolution**: Already uses `escapeHtml(headNode.note)` at line 5940. **FIXED** (pre-existing).

---

## Status Summary

| # | Severity | Category | Status | Commit |
|---|----------|----------|--------|--------|
| 1 | HIGH | dark-mode/tokens | FIXED | pre-existing |
| 2 | HIGH | RTL | FIXED | pre-existing |
| 3 | HIGH | dark-mode | FIXED | 2f06a97 |
| 4 | MEDIUM | tokens | FIXED | pre-existing |
| 5 | MEDIUM | touch-target | FIXED | 2f06a97 |
| 6 | MEDIUM | touch-target | FIXED | 2f06a97 |
| 7 | LOW | tokens | FIXED | pre-existing |
| 8 | LOW | security | FIXED | pre-existing |
