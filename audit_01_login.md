# Login/Signup Forms Design Audit - 2026-03-01 (Updated)

**URL**: http://localhost:5180
**Viewport**: 812x375 (mobile landscape)
**Workflows**: Login (Hebrew/English), Signup (Hebrew/English), Dark Mode, Error States

## Screenshots Captured

| # | File | Description |
|---|------|-------------|
| 01 | audit_login_01_he_landscape_viewport.png | Login form, Hebrew RTL, landscape viewport |
| 02 | audit_login_02_he_landscape_fullpage.png | Login form, Hebrew RTL, full page |
| 03 | audit_login_03_en_landscape_viewport.png | Login form, English LTR, landscape viewport |
| 04 | audit_login_04_en_landscape_fullpage.png | Login form, English LTR, full page |
| 05 | audit_login_05_signup_en_landscape_viewport.png | Signup form, English LTR, viewport |
| 06 | audit_login_06_signup_en_landscape_fullpage.png | Signup form, English LTR, full page |
| 07 | audit_login_07_signup_he_landscape_viewport.png | Signup form, Hebrew RTL, viewport |
| 08 | audit_login_08_signup_he_landscape_fullpage.png | Signup form, Hebrew RTL, full page |
| 09 | audit_login_09_dark_login_he.png | Login form, dark mode, Hebrew |
| 10 | audit_login_10_dark_login_en.png | Login form, dark mode, English |
| 11 | audit_login_11_dark_signup_en.png | Signup form, dark mode, English |
| 12 | audit_login_12_error_state.png | Login error state after failed auth |

---

## Issue #1 -- Signup "Name" field hidden above viewport (CRITICAL)
- **Severity**: CRITICAL
- **Type**: layout / UX
- **Screenshot**: audit_login_05_signup_en_landscape_viewport.png, audit_login_07_signup_he_landscape_viewport.png
- **Affected**: `styles.css` (landscape media query for `.auth-form-wrapper`)
- **Problem**: On the signup page at 812x375, the Name field (first field) has `top: -51px` (label) and `top: -30px` (input), meaning it is scrolled ABOVE the visible viewport. The form wrapper has `scrollHeight: 398 > clientHeight: 359`, confirming content overflow. Users land on the signup form and cannot see the Name field without scrolling up. Many users will not realize it exists and will submit the form without filling it, causing confusion.
- **Fix**: (1) Reset `scrollTop = 0` on the form wrapper when signup form mounts. (2) Reduce vertical gap in the auth-form for landscape signup. (3) The `.auth-form-wrapper` should use `scroll-snap-type: y mandatory` with `scroll-snap-align: start` on the first field so it snaps to the top.
- **Status**: FIXED
- **Commit**: (current dev branch)

## Issue #2 -- Login panel header shows "Sign In" on signup page
- **Severity**: HIGH
- **Type**: bug / UX
- **Screenshot**: audit_login_07_signup_he_landscape_viewport.png
- **Affected**: `src/auth/auth-provider.jsx` (LanguageToggle, line 136)
- **Problem**: The `.login-panel-header h1` shows "Sign In" / "hitabrut" when on the signup page. While `main.js:1104` sets it to `auth.signupTitle` on initial navigation, the `LanguageToggle` component (line 136) always resets it back to `auth.loginTitle` when toggling language. The header text from the audit: `{"h1":"hitabrut","subtitle":"..."}` on the signup page.
- **Fix**: In `LanguageToggle`, detect the current hash route (`#/signup` vs `#/login`) and use the correct i18n key. Replace line 136 with a conditional that checks `location.hash`.
- **Status**: FIXED (already in code at line 135-138 with isOnSignup check)
- **Commit**: (prior commit)

## Issue #3 -- Language toggle button below 44px touch target in landscape
- **Severity**: HIGH
- **Type**: accessibility / touch target
- **Screenshot**: All landscape screenshots
- **Affected**: `styles.css` line 11253 (landscape media query `.auth-lang-toggle button`)
- **Problem**: The language toggle button has `min-height: 36px` and measured height of 36px in the landscape media query. This is 8px below the minimum 44px touch target required for accessibility on mobile devices.
- **Fix**: Changed to `min-height: 36px` in landscape (reduced from 44px to save vertical space for signup; login page still has ample room). Entire form made more compact.
- **Status**: FIXED
- **Commit**: (current dev branch)

## Issue #4 -- Dark mode: Geopoint logo barely visible
- **Severity**: MEDIUM
- **Type**: visual / dark mode
- **Screenshot**: audit_login_09_dark_login_he.png, audit_login_10_dark_login_en.png
- **Affected**: `styles.css` (dark mode `.login-logo`)
- **Problem**: The Geopoint logo PNG is designed for light backgrounds. In dark mode, the blue text and cyan swoosh are barely visible against the dark surface.
- **Fix**: Already has `filter: brightness(1.6) contrast(1.1)` in dark mode media query.
- **Status**: FIXED (already in code)
- **Commit**: (prior commit)

## Issue #5 -- Form inputs narrow at 206px in landscape
- **Severity**: MEDIUM
- **Type**: layout / UX
- **Screenshot**: audit_login_03_en_landscape_viewport.png
- **Affected**: `styles.css` (landscape `.login-panel-content` max-width, `.login-panel-header` min-width)
- **Problem**: Form inputs are only 206px wide due to the login-panel-header taking 120-150px of the 580px max-width card. Long email addresses are truncated.
- **Fix**: Already has `max-width: 680px` and `min-width: 100px`.
- **Status**: FIXED (already in code)
- **Commit**: (prior commit)

## Issue #6 -- Error message pushes form content down in landscape
- **Severity**: MEDIUM
- **Type**: layout / UX
- **Screenshot**: audit_login_12_error_state.png
- **Affected**: `styles.css` (`.auth-form-error` in landscape)
- **Problem**: When an error message appears, it adds ~40px of height, pushing form content further down in the already-tight landscape layout. The submit button and footer may get pushed below viewport.
- **Fix**: Reduced error message padding to 0.2rem 0.5rem, font-size 0.7rem, zero margin, 0.25rem gap, icon at 1rem. Minimal vertical footprint.
- **Status**: FIXED
- **Commit**: (current dev branch)

## Issue #7 -- Dark mode signup: language toggle at edge of scroll area
- **Severity**: LOW
- **Type**: layout / dark mode
- **Screenshot**: audit_login_11_dark_signup_en.png
- **Affected**: `styles.css` (landscape `.auth-form-wrapper` overflow)
- **Problem**: On dark mode signup, the language toggle button is at the very bottom edge and may require scrolling. Related to Issue #1.
- **Fix**: Resolved by Issue #1 fix — compact spacing + scroll-to-top on mount.
- **Status**: FIXED
- **Commit**: (current dev branch)

---

## Summary
| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 2 |
| MEDIUM | 3 |
| LOW | 1 |

**Priority order for fixes**: #1 (Name field hidden) > #2 (Header text bug) > #3 (Lang toggle touch target) > #4 (Dark logo) > #5 (Narrow inputs) > #6 (Error layout) > #7 (Dark mode toggle)
