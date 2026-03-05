# Audit 16 -- User Menu and Profile UI

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape) + 1280x720 (desktop)
**URL**: https://manholes-mapper.vercel.app
**Screenshots**: `app_state_2026-03-01_user_menu/`

---

## Issues Found

### Issue #1 -- User avatar touch target below 44px minimum
- **Severity**: HIGH
- **Type**: touch-target
- **Screenshot**: 05_desktop_home.png, 07_landscape_final.png
- **Affected**: `styles.css` (`.user-avatar`, `.user-menu-trigger`)
- **Problem**: `.user-avatar` and `.user-menu-trigger` are both 36x36px. The minimum touch target for mobile is 44px (per WCAG 2.5.8 / Material Design). On landscape mobile where users tap with thumbs, this is especially problematic.
- **Fix**: Increase `.user-avatar` to 40px and ensure `.user-menu-trigger` has a minimum 44px tappable area via padding.
- **Status**: FIXED (commit 981e73e) -- `.user-menu-trigger` now has `min-width: 44px; min-height: 44px; padding: 2px;`, `.user-avatar` is 40x40px.

### Issue #2 -- Hardcoded `#fff` color in user avatar
- **Severity**: MEDIUM
- **Type**: design-token
- **Affected**: `styles.css` (`.user-avatar`)
- **Problem**: `.user-avatar` uses `color: #fff` instead of a design token. Should use `var(--color-text-on-primary, #fff)` or at least a token reference.
- **Fix**: Add `--color-text-on-primary` token or use existing appropriate token.
- **Status**: FIXED (commit 981e73e) -- `--color-text-on-primary: #ffffff` defined in `:root`, `.user-avatar` now uses `color: var(--color-text-on-primary)`.

### Issue #3 -- Dropdown uses physical `right: 0` instead of logical property
- **Severity**: MEDIUM
- **Type**: RTL
- **Affected**: `styles.css` (`.user-menu-dropdown`)
- **Problem**: Uses `right: 0` with an RTL override `.html[dir="rtl"] .user-menu-dropdown { right: auto; left: 0; }`. Should use `inset-inline-end: 0` for proper RTL support.
- **Fix**: Replace `right: 0` with `inset-inline-end: 0`, remove the RTL override.
- **Status**: FIXED (prior commit) -- `.user-menu-dropdown` uses `inset-inline-end: 0`, no RTL override exists.

### Issue #4 -- `.user-menu-item` uses `text-align: left` instead of logical property
- **Severity**: MEDIUM
- **Type**: RTL
- **Affected**: `styles.css` (`.user-menu-item`)
- **Problem**: Uses `text-align: left` with RTL override `text-align: right`. Should use `text-align: start`.
- **Fix**: Replace `text-align: left` with `text-align: start`, remove RTL override.
- **Status**: FIXED (prior commit) -- `.user-menu-item` uses `text-align: start`, no RTL override exists.

### Issue #5 -- No user role badge in dropdown
- **Severity**: LOW
- **Type**: UX
- **Affected**: `src/main-entry.js` (renderUserMenu), `styles.css`, `src/i18n.js`
- **Problem**: The user menu dropdown shows name and email but no role indicator. Admin/super_admin users have no visual confirmation of their privilege level. Adding a small badge (e.g., "Admin" pill) below the email would improve transparency.
- **Fix**: Add role badge to user menu header, add i18n translations for role names, add CSS for role badge styling.
- **Status**: FIXED (prior commit) -- `renderUserMenu()` in `main-entry.js` renders a `.user-menu-role` badge with role-specific CSS classes (`--admin`, `--super-admin`, `--user`). i18n keys `auth.roleUser`/`auth.roleAdmin`/`auth.roleSuperAdmin` present in both `he` and `en`.

### Issue #6 -- Dropdown may be clipped in landscape when header auto-shows
- **Severity**: LOW
- **Type**: layout
- **Affected**: `styles.css` (`.user-menu-dropdown`)
- **Problem**: At 812x375 landscape, the header auto-hides. When revealed, the dropdown opens below the header but the viewport is only 375px tall. The dropdown (123px) could potentially clip at the bottom. Adding `max-height` with overflow or adjusting positioning would help.
- **Fix**: Add `max-height: calc(100vh - 60px)` and `overflow-y: auto` to dropdown.
- **Status**: FIXED (prior commit) -- `.user-menu-dropdown` has `max-height: calc(100vh - 70px)` and `overflow-y: auto`.

### Issue #7 -- Missing hover/focus styles for accessibility
- **Severity**: MEDIUM
- **Type**: a11y
- **Affected**: `styles.css` (`.user-menu-trigger`)
- **Problem**: The user menu trigger button has no visible focus indicator and no hover effect to indicate it is interactive.
- **Fix**: Add focus-visible outline and hover background.
- **Status**: FIXED (prior commit) -- `.user-menu-trigger:hover` has `background: rgba(0, 0, 0, 0.06)` (light) / `rgba(255, 255, 255, 0.08)` (dark), `.user-menu-trigger:focus-visible` has `outline: 2px solid var(--color-primary)` with `outline-offset: 2px`.

### Issue #8 -- Sign out button should have confirmation
- **Severity**: LOW
- **Type**: UX / best-practice
- **Affected**: `src/main-entry.js` (signOutBtn click handler)
- **Problem**: Clicking "Sign Out" immediately signs out without confirmation. This is a destructive action that clears local data. Per best practices, destructive actions should have confirmation.
- **Fix**: Add a confirmation step (e.g., window.confirm or inline confirm button).
- **Status**: DEFERRED (low priority, would change UX flow)

---

## Summary
- **CRITICAL**: 0
- **HIGH**: 1 (touch target) -- FIXED
- **MEDIUM**: 4 (design tokens, RTL x2, a11y) -- ALL FIXED
- **LOW**: 3 (role badge, dropdown clipping, sign out confirmation) -- 2 FIXED, 1 DEFERRED
- **Total**: 8 issues (7 FIXED, 1 DEFERRED)
- **Resolved by**: commit 981e73e and prior commits on `dev` branch
