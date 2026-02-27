# Manholes Mapper — Design Audit Issue Tracker

Auto-maintained by the `design-audit-loop` skill. Each iteration reads screenshots, finds issues, fixes them, and updates this file.

---

## Last Processed
- **Batch 1**: Screenshots 01–20 (processed 2026-02-27)
- **Batch 2**: Screenshots 21–40 (processed 2026-02-27)
- **Batch 3**: Screenshots 41–59 (pending)

---

## Summary

| Severity | Total | Fixed | Open |
|----------|-------|-------|------|
| CRITICAL | 1 | 0 | 1 (not app bug) |
| HIGH | 9 | 3 | 6 |
| MEDIUM | 16 | 0 | 16 |
| LOW | 10 | 0 | 10 |
| **TOTAL** | **36** | **3** | **33** |

---

## CRITICAL Issues

### Issue #1 — Debug Diagnostic Bar Visible in Production
- **Severity**: CRITICAL
- **Type**: bug
- **Screenshot**: 01_project_canvas_sketch_panel.png (and all others — it's on every screen)
- **Affected**: `index.html`, `styles.css`, `src/legacy/main.js`
- **Problem**: The debug bar at the very top of the app (showing `P:0/1  dX: -17.1  dY: -376.2  Xv: 0.005  Yv: -0.139  Prs: 1.0  Size: 0.12` with a red-highlighted `Size` cell) is visible in ALL production screenshots. This is a developer diagnostic overlay that should never be visible to end users. It is unprofessional, wastes 30px of vertical space, and exposes internal state.
- **Fix**: The bar is Android's "Show pointer location" developer option active on the test phone. Disable via: Phone Settings → Developer Options → Pointer location (off). No app code change needed.
- **Status**: NOT AN APP BUG
- **Commit**: —

---

## HIGH Issues

### Issue #2 — Measure Button Red Color Signals Danger
- **Severity**: HIGH
- **Type**: design
- **Screenshot**: 02_main_canvas_clean.png, 16_canvas_fab_toolbar_bottom_buttons.png
- **Affected**: `styles.css`, `index.html`
- **Problem**: The "Measure" (Live Measure / GNSS) button at the bottom-left is a large red pill. Red is universally associated with danger, errors, or destructive actions. A feature activation button should not be red. When Live Measure is active, users see a red button and a red GPS toolbar icon simultaneously — confusing.
- **Fix**: Change `#liveMeasureBtn` background from red/danger to the app's primary blue or a teal/green to signal "location/GPS active". When active, use a filled primary color; when inactive, use outlined/ghost style.
- **Status**: FIXED
- **Commit**: `01c960d — "fix: change no-fix GNSS color from red to gray"`

### Issue #3 — GPS Toolbar Button Has Alarming Red Active State
- **Severity**: HIGH
- **Type**: design
- **Screenshot**: 02_main_canvas_clean.png, 14_canvas_toolbar_visible_nodemode_edgemode_zoom.png
- **Affected**: `styles.css`
- **Problem**: When Live Measure is active, the GPS toolbar button (top of right-side toolbar) shows a full red background square. This looks like an error state, not an "active/enabled" state. Users associate red with "stop" or "error".
- **Fix**: Change the active GPS button style from `background: red` to a green/teal active indicator (e.g., `background: var(--color-success)` or a blue ring/border). Alternatively, use a pulsing green dot overlay to signal "GPS is active and tracking".
- **Status**: FIXED
- **Commit**: `01c960d — "fix: change no-fix GNSS color from red to gray"`

### Issue #4 — Menu Does Not Reset Scroll Position on Open (BUG)
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 15_menu_open_top_scrolled.png, 17_menu_at_top_home_button_visible.png
- **Affected**: `src/main-entry.js`, `src/legacy/main.js`
- **Problem**: When the hamburger menu is closed and reopened, it remembers its previous scroll position. The "Home" and "New Sketch" items (most commonly used) are at the top of the menu and are scrolled out of view. Users must scroll up to find them.
- **Fix**: Find the menu open handler (where `#mobileMenu` becomes visible) and add `document.getElementById('mobileMenu').querySelector('.menu-scroll-container, ul, .menu-items').scrollTop = 0` before showing the menu. Or use `scrollTop = 0` on the scrollable container.
- **Status**: FIXED
- **Commit**: `e33ce41 — "fix: reset mobile menu scroll to top on open so Home/New Sketch are visible"`

### Issue #5 — Sketch Side Panel Too Wide on Mobile
- **Severity**: HIGH
- **Type**: ux
- **Screenshot**: 01_project_canvas_sketch_panel.png, 12_project_canvas_sketch_list_panel.png
- **Affected**: `styles.css`, `src/project/sketch-side-panel.js`
- **Problem**: The sketch side panel in project canvas mode takes approximately 60% of the screen width on mobile, leaving only 40% for the canvas. This makes it impossible to see the sketch network while reviewing the sketch list. Field workers need to see the map while selecting sketches.
- **Fix**: Reduce the sketch side panel width on mobile. Target: ~50% max on screens < 480px, or use a bottom sheet layout instead of right-side panel. Minimum canvas visibility should be 50% at all times.
- **Status**: ALREADY OK — CSS uses bottom drawer layout on mobile (height: 40vh), not side panel
- **Commit**: —

### Issue #6 — Toolbar Numbers Overlapping Canvas (z-index / overflow)
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 01_project_canvas_sketch_panel.png
- **Problem**: In screenshot 01, the right-side canvas toolbar shows node numbers ("72, 79, 52..." etc.) bleeding through/overlapping the toolbar buttons area. This appears to be a z-index issue where canvas content renders on top of the toolbar, or the toolbar background is transparent.
- **Affected**: `styles.css` (toolbar z-index, background)
- **Fix**: Ensure `.canvas-toolbar` or `#modeGroup` has `background: var(--color-surface)` and sufficient `z-index` (e.g., `z-index: 100`) to appear above the canvas element.
- **Status**: OPEN
- **Commit**: —

### Issue #7 — Delete Node/Edge Button Too Prominent and Dangerous
- **Severity**: HIGH
- **Type**: best-practice
- **Screenshot**: 39_edge_panel_open.png, 28_node_panel_open_manhole_350.png
- **Affected**: `styles.css`, `index.html`, `src/legacy/main.js`
- **Problem**: The "Delete Node" button is a large, full-width red button at the bottom of the node/edge panel — very easy to tap accidentally on mobile. There is no confirmation dialog shown in the screenshots, making this a data-loss risk. Destructive actions should require confirmation.
- **Fix**: (1) Add a confirmation dialog before deleting (e.g., `"Delete this manhole? This cannot be undone."` with Cancel / Delete). The undo button exists but users may not know to use it. (2) Make the button smaller, ghost-style with red text only, or move it behind a "More actions" menu.
- **Status**: ALREADY OK — confirm() dialogs already exist for deleteNode and deleteEdge
- **Commit**: —

---

## MEDIUM Issues

### Issue #8 — Issues Badge Has No Severity Color Coding
- **Severity**: MEDIUM
- **Type**: design
- **Screenshot**: 01_project_canvas_sketch_panel.png, 12_project_canvas_sketch_list_panel.png
- **Problem**: All issue badges on sketch rows show the same red warning style regardless of severity (e.g., 99 issues vs 164 issues are visually identical). High-issue-count sketches should be more visually distinct.
- **Fix**: Color-code badges: > 100 issues = red, 50-100 = orange, < 50 = yellow. Or add a tooltip showing issue breakdown by type.
- **Status**: OPEN
- **Commit**: —

### Issue #9 — Edge Labels Overlap Badly at High Density
- **Severity**: MEDIUM
- **Type**: performance/ux
- **Screenshot**: 13_canvas_with_sketch_loaded_network_visible.png
- **Problem**: When zoomed out to overview level, edge length labels (e.g., "3.5m", "5.36m", "7.00m") overlap each other in dense areas, making them completely unreadable. The canvas has dozens of overlapping text strings.
- **Fix**: Hide edge labels below a certain zoom threshold (e.g., `viewScale < 0.3`). Already partially tracked in `label-collision.js` — ensure it's properly applied to edge labels. Consider adding a "labels on/off" toggle.
- **Status**: OPEN
- **Commit**: —

### Issue #10 — Admin Panel Shows Raw Field Names (id, type, note)
- **Severity**: MEDIUM
- **Type**: ux/design
- **Screenshot**: 59_admin_panel_opened.png
- **Problem**: The Admin Settings → Fields to export (CSV) section shows raw database field names: `id`, `type`, `note`, `material`, `cover_diameter`. These are not human-friendly. The Hebrew-speaking field team would see `id`, `cover_diameter` and not understand what to enable/disable.
- **Fix**: Map each field key to a display label using i18n. E.g., `id` → "Node ID", `type` → "Type", `cover_diameter` → "Cover Diameter". This label should come from the translation file so it works in both Hebrew and English.
- **Status**: OPEN
- **Commit**: —

### Issue #11 — Project Home Cards Missing Sketch Count and Last Modified
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 11_home_projects_panel_select_project.png
- **Problem**: Project cards in the home panel show only the project name and an "Open Project" button. They don't show how many sketches are in the project or when it was last modified. Field workers need this info to quickly identify the right project.
- **Fix**: Add sketch count and last-modified date to project cards. This data should come from the `/api/projects` API response (which returns `sketch_count` or can be joined). Display as: "12 sketches · Last updated Feb 27"
- **Status**: OPEN
- **Commit**: —

### Issue #12 — Admin/Project Menu Items Don't Indicate Role Requirement
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 10_menu_survey_workday_settings_admin.png
- **Problem**: "Admin Settings" and "Project Management" links in the menu have no visual indicator that they require elevated permissions. A regular user who sees these items and taps them will get an access denied error with no explanation.
- **Fix**: Either (a) hide admin links from non-admin users in the menu, or (b) add a lock icon and tooltip "Admin only" next to them. Preferred: hide them since they're already role-gated in the API.
- **Status**: OPEN
- **Commit**: —

### Issue #13 — Menu Very Long / No Quick Jump to Sections
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 04–10 (menu screenshots)
- **Problem**: The menu has 12+ sections and requires significant scrolling to reach Survey/Settings/Admin sections. Combined with the scroll-reset bug (#4), this makes the menu hard to navigate for experienced users who know what they want.
- **Fix**: Consider adding a quick-access section icon bar at the top of the menu (like a mini nav with icons for Navigation / Data / Map / Survey / Settings) that jump-scrolls to that section. Or collapse sections by default with expand-on-tap.
- **Status**: OPEN
- **Commit**: —

---

## LOW Issues

### Issue #14 — Layers Panel Position Overlaps Canvas Awkwardly
- **Severity**: LOW
- **Type**: design
- **Screenshot**: 03_layers_panel_open.png
- **Problem**: The Layers floating panel appears centered-left on screen, partially covering the canvas content and the GNSS location marker. On mobile, the panel position is not intuitive.
- **Fix**: Anchor the Layers panel to the top-left where the layers button is, or make it a bottom sheet on mobile.
- **Status**: OPEN
- **Commit**: —

### Issue #15 — No Zoom +/- Buttons on Canvas
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 02_main_canvas_clean.png, 14_canvas_toolbar_visible_nodemode_edgemode_zoom.png
- **Problem**: Zoom is pinch-gesture only. Field workers wearing gloves or using a stylus cannot pinch-zoom. Zoom In / Zoom Out actions exist in the menu but not as quick-access canvas buttons.
- **Fix**: The menu already has "Zoom in" and "Zoom out" items (screenshot 04). Consider adding small +/- buttons to the canvas toolbar or making them accessible via long-press on FAB.
- **Status**: OPEN
- **Commit**: —

### Issue #16 — Stretch/Scale Settings Too Technical for General Menu
- **Severity**: LOW
- **Type**: ux/ia
- **Screenshot**: 07_menu_coords_stretch_maplayer.png
- **Problem**: "Horizontal Stretch", "Vertical Stretch", "Reset Stretch", and "Scale: 1:50" stepper controls are in the main menu. These are highly technical coordinate calibration settings that only power users/admins need. They clutter the menu for regular field workers.
- **Fix**: Move Stretch/Scale settings to Admin Settings panel (already exists at `#/admin`). Regular users should never see these.
- **Status**: OPEN
- **Commit**: —

### Issue #17 — "Finish Workday" Naming Unclear
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 09_menu_livemeasure_survey_workday_settings.png
- **Problem**: "Finish Workday" is not self-explanatory. New users don't know it exports all the day's sketches. The icon is generic.
- **Fix**: Add a subtitle below: "Export all today's sketches" or change label to "End Day & Export". Add a tooltip or info icon that explains the action.
- **Status**: OPEN
- **Commit**: —

---

## Batch 2 Issues (Screenshots 21–40)

### Issue #18 — GNSS "No Fix" Info Box Lacks Visual Hierarchy
- **Severity**: MEDIUM
- **Type**: design
- **Screenshot**: 21_canvas_clean_network_overview.png, 22_canvas_toolbar_gps_active_red.png
- **Problem**: The GNSS info box shows "No Fix +/-120.6m", HDOP, elevation, and raw ITM coordinates at identical font size/weight with a red border. Field workers glancing down need fix quality at a glance, not four lines of technical data. Red border on a plain state implies error.
- **Fix**: (1) Make fix quality status larger/bolder with color-coded badge. (2) Collapse detail lines behind expandable tap. (3) Use gray background for "No Fix" state, not red border.
- **Status**: OPEN
- **Commit**: —

### Issue #19 — GNSS Accuracy Circle Enormous When No Fix — Dominates Canvas
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 21_canvas_clean_network_overview.png, 22_canvas_toolbar_gps_active_red.png
- **Problem**: With poor accuracy (e.g. ±120.6m), the accuracy circle takes ~40% of visible canvas, obscuring the network below. Dashed pink circle with red dot looks broken.
- **Fix**: (1) Cap visual radius at max 150px screen diameter regardless of accuracy. (2) Reduce opacity for No Fix states. (3) Hide the accuracy circle entirely when fix quality is 0 (No Fix).
- **Status**: OPEN
- **Commit**: —

### Issue #20 — "STALE" Badge Appears With No Explanation or Translation
- **Severity**: MEDIUM
- **Type**: ux/i18n
- **Screenshot**: 23_canvas_node_mode_active_toolbar_highlight.png
- **Problem**: Yellow "STALE" badge near GNSS marker has no tooltip or legend. The word is English-only — not translated to Hebrew, breaking RTL/i18n contract.
- **Fix**: (1) Add "STALE" to i18n with Hebrew translation ("ישן" / "לא עדכני"). (2) Add subtitle "Position outdated" / "מיקום לא עדכני". (3) Add STALE to GNSS legend.
- **Status**: OPEN
- **Commit**: —

### Issue #21 — Mode-Change Toast Overlaps Legend Bar
- **Severity**: LOW
- **Type**: design
- **Screenshot**: 23_canvas_node_mode_active_toolbar_highlight.png, 26_node_mode_manhole_active.png
- **Problem**: "Node mode" toast appears at canvas top, overlapping the color legend ("Main Line / Drainage Line / Secondary Line"). Opaque green toast clashes with white legend background.
- **Fix**: Position mode-change toast below legend bar (top: 140px), or use the existing bottom-of-screen toast area.
- **Status**: OPEN
- **Commit**: —

### Issue #22 — Node Type Dialog Not Appearing on Manual Canvas Tap
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 24_node_type_dialog_select_manhole.png, 27_after_tap_canvas_in_nodemode.png
- **Problem**: Screenshot titled "node_type_dialog" shows no dialog — node was created without type selection. Nodes are placed on canvas tap without requiring type selection in some scenarios, leading to unclassified nodes and data quality issues.
- **Fix**: Verify node type selection dialog triggers on every new node creation in Node Mode (not just TSC3 survey points). At minimum, default to "Manhole" but still show the type selector.
- **Status**: OPEN
- **Commit**: —

### Issue #23 — Canvas Toolbar Buttons Have No Labels, Tooltips, or Aria-Labels
- **Severity**: HIGH
- **Type**: accessibility/ux
- **Screenshot**: 21_canvas_clean_network_overview.png, 34_canvas_after_cancel_dialog.png
- **Problem**: 6 toolbar buttons show only Material Icons with no text labels, no long-press tooltips, no aria-label attributes. New field workers cannot determine what circle=Node, droplet=Drainage, trending-up=Edge, home=House Connection. App is inaccessible to screen readers.
- **Fix**: (1) Add aria-label to all toolbar buttons. (2) Add title attributes for tooltips. (3) Consider adding 3-4 char text labels below each icon within the toolbar. (4) On first launch, show a brief overlay tutorial.
- **Status**: OPEN
- **Commit**: —

### Issue #24 — FAB Speed-Dial Menu Screenshot Mislabeled (FAB Not Expanded)
- **Severity**: LOW
- **Type**: bug (screenshot)
- **Screenshot**: 30_fab_menu_expanded.png
- **Problem**: Screenshot 30 ("fab_menu_expanded") shows project canvas with sketch panel, not the FAB menu expanded. FAB speed-dial design cannot be audited from this batch.
- **Fix**: Re-capture screenshot 30 with FAB menu actually expanded. Also investigate if FAB fails to open when project canvas panel is active.
- **Status**: OPEN
- **Commit**: —

### Issue #25 — Issue List in Sketch Panel Shows All Issues as Identical Rows
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 31_canvas_navigated_to_active_sketch.png, 32_canvas_full_network_zoomed_in.png
- **Problem**: Every issue row shows the same: red pin icon + node number + "Missing coordinates". No grouping, no filtering, no differentiation between issue types. 87+ identical rows are overwhelming and unhelpful.
- **Fix**: (1) Group issues by type with collapsible headers ("Missing coordinates (45)", "Missing measurements (32)", "Long pipes (10)"). (2) Different icon colors per type. (3) Filter/sort dropdown. (4) Summary counts bar at top.
- **Status**: OPEN
- **Commit**: —

### Issue #26 — Exit App Dialog Uses Generic Browser Style (Not i18n)
- **Severity**: LOW
- **Type**: design/i18n
- **Screenshot**: 33_exit_app_dialog.png
- **Problem**: "Exit the app?" is a plain Android system dialog, English-only, not translated to Hebrew. "OK" button is vague — should say "Exit".
- **Fix**: (1) Replace native confirm() with styled app modal matching design system. (2) Translate text and buttons. (3) Change "OK" → "Exit"/"יציאה", "CANCEL" → "Stay"/"הישאר".
- **Status**: OPEN
- **Commit**: —

### Issue #27 — Panel Title "Details" Is Generic — Should Show Element Identity
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 35_node_panel_open_existing_manhole.png, 40_node_panel_top_with_survey_data.png
- **Problem**: Node/edge details panel always shows "Details" as its title. User cannot see which node/edge they are editing without scrolling down to find "Node ID: 280". When scrolled, context is lost entirely.
- **Fix**: Change panel title to contextual: "Node 280" / "Manhole #280" for nodes, "Edge 145 → 146" for edges. Dynamic based on selected element.
- **Status**: OPEN
- **Commit**: —

### Issue #28 — "OK" Badge in Node Panel Has Unclear Purpose
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 35_node_panel_open_existing_manhole.png
- **Problem**: Small green "OK" badge near GPS capture buttons has no label or tooltip. Unclear whether it represents GPS fix quality, node validation, or data completeness.
- **Fix**: Label or tooltip explaining what "OK" represents. If validation status → "Complete"/"הושלם". If GPS quality → move next to GPS fields and label "GPS OK".
- **Status**: OPEN
- **Commit**: —

### Issue #29 — Node/Edge Panel Field Labels Hardcoded in English (App Runs in Hebrew)
- **Severity**: MEDIUM
- **Type**: i18n/RTL
- **Screenshot**: 35_node_panel_open_existing_manhole.png, 37_node_panel_scrolled_more_fields.png, 39_edge_panel_open.png, 40_node_panel_top_with_survey_data.png
- **Problem**: Field labels ("Node ID", "Survey X", "Survey Y", "TL", "Precision", "Position Precision", "Manual X", "Manual Y", "Maintenance status", "Accuracy level", "Connected lines", "Delete Node") are all hardcoded English. App targets Hebrew-speaking field workers. Systematic i18n gap in the panel/form layer.
- **Fix**: Wrap all panel labels in t() calls. Add translations for all field keys in both he and en in src/i18n.js.
- **Status**: OPEN
- **Commit**: —

### Issue #30 — Node Panel Presents Empty Survey Fields as Dashes ("--")
- **Severity**: MEDIUM
- **Type**: ux/design
- **Screenshot**: 37_node_panel_scrolled_more_fields.png, 40_node_panel_top_with_survey_data.png
- **Problem**: For nodes without survey data, the panel still shows "Survey X: --", "Survey Y: --", "TL: --", "Precision: --" as empty dashes — wasting space and creating noise. Fields should be hidden when empty.
- **Fix**: (1) Hide empty fields entirely — show only fields with values. (2) For nodes without survey data, show a single "No survey data" message. (3) Group fields into collapsible sections: Location, Metadata, Maintenance.
- **Status**: OPEN
- **Commit**: —

### Issue #31 — "Position Precision: Fixed" Badge Uses Confusing Terminology
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 37_node_panel_scrolled_more_fields.png
- **Problem**: "Fixed" badge appears next to empty survey fields. In GNSS context "Fixed" means RTK Fixed, but field workers read it as "corrected/fixed". Contradictory when next to empty coordinates.
- **Fix**: (1) Use "RTK Fixed" instead of "Fixed". (2) Only show precision badge when Survey X/Y are present. (3) Add help icon explaining quality levels.
- **Status**: OPEN
- **Commit**: —

### Issue #32 — "Missing measurement" Badge Provides No Actionable Guidance
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 40_node_panel_top_with_survey_data.png
- **Problem**: Red "Missing measurement" badge flags an issue but doesn't specify what is missing or how to fix it. No link to the empty field.
- **Fix**: (1) Specify which measurement is missing ("Missing: pipe diameter"). (2) Tapping badge scrolls to the empty field. (3) Count if multiple missing ("Missing 3 measurements").
- **Status**: OPEN
- **Commit**: —

### Issue #33 — Delete Button Is Overly Prominent at Scroll Terminus
- **Severity**: MEDIUM
- **Type**: best-practice
- **Screenshot**: 35_node_panel_open_existing_manhole.png, 37_node_panel_scrolled_more_fields.png, 39_edge_panel_open.png
- **Problem**: Full-width red "Delete Node"/"Delete Edge" button is always at the bottom of the panel — the natural scroll terminus. Momentum scroll can overshoot into it. It is the most visually prominent element despite being least frequently used. Confirmation exists but accidental taps still cause UX friction.
- **Fix**: (1) Move Delete behind overflow "..." menu or secondary actions section. (2) Make it ghost/outline style (red text, no fill). (3) Add bottom padding so it is not at exact scroll terminus.
- **Status**: OPEN
- **Commit**: —

### Issue #34 — Canvas Toolbar Touches Android Right-Edge Gesture Zone
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 22_canvas_toolbar_gps_active_red.png, 31_canvas_navigated_to_active_sketch.png, 34_canvas_after_cancel_dialog.png
- **Problem**: Right-side toolbar buttons are flush against the screen right edge. Android 12+ reserves ~24dp on both edges for system back gestures. Buttons in this zone conflict with system back gesture — users tapping toolbar may accidentally trigger back navigation in the field.
- **Fix**: Add `padding-inline-end: max(8px, env(safe-area-inset-right))` to the toolbar container, or ensure at least 8px right margin. Prevents conflict with Android edge gestures.
- **Status**: OPEN
- **Commit**: —

### Issue #35 — Sketch Edit Affordance Only Discoverable After Selecting Sketch
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 30_fab_menu_expanded.png
- **Problem**: Pencil/edit icon only appears on the active sketch row, not on all rows. Users must navigate to a sketch first before they can edit its properties — undiscoverable pattern.
- **Fix**: Show edit icon on all rows (grayed out for non-active with tooltip "Switch to sketch to edit"), or add long-press context menu with "Edit name", "Navigate to", "Toggle visibility", "View issues".
- **Status**: OPEN
- **Commit**: —

### Issue #36 — Map Tile Labels Overlap Node/Edge Canvas Labels
- **Severity**: MEDIUM
- **Type**: design/performance
- **Screenshot**: 32_canvas_full_network_zoomed_in.png, 34_canvas_after_cancel_dialog.png
- **Problem**: When GovMap tiles are visible, Hebrew street names from map tiles compete with app's own node numbers and edge length labels. Dense overlap makes network nearly unreadable.
- **Fix**: (1) Add semi-transparent white background (text halo) behind edge/node labels. (2) Increase font weight of labels when map tiles are visible. (3) Consider offering simplified tile layer without street labels.
- **Status**: OPEN
- **Commit**: —

---

## Iteration Reports

### Iteration 1 Report (2026-02-27)
- **Batch**: Screenshots 01–20
- **Source**: Visual inspection of 20 screenshots + CSV reference notes
- **Issues Found**: 17 (1 critical, 6 high, 6 medium, 4 low)
- **Issues Fixed**: 3 (Issues #2, #3, #4)
- **Status**: Fix agent ran. Commits: e33ce41, 01c960d. Test agent spawned.

---

## Changelog

| Date | Action | Notes |
|------|--------|-------|
| 2026-02-27 | Initial audit | 20 screenshots analyzed, 17 issues found |
| 2026-02-27 | Iteration 1 fixes | Issues #2, #3, #4 fixed. Commits: e33ce41, 01c960d |
| 2026-02-27 | Batch 2 audit | 19 new issues found (#18-#36) from screenshots 21-40 |
