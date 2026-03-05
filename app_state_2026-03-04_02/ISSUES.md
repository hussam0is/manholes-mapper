# Design Audit — 2026-03-04 Iteration 2

## Issues Found from Screenshot Analysis

### Issue #1 — Edge legend text not translated in English mode
- **Severity**: HIGH
- **Type**: i18n bug
- **Screenshot**: 55_F_english.png
- **Affected**: `src/i18n.js`, `src/legacy/main.js`
- **Problem**: When language is switched to English, edge legend still shows Hebrew ("קו ראשי", "קו סניקה", "קו משני"). The legend labels are not using i18n keys.
- **Status**: OPEN

### Issue #2 — Dark mode edge legend has no text labels
- **Severity**: HIGH
- **Type**: design/dark-mode
- **Screenshot**: 58_F_dark_canvas.png
- **Affected**: `styles.css`
- **Problem**: In dark mode, the edge legend in top-right shows colored squares but the text labels are nearly invisible (dark text on dark background).
- **Status**: OPEN

### Issue #3 — Header toolbar is overcrowded on desktop
- **Severity**: MEDIUM
- **Type**: design/ux
- **Screenshot**: 50_A_home_panel.png, 51_B_canvas_empty.png
- **Affected**: `styles.css`, `index.html`
- **Problem**: Desktop header packs language toggle, 4 icon buttons, grid toggle, size +/-, search bar, autosave toggle, and save button all in one row. No visual grouping or separators. Icons lack tooltips.
- **Status**: OPEN

### Issue #4 — Canvas toolbar feels disconnected from light theme
- **Severity**: MEDIUM
- **Type**: design
- **Screenshot**: 51_B_canvas_empty.png
- **Affected**: `styles.css`
- **Problem**: The left canvas toolbar uses a very dark background (#1e293b) while the rest of the app is light. Creates visual disconnection. The selected mode button (blue ring) is subtle.
- **Status**: OPEN

### Issue #5 — Mobile menu sections lack visual hierarchy
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 62_E_mobile_menu_top.png
- **Affected**: `styles.css`, `src/main-entry.js`
- **Problem**: Menu sections ("הסקיצות שלי", "חיפוש", "גודל אלמנטים", etc.) all look the same. No section grouping, separators, or visual weight differentiation. Hard to scan quickly.
- **Status**: OPEN

### Issue #6 — Home panel project cards are basic
- **Severity**: MEDIUM
- **Type**: design
- **Screenshot**: 50_A_home_panel.png, 60_E_mobile_home.png
- **Affected**: `styles.css`, `src/legacy/main.js`
- **Problem**: Project cards are plain white boxes with just a name, description, and "פתח פרויקט" button. No thumbnails, sketch counts, or metadata previews. The folder icons are generic.
- **Status**: OPEN

### Issue #7 — Empty canvas state has no onboarding guidance
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 51_B_canvas_empty.png
- **Affected**: `styles.css`, `index.html`, `src/i18n.js`
- **Problem**: When canvas is empty (no nodes/edges), users see only a grid with no hint about what to do. No "click to add a node" or "use the toolbar to start" messaging.
- **Status**: OPEN

### Issue #8 — Admin panel tabs cramped on mobile
- **Severity**: MEDIUM
- **Type**: design/mobile
- **Screenshot**: 65_E_mobile_admin.png
- **Affected**: `styles.css`, `src/admin/admin-panel.js`
- **Problem**: Admin tab bar (eye, grid, people, folder, settings icons) is cramped. The active tab indicator is subtle. Below that, the Nodes/Edges toggle buttons are too wide for the descriptive text beneath.
- **Status**: OPEN

### Issue #9 — Dark mode home panel contrast
- **Severity**: MEDIUM
- **Type**: design/dark-mode
- **Screenshot**: 66_E_mobile_dark.png
- **Affected**: `styles.css`
- **Problem**: Dark mode home panel has project cards with dark background but the blue "פתח פרויקט" buttons use same blue as light mode — contrast is acceptable but the card borders are barely visible.
- **Status**: OPEN
