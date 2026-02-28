# Login/Signup Forms Design Audit

**Date**: 2026-03-01
**Viewport**: 812x375 (mobile landscape), 375x812 (portrait), 640x360 (narrow landscape)
**URL**: https://manholes-mapper.vercel.app
**Screenshots**: `app_state_2026-03-01_login/`

---

## Issue #1 -- Signup form requires scroll in landscape; Name field cut off at top
- **Severity**: HIGH
- **Type**: UX / layout
- **Screenshot**: 04_signup_landscape.png, 05_signup_landscape_full.png
- **Affected**: `styles.css` (landscape media query for auth forms)
- **Problem**: In 812x375 landscape, the signup form has scrollHeight=421 but clientHeight=359, meaning 62px overflow. The Name field is partially cut off at the top of the visible form area. Users may not realize they need to scroll UP to see the first field, especially on touch devices where scroll affordance is subtle. The landscape signup form has 4 fields + 2 password toggles + submit + footer + language toggle, which doesn't fit in 359px height.
- **Fix**: Reduce vertical spacing further in landscape signup. Consider making the form gap even tighter (0.3rem), reducing field label sizes, or making the auth-form-wrapper use scroll-snap so the name field is visible by default. Ensure the form scrolls to top on mount.
- **Status**: OPEN
- **Commit**: --

## Issue #2 -- Error messages from server always in English, breaking Hebrew UI
- **Severity**: HIGH
- **Type**: i18n / bug
- **Screenshot**: 06_login_error.png
- **Affected**: `src/auth/auth-provider.jsx` (line 133)
- **Problem**: When login fails, the error message "Invalid email or password" comes from the Better Auth server and is always in English. In the Hebrew UI, this creates a jarring mixed-language experience. The code uses `signInError.message || tt('auth.signInFailed')` but since the server always returns a message, the Hebrew translation is never used.
- **Fix**: Map known server error messages to i18n keys. If `signInError.message` matches common patterns like "Invalid email or password", "User not found", etc., use the translated version instead. Fallback to the raw server message only for unknown errors.
- **Status**: OPEN
- **Commit**: --

## Issue #3 -- Language toggle does not work on login page
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 01_login_he_landscape.png vs 03_login_en_landscape.png (identical)
- **Affected**: `src/auth/auth-provider.jsx` (LanguageToggle component, lines 81-113)
- **Problem**: Clicking the language toggle button on the login page does not switch the UI language. Screenshots 01 and 03 are visually identical -- the form fields, labels, and placeholders remain in Hebrew after clicking the "English" toggle. The toggle dispatches a change event on `#languageSelect`, but that select element may not exist or may not be connected to the i18n system when on the login page (since main app UI is hidden).
- **Fix**: The LanguageToggle should directly call the i18n setLanguage function and re-render the form. After changing the language, it should update the `document.documentElement.lang` and `dir` attributes, then force a re-render of the React form so all `tt()` calls pick up the new language.
- **Status**: OPEN
- **Commit**: --

## Issue #4 -- Form labels too small in landscape (11.2px / 0.7rem)
- **Severity**: MEDIUM
- **Type**: accessibility / readability
- **Screenshot**: 01_login_he_landscape.png, 04_signup_landscape.png
- **Affected**: `styles.css` (line 11167-11168, landscape media query)
- **Problem**: The `.auth-form-field label` is set to `font-size: 0.7rem` (11.2px) in the landscape media query. This is below the WCAG recommended minimum of 12px for body text. The labels "email", "password", etc. are already short words so they wouldn't overflow at a larger size. This especially hurts readability in bright outdoor conditions (field surveying app).
- **Fix**: Increase label font-size to at least 0.75rem (12px) in the landscape media query. The 0.7rem was over-optimized for space.
- **Status**: OPEN
- **Commit**: --

## Issue #5 -- No visible scroll indicator on signup form in landscape
- **Severity**: MEDIUM
- **Type**: UX
- **Screenshot**: 04_signup_landscape.png
- **Affected**: `styles.css` (`.auth-form-wrapper` overflow)
- **Problem**: The signup form needs scrolling but there's no visible scrollbar or fade-out gradient to indicate more content exists below/above. On mobile devices with no visible scrollbar, users may miss the Name field entirely. The form wrapper has `overflow-y: auto` but browsers typically hide scrollbars on touch devices.
- **Fix**: Add a subtle bottom/top gradient fade overlay on the form wrapper when scrollable, or add a small scrollbar-visible CSS rule. Alternatively, ensure the form auto-scrolls to the first field on mount.
- **Status**: OPEN
- **Commit**: --

## Issue #6 -- Form field width only 180px in landscape -- cramped for email
- **Severity**: LOW
- **Type**: UX / layout
- **Screenshot**: 01_login_he_landscape.png
- **Affected**: `styles.css` (`.auth-form-container` padding, `.login-panel-content` max-width)
- **Problem**: The form container padding is 8px 16px in landscape, and the login-panel-header takes 186px of the 580px card width, leaving only ~212px for the form container, minus padding = 180px field width. Long email addresses will be truncated. This is functional but not ideal.
- **Fix**: Consider reducing the header side panel width from min-width:140px to 120px, or reducing the header max-width from 170px, to give the form more horizontal space.
- **Status**: OPEN
- **Commit**: --

## Issue #7 -- Password toggle icon "visibility" text leaks if Material Icons fail to load
- **Severity**: LOW
- **Type**: resilience
- **Screenshot**: N/A (not observed in current screenshots)
- **Affected**: `src/auth/auth-provider.jsx` (PasswordField component)
- **Problem**: If material-icons font fails to load, the password toggle shows raw text "visibility" or "visibility_off" which is confusing. The icon is inside a `<span className="material-icons">` but there's no aria-hidden or fallback.
- **Fix**: Add `aria-hidden="true"` to the icon span (the button already has an aria-label). Consider adding a text fallback or SVG fallback for the icon.
- **Status**: OPEN
- **Commit**: --

---

## Summary
| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 2 |
| LOW | 2 |

**Priority order for fixes**: #2 (error i18n) > #3 (language toggle) > #1 (signup scroll) > #4 (label size) > #5 (scroll indicator) > #6 (field width) > #7 (icon fallback)
