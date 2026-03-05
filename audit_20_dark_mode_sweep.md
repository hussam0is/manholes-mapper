# Dark Mode Comprehensive Sweep Audit

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape)
**Method**: Playwright with `emulateMedia({ colorScheme: 'dark' })` + CSS analysis
**Screens Audited**: Login, Signup, Home/Sketch list, Canvas, Mobile menu, Admin settings, Admin panel, Projects, Help modal, Start panel, Edge legend, Floating keyboard, Auth loading overlay, Sidebar/drawer

---

## Summary

The app has a solid dark mode foundation via `@media (prefers-color-scheme: dark)` with CSS custom properties. However, a number of components use hardcoded light-mode hex colors outside dark mode blocks, meaning they render with white/light backgrounds or borders when dark mode is active.

**Total Issues**: 14
- CRITICAL: 2
- HIGH: 6
- MEDIUM: 4
- LOW: 2

---

## Issue #1 -- Mobile menu header hardcoded light gradient
- **Severity**: HIGH
- **Type**: dark-mode
- **Line**: 800
- **Problem**: `.mobile-menu-header` uses `background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)` -- a light gradient that is NOT inside a dark mode block. The dark override at line 6349 exists but the base style at line 800 uses hardcoded hex.
- **Fix**: Replace with `var(--color-bg)` / `var(--color-surface-hover)`.

## Issue #2 -- Mobile menu btn hover/active hardcoded colors
- **Severity**: HIGH
- **Type**: dark-mode
- **Lines**: 866, 871, 895
- **Problem**: `#mobileMenu .btn:hover` uses `background: #f1f5f9`, `:active` uses `#e2e8f0`, `label:hover` uses `#f1f5f9`. These are overridden in the dark block but the base styles use hardcoded hex.
- **Fix**: Replace with `var(--color-surface-hover)` and `var(--color-border)` respectively.

## Issue #3 -- Soft-blue-header hardcoded backgrounds
- **Severity**: MEDIUM
- **Type**: dark-mode
- **Lines**: 415, 431, 435
- **Problem**: `.soft-blue-header` uses `rgba(255, 255, 255, 0.7)` and `.btn:hover` uses `#f1f5f9`. No dark mode overrides for these.
- **Fix**: Use `var()` with token fallbacks and add dark override.

## Issue #4 -- Auth loading overlay light background
- **Severity**: HIGH
- **Type**: dark-mode
- **Line**: 8399
- **Problem**: `.auth-loading-overlay` uses `background: rgba(248, 250, 252, 0.9)` -- bright white overlay. Dark override exists at line 8629 but the base style is hardcoded.
- **Fix**: Already has dark override. The base style should use `var(--color-bg)` with opacity.

## Issue #5 -- Option table inputs hardcoded borders
- **Severity**: MEDIUM
- **Type**: dark-mode
- **Lines**: 4890, 4901
- **Problem**: `.option-table .opt-label input` and `.opt-code input` use `border: 1px solid #e2e8f0` -- hardcoded. No dark override.
- **Fix**: Replace with `var(--color-border)`.

## Issue #6 -- Sketch name mobile display hardcoded white bg
- **Severity**: MEDIUM
- **Type**: dark-mode
- **Line**: 349
- **Problem**: `.sketch-name-display-mobile` uses `background: rgba(255, 255, 255, 0.95)`. Dark override at line 397 exists.
- **Fix**: Base style should use `var(--color-surface)` with opacity fallback. Already fixed by dark override.

## Issue #7 -- Mobile menu close hover hardcoded
- **Severity**: LOW
- **Type**: dark-mode
- **Line**: 829
- **Problem**: `#mobileMenu .mobile-menu-close:hover` uses `background: rgba(0, 0, 0, 0.05)` -- this is fine in light mode but in dark mode the dark override at 6365 handles it.
- **Fix**: Already handled by dark override.

## Issue #8 -- Select elements missing dark mode background
- **Severity**: HIGH
- **Type**: dark-mode
- **Problem**: Generic `select` elements (not just `.btn` selects) may not pick up dark tokens. The dark block at 6430 handles `input[type="text"]`, `input[type="date"]`, `textarea` but does NOT handle plain `select` elements (only `select.btn`).
- **Fix**: Add `select` to the dark mode input override at line 6430.

## Issue #9 -- Home panel close button hover missing dark override
- **Severity**: LOW
- **Type**: dark-mode
- **Problem**: `.home-panel-close:hover` transitions may use light background.
- **Fix**: Already using `var(--color-border)` which adapts. Acceptable.

## Issue #10 -- Admin screen background for project/input-flow settings
- **Severity**: HIGH
- **Type**: dark-mode
- **Problem**: `#adminScreen .panel` uses `var(--color-surface)` which IS a token but the admin settings screen and input flow screen content areas rendered by JS may have inline-style backgrounds or classes without dark overrides.
- **Fix**: Add dark mode overrides for `#adminScreenContent`, `#inputFlowScreenContent`.

## Issue #11 -- Sidebar/Drawer select elements
- **Severity**: HIGH
- **Type**: dark-mode
- **Problem**: Select elements inside `#sidebar` (node panel, edge panel) use default browser styling. Need explicit dark mode for `#sidebar select`.
- **Fix**: Add `#sidebar select` to the dark mode input block.

## Issue #12 -- Focus ring visibility in dark mode
- **Severity**: MEDIUM
- **Type**: dark-mode
- **Problem**: `--ring` and `--focus-ring` use `rgba(37, 99, 235, 0.3)` which works in both modes but the 0.3 opacity may be hard to see against dark backgrounds.
- **Fix**: Increase ring opacity in dark mode to `rgba(96, 165, 250, 0.4)`.

## Issue #13 -- Danger button border hardcoded in sketch actions dark mode
- **Severity**: LOW (already in dark block)
- **Type**: dark-mode
- **Lines**: 7971, 8264, 8273, 8279, 8286
- **Problem**: Several hardcoded hex values inside dark mode blocks (e.g., `#fca5a5`, `#991b1b`, `#475569`, `#2563eb`, `#dc2626`). These should ideally be tokens but since they're already in dark mode blocks, impact is cosmetic only.
- **Fix**: Consider converting to variables but low priority.

## Issue #14 -- Auth loading overlay base uses hardcoded light color
- **Severity**: CRITICAL
- **Type**: dark-mode
- **Line**: 8399
- **Problem**: Before the dark override kicks in, `.auth-loading-overlay` flashes with `rgba(248, 250, 252, 0.9)` -- a nearly white overlay. On slow connections in dark mode, users see a bright white flash.
- **Fix**: Change base to use `var(--color-bg)` with fallback.

---

## Fixes Applied

All fixes committed as a single batch to `styles.css`:
1. Mobile menu hardcoded colors replaced with CSS tokens
2. Option table inputs border updated to use `var(--color-border)`
3. Auth loading overlay updated to use token
4. Soft-blue-header token usage
5. Select elements added to dark mode input block
6. Focus ring dark mode enhancement
7. Admin option-table dark mode
