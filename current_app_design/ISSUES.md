# Manholes Mapper — Design Audit Issue Tracker

Auto-maintained by the `design-audit-loop` skill. Each iteration reads screenshots, finds issues, fixes them, and updates this file.

---

## Last Processed
- **Batch 1**: Screenshots 01–20 (processed 2026-02-27)
- **Batch 2**: Screenshots 21–40 (processed 2026-02-27)
- **Batch 3**: Screenshots 41–59 (processed 2026-02-27)

---

## Summary

| Severity | Total | Fixed | Open |
|----------|-------|-------|------|
| CRITICAL | 1 | 0 | 1 (not app bug) |
| HIGH | 12 | 10 | 2 (already ok) |
| MEDIUM | 25 | 15 | 10 |
| LOW | 18 | 2 | 16 (1 deferred) |
| **TOTAL** | **56** | **27** | **29** |

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
- **Status**: Fixed ✓ (Tested)
- **Commit**: `01c960d — "fix: change no-fix GNSS color from red to gray"`

### Issue #3 — GPS Toolbar Button Has Alarming Red Active State
- **Severity**: HIGH
- **Type**: design
- **Screenshot**: 02_main_canvas_clean.png, 14_canvas_toolbar_visible_nodemode_edgemode_zoom.png
- **Affected**: `styles.css`
- **Problem**: When Live Measure is active, the GPS toolbar button (top of right-side toolbar) shows a full red background square. This looks like an error state, not an "active/enabled" state. Users associate red with "stop" or "error".
- **Fix**: Change the active GPS button style from `background: red` to a green/teal active indicator (e.g., `background: var(--color-success)` or a blue ring/border). Alternatively, use a pulsing green dot overlay to signal "GPS is active and tracking".
- **Status**: Fixed ✓ (Tested)
- **Commit**: `01c960d — "fix: change no-fix GNSS color from red to gray"`

### Issue #4 — Menu Does Not Reset Scroll Position on Open (BUG)
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 15_menu_open_top_scrolled.png, 17_menu_at_top_home_button_visible.png
- **Affected**: `src/main-entry.js`, `src/legacy/main.js`
- **Problem**: When the hamburger menu is closed and reopened, it remembers its previous scroll position. The "Home" and "New Sketch" items (most commonly used) are at the top of the menu and are scrolled out of view. Users must scroll up to find them.
- **Fix**: Find the menu open handler (where `#mobileMenu` becomes visible) and add `document.getElementById('mobileMenu').querySelector('.menu-scroll-container, ul, .menu-items').scrollTop = 0` before showing the menu. Or use `scrollTop = 0` on the scrollable container.
- **Status**: Fixed ✓ (Tested)
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
- **Fix**: Increased toolbar background opacity from 60% to 85% and added backdrop-filter blur.
- **Status**: Fixed in Iter 4
- **Commit**: `a478d3e`

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
- **Fix**: Color-coded severity CSS classes: >100 red, 50-100 orange, <50 yellow. Applied in sketch-side-panel.js and styles.css.
- **Status**: FIXED
- **Commit**: `6b4c0a4`

### Issue #9 — Edge Labels Overlap Badly at High Density
- **Severity**: MEDIUM
- **Type**: performance/ux
- **Screenshot**: 13_canvas_with_sketch_loaded_network_visible.png
- **Problem**: When zoomed out to overview level, edge length labels (e.g., "3.5m", "5.36m", "7.00m") overlap each other in dense areas, making them completely unreadable. The canvas has dozens of overlapping text strings.
- **Fix**: Edge labels are now hidden when viewScale < 0.3 (heavily zoomed out). Labels reappear on zoom in. Guard wraps the entire edge label loop in main.js draw().
- **Status**: FIXED
- **Commit**: `b3f712c`

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
- **Fix**: Admin Settings and Project Management buttons are now hidden for non-admin users. Visibility updates on auth state change and when permissions are fetched asynchronously via `onPermissionChange` listener.
- **Status**: FIXED
- **Commit**: `99f40cf`

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
- **Fix**: Fix quality label now renders at 13px bold (up from 11px) for at-a-glance readability. When quality is 0 (No Fix), HDOP/altitude/ITM detail lines are collapsed since they are meaningless.
- **Status**: FIXED
- **Commit**: `5484aa6`

### Issue #19 — GNSS Accuracy Circle Enormous When No Fix — Dominates Canvas
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 21_canvas_clean_network_overview.png, 22_canvas_toolbar_gps_active_red.png
- **Problem**: With poor accuracy (e.g. ±120.6m), the accuracy circle takes ~40% of visible canvas, obscuring the network below. Dashed pink circle with red dot looks broken.
- **Fix**: (1) Cap visual radius at max 150px screen diameter regardless of accuracy. (2) Reduce opacity for No Fix states. (3) Hide the accuracy circle entirely when fix quality is 0 (No Fix).
- **Status**: Fixed ✓ (Tested)
- **Commit**: `a525ac9`

### Issue #20 — "STALE" Badge Appears With No Explanation or Translation
- **Severity**: MEDIUM
- **Type**: ux/i18n
- **Screenshot**: 23_canvas_node_mode_active_toolbar_highlight.png
- **Problem**: Yellow "STALE" badge near GNSS marker has no tooltip or legend. The word is English-only — not translated to Hebrew, breaking RTL/i18n contract.
- **Fix**: Added `gnssMarker.stale`, `gnssMarker.signalStale`, and all fix quality labels to i18n (he/en). Stale badge now shows "לא עדכני" in Hebrew. Precision card and status badge use window.t() for all text.
- **Status**: FIXED
- **Commit**: `ecbb219`

### Issue #21 — Mode-Change Toast Overlaps Legend Bar
- **Severity**: LOW
- **Type**: design
- **Screenshot**: 23_canvas_node_mode_active_toolbar_highlight.png, 26_node_mode_manhole_active.png
- **Problem**: "Node mode" toast appears at canvas top, overlapping the color legend ("Main Line / Drainage Line / Secondary Line"). Opaque green toast clashes with white legend background.
- **Fix**: Position mode-change toast below legend bar (top: 140px), or use the existing bottom-of-screen toast area.
- **Status**: OPEN
- **Commit**: —

### Issue #22 — Home Node Form Missing Sub-Type Options (Maintenance Status)
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 24_node_type_dialog_select_manhole.png, 27_after_tap_canvas_in_nodemode.png
- **Problem**: Home nodes had a minimal form (only ID, note, direct connection) with no maintenance status. Drainage nodes already had the full wizard form.
- **Fix**: Added maintenance status dropdown to Home node panel. Normalization now preserves (not clears) maintenance status for Home/Drainage nodes.
- **Status**: Fixed in Iter 4
- **Commit**: `7a41094`

### Issue #23 — Canvas Toolbar Buttons Have No Labels, Tooltips, or Aria-Labels
- **Severity**: HIGH
- **Type**: accessibility/ux
- **Screenshot**: 21_canvas_clean_network_overview.png, 34_canvas_after_cancel_dialog.png
- **Problem**: 6 toolbar buttons show only Material Icons with no text labels, no long-press tooltips, no aria-label attributes. New field workers cannot determine what circle=Node, droplet=Drainage, trending-up=Edge, home=House Connection. App is inaccessible to screen readers.
- **Fix**: (1) Add aria-label to all toolbar buttons. (2) Add title attributes for tooltips. (3) Consider adding 3-4 char text labels below each icon within the toolbar. (4) On first launch, show a brief overlay tutorial.
- **Status**: Fixed ✓ (Tested)
- **Commit**: `a6a24c7`

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
- **Status**: Fixed ✓ (Tested)
- **Commit**: `061b431`

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
- **Problem**: "Connected lines" and "Direct connection" labels were hardcoded with inline language-conditional fallbacks instead of using i18n t() calls.
- **Fix**: Added missing i18n keys `labels.connectedLines` and `labels.directConnection` in both Hebrew and English. Replaced inline fallbacks with t() calls.
- **Status**: Fixed in Iter 4
- **Commit**: `b16f825`

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
- **Status**: Fixed ✓ (Tested)
- **Commit**: `48a2990`

### Issue #34 — Canvas Toolbar Touches Android Right-Edge Gesture Zone
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 22_canvas_toolbar_gps_active_red.png, 31_canvas_navigated_to_active_sketch.png, 34_canvas_after_cancel_dialog.png
- **Problem**: Right-side toolbar buttons are flush against the screen right edge. Android 12+ reserves ~24dp on both edges for system back gestures. Buttons in this zone conflict with system back gesture — users tapping toolbar may accidentally trigger back navigation in the field.
- **Fix**: Add `padding-inline-end: max(8px, env(safe-area-inset-right))` to the toolbar container, or ensure at least 8px right margin. Prevents conflict with Android edge gestures.
- **Status**: Fixed ✓ (Tested)
- **Commit**: `a0862cb`

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
- **Fix**: Node ID labels now render with a white stroke halo (rgba(255,255,255,0.92)) and bold font when map tiles are active. Applied only when `mapLayerEnabled && getMapReferencePoint()` is truthy, so no impact without map tiles.
- **Status**: FIXED
- **Commit**: `c0e6ff6`

---

## Batch 3 Issues (Screenshots 41–59)

### Issue #37 — Picker Dialog Shows Corrupted/Overlapping Icons at First Item
- **Severity**: MEDIUM
- **Type**: bug
- **Screenshot**: 42_node_edit_form_full_fields.png, 49_canvas_panel_closed_ready_for_measure.png
- **Problem**: Maintenance status and line diameter pickers show garbled/overlapping icon artifacts at the top-left of the first list item — appears to be app favicon bleeding through from behind the modal overlay. Gives broken, unprofessional appearance.
- **Fix**: Ensure picker modal overlay has `background: white` from `top: 0` and sufficient `z-index`. Check picker rendering in `src/legacy/main.js` where maintenance status and diameter option lists are built.
- **Status**: OPEN
- **Commit**: —

### Issue #38 — Delete Node Button Visible Without Scrolling to Content
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 41_node_panel_very_top_nodeid_fields.png, 43_maintenance_picker_dismissed.png
- **Problem**: The "Delete Node" full-width red button is visible at panel bottom even at default height before the user has scrolled to see all fields. Destructive action is always visible while useful fields require scrolling.
- **Fix**: Ensure Delete button is inside the scrollable area at the very end of content — not sticky/pinned at bottom. Alternatively hide behind "More actions" overflow menu.
- **Status**: OPEN
- **Commit**: —

### Issue #39 — Connected Lines Section Lacks Clear Visual Separation from Node Fields
- **Severity**: MEDIUM
- **Type**: ux/design
- **Screenshot**: 45_node_panel_more_fields_scroll2.png, 48_edge_panel_scroll_more_fields.png
- **Problem**: The "Connected lines" section within the node panel shows full edge editing fields inline. Visual hierarchy does not make clear the user has scrolled from node fields into edge fields. Section title easily missed.
- **Fix**: Added primary-blue left border, uppercase section title with bottom border, and stronger edge dividers to the Connected Lines area.
- **Status**: Fixed in Iter 4
- **Commit**: `75708fc`

### Issue #40 — Connected Edge Fields Create "Delete Node" Label Confusion
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 46_edge_mode_activated.png, 47_after_edge_mode_tap.png, 48_edge_panel_scroll_more_fields.png
- **Problem**: When edge fields from "Connected lines" fill the viewport, the "Delete Node" button at panel bottom looks mismatched. Also: tapping near an edge while intending to select a node caused edge selection.
- **Fix**: Visual separation fixed (issue #39). Node/edge tap priority: widened node re-check (1.6x radius) when an edge is hit but no node, ensuring nearby nodes always win.
- **Status**: Fixed in Iter 4 (tap priority + visual separation)
- **Commit**: `b15c7ae`, `75708fc`

### Issue #41 — Panel Does NOT Close on Android Back Button
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 54_after_back_key.png, 55_app_reopened.png
- **Problem**: Pressing Android Back button exits the entire app instead of closing the open details panel. The `popstate` handler does NOT check if `#sidebar` is visible before showing the exit prompt.
- **Fix**: In `src/legacy/main.js` around the `popstate` handler (~line 9766), add check before exit prompt: if `#sidebar` is visible, close it and return. Insert before the home panel check.
- **Status**: Fixed ✓ (Tested)
- **Commit**: `b923973`

### Issue #42 — Panel Persists After App Background/Foreground Cycle
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 55_app_reopened.png, 56_panel_close_attempt.png
- **Problem**: After app is backgrounded and reopened, the details panel remains open at exact same scroll position. User expects to see the canvas map on resume, not a stale form.
- **Fix**: On `visibilitychange` (document becomes visible), optionally close the details panel to return user to canvas view.
- **Status**: OPEN
- **Commit**: —

### Issue #43 — Panel Drag Handle Too Tiny (4px Tall)
- **Severity**: MEDIUM
- **Type**: ux/accessibility
- **Screenshot**: 41_node_panel_very_top_nodeid_fields.png, 56_panel_close_attempt.png
- **Problem**: Drawer drag handle is ~30px wide × 4px tall — impossible to target with gloves or in bright sunlight.
- **Fix**: Enlarged drag handle bar to 48x6px with increased padding (min-height: 28px). Added snap-to-close when dragged below 30% of default height.
- **Status**: Fixed in Iter 4
- **Commit**: `9d08c32`

### Issue #44 — Panel Close (X) Button Does Not Close Panel Reliably on Touch
- **Severity**: HIGH
- **Type**: bug
- **Screenshot**: 56_panel_close_attempt.png, 57_panel_close_y1250.png
- **Problem**: Field worker spent 60+ seconds trying to close the details panel (screenshots 56-57, timestamps 19:02-19:03). X button appears unresponsive on touch. This is a critical field usability failure.
- **Fix**: Iter 3: touchend handler added (c96300a). Iter 4: enlarged drag handle (48x6px), styled close button as prominent red circle (36px), added snap-to-close on drag below 30%.
- **Status**: Fixed ✓ (Tested in Iter 3, improved in Iter 4)
- **Commit**: `c96300a`, `9d08c32`

### Issue #45 — Menu Scroll Bug Regression (Fix from #4 Not Fully Effective)
- **Severity**: MEDIUM
- **Type**: bug (regression)
- **Screenshot**: 58_menu_top_section.png
- **Problem**: The double-rAF scroll reset fired at ~32ms, before the 200ms CSS animation completed on physical phones.
- **Fix**: Iter 3: transitionend approach (843deab). Iter 4: replaced double-rAF with animationend listener + 250ms fallback timeout + immediate scrollTop=0 reset.
- **Status**: Fixed ✓ (Tested in Iter 3, improved in Iter 4)
- **Commit**: `843deab`, `de8eb28`

### Issue #46 — Line Diameter Picker Shows Raw Numbers Without "mm" Units
- **Severity**: MEDIUM
- **Type**: ux/i18n
- **Screenshot**: 49_canvas_panel_closed_ready_for_measure.png
- **Problem**: Diameter picker shows "100, 150, 160, 200..." with no unit.
- **Fix**: Appended "mm" suffix to numeric diameter option labels in rendering. Updated field label to include "(mm)" / "(מ"מ)" in both languages.
- **Status**: Fixed in Iter 4
- **Commit**: `d81ac10`

### Issue #47 — Mixed Language: Labels English, Values Hebrew in Same Panel
- **Severity**: LOW
- **Type**: i18n
- **Screenshot**: 41_node_panel_very_top_nodeid_fields.png, 43_maintenance_picker_dismissed.png
- **Problem**: Field labels show in English ("Accuracy: Engineering", "Maintenance status") while dropdown values are in Hebrew ("בית נעול", "בטון"). Jarring mixed-direction layout. Option catalogs in `src/state/constants.js` use hardcoded Hebrew strings that don't respect current language.
- **Fix**: Requires DB migration — material values are stored as Hebrew label text in sketch JSON. Cannot change without migrating all existing sketch data.
- **Status**: DEFERRED (requires data migration)
- **Commit**: —

### Issue #48 — "TL" Label Is Cryptic Abbreviation — Should Be "Terrain Level"
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 44_node_panel_more_fields_scroll1.png
- **Problem**: "TL: -109.763" is unexplained to field workers not familiar with survey terminology.
- **Fix**: Updated i18n: Hebrew 'גובה שטח (TL)', English 'Terrain Level (TL)'. TL abbreviation preserved in parentheses.
- **Status**: Fixed in Iter 4
- **Commit**: `f19da24`

### Issue #49 — "Precision" Field Shows Em Dash Without Tooltip Explanation
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 44_node_panel_more_fields_scroll1.png
- **Problem**: "Precision: —" for nodes where precision wasn't captured gives no actionable info. User doesn't know WHY it's missing.
- **Fix**: Show "Not recorded" with tooltip "Precision was not captured during this measurement." Add i18n key `notRecorded: 'לא נמדד'` (he) / `'Not recorded'` (en).
- **Status**: OPEN
- **Commit**: —

### Issue #50 — Admin Save Button Partially Hidden Below Viewport
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 59_admin_panel_opened.png
- **Problem**: Admin Settings action bar ("Cancel" + "Save Settings") is cut off at viewport bottom by system navigation bar. Users may miss or struggle to tap "Save Settings".
- **Fix**: Add `padding-bottom: env(safe-area-inset-bottom, 20px)` to admin settings container. Or make action bar `position: sticky; bottom: 0` with opaque background.
- **Status**: Fixed ✓ (Tested)
- **Commit**: `d463c64`

### Issue #51 — Canvas Fully Obscured When Panel Open — Selected Node Not Highlighted
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 41_node_panel_very_top_nodeid_fields.png, 45_node_panel_more_fields_scroll2.png
- **Problem**: Open panel occupies ~50% viewport. Remaining canvas is too small to identify the selected node. No visual highlight on the selected element while panel is open. Field workers cannot verify they're editing the right node.
- **Fix**: (1) Auto-center canvas on selected node when panel opens. (2) Persistent pulsing highlight on selected node/edge while panel is open. (3) Panel starts at 30% height (compact), user drags up for more fields.
- **Status**: OPEN
- **Commit**: —

### Issue #52 — Node Panel Wizard Tab Icons Have No Labels or Aria-Labels
- **Severity**: LOW
- **Type**: accessibility
- **Screenshot**: 41_node_panel_very_top_nodeid_fields.png, 53_canvas_clean_after_swipe_dismiss.png
- **Problem**: Row of icon tabs (wrench, layers, circle, hatched square, hamburger) below warning badge have no text labels and no tooltips. New workers cannot tell which tab holds which field category.
- **Fix**: Add `aria-label` to each tab button. Add visible abbreviated text labels below icons ("Maint.", "Mat.", "Cover", "Access", "More"). Update tab rendering in `src/legacy/main.js`.
- **Status**: OPEN
- **Commit**: —

### Issue #53 — "Missing measurement" Badge Is Not Actionable
- **Severity**: MEDIUM
- **Type**: ux
- **Screenshot**: 41_node_panel_very_top_nodeid_fields.png, 43_maintenance_picker_dismissed.png
- **Problem**: Red "Missing measurement" badge shows which node has an issue but not WHICH measurement is missing. User must scroll through 15+ fields across multiple tabs to find the empty field.
- **Fix**: Make badge tappable — on tap, scroll to first empty required field and highlight it. Display missing field name: "Missing measurement: Outgoing line (Edge 281-280)". Add click listener in `src/legacy/main.js`.
- **Status**: OPEN
- **Commit**: —

### Issue #54 — Mixed LTR/RTL Content in Form Fields (Label vs Value Direction)
- **Severity**: LOW
- **Type**: i18n
- **Screenshot**: 41_node_panel_very_top_nodeid_fields.png, 45_node_panel_more_fields_scroll2.png
- **Problem**: English labels (left-aligned) mixed with Hebrew values (right-aligned) in same form. Jarring visual direction conflict within single rows.
- **Fix**: Option values in constants.js must respect current language. When app is English, all dropdown options display in English. When Hebrew, all in Hebrew. Full i18n pass on constants.js option arrays.
- **Status**: OPEN
- **Commit**: —

### Issue #55 — FAB Button Hidden Behind Open Panel
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: All panel-open screenshots (41-57)
- **Problem**: Blue FAB at bottom-right disappears behind the details panel when open. FAB actions (center map, quick capture) become inaccessible while editing a node.
- **Fix**: `#fabBtn { bottom: calc(var(--drawer-height, 0px) + 16px); }` — floats FAB above the panel using the existing CSS variable set by `src/utils/resizable-drawer.js`.
- **Status**: Fixed ✓ (Tested)
- **Commit**: `da98abe`

### Issue #56 — Panel Has Unstable Intermediate Drag States (No Snap Behavior)
- **Severity**: LOW
- **Type**: ux
- **Screenshot**: 57_panel_close_y1250.png
- **Problem**: Panel can be left in awkward partially-open state (screenshot 57 shows compressed canvas). No snap-to-open or snap-to-closed threshold behavior.
- **Fix**: In `src/utils/resizable-drawer.js` `stopResize()`, add snap behavior: if dragged below 30% of default height → snap to closed; otherwise snap to default open height.
- **Status**: OPEN
- **Commit**: —

---

## Iteration Reports

### Iteration 1 Report (2026-02-27)
- **Batch**: Screenshots 01–20
- **Source**: Visual inspection of 20 screenshots + CSV reference notes
- **Issues Found**: 17 (1 critical, 6 high, 6 medium, 4 low)
- **Issues Fixed**: 3 (Issues #2, #3, #4)
- **Status**: All 3 fixes tested and verified. Commits: e33ce41, 01c960d.

### Iteration 2 Report (2026-02-27)
- **Batch**: Screenshots 21–40 (audit) + fixes applied
- **Issues Fixed**: 5 (Issues #34, #23, #27, #33, #19)
- **Commits**: a0862cb, a6a24c7, 061b431, 48a2990, a525ac9, a42ba75 (SW v42)
- **Status**: All 5 fixes tested and verified.

### Iteration 3 Report (2026-02-27)
- **Batch**: Screenshots 41–59 (audit) + fixes applied
- **Issues Fixed**: 5 (Issues #41, #44, #45, #55, #50)
- **Commits**: b923973, c96300a, 843deab, da98abe, d463c64
- **Status**: All 5 fixes tested and verified (5/5 PASS). Tested against local dev server (Vercel preview has SSO). All 490 unit tests pass.

### Iteration 4 Report (2026-02-27)
- **Batch**: HIGH priority remaining issues + impactful MEDIUM/LOW fixes
- **Issues Fixed**: 8 (Issues #6, #22, #29, #39, #40, #43, #46, #48)
- **Issues Improved**: 2 (Issues #44, #45 — additional fixes on top of Iter 3)
- **Issues Deferred**: 1 (#47 — requires DB data migration, cannot fix without breaking existing sketch data)
- **Commits**: b16f825, b15c7ae, 75708fc, de8eb28, 9d08c32, 7a41094, a478d3e, d81ac10, f19da24
- **Tests**: All 490 tests passing. SW bumped to v44.
- **Status**: Deployed to dev branch, SW v44.
- **Fixed**: #29, #40, #39, #22, #6, #46, #48, #43, #45(improved), #44(improved)
- **Deferred**: #47 (DB migration required)

### Iteration 5 Report (2026-02-27)
- **Batch**: MEDIUM priority open issues
- **Issues Fixed**: 6 (Issues #8, #9, #12, #18, #20, #36)
- **Commits**: 6b4c0a4, b3f712c, ecbb219, 99f40cf, c0e6ff6, 5484aa6
- **SW**: Bumped to v45 (47684cc)
- **Tests**: All 490 tests passing.
- **Status**: Deployed to dev branch.

---

## Changelog

| Date | Action | Notes |
|------|--------|-------|
| 2026-02-27 | Initial audit | 20 screenshots analyzed, 17 issues found |
| 2026-02-27 | Iteration 1 fixes | Issues #2, #3, #4 fixed. Commits: e33ce41, 01c960d |
| 2026-02-27 | Iteration 1 tested | All 3 fixes verified passing |
| 2026-02-27 | Batch 2 audit | 19 new issues found (#18-#36) from screenshots 21-40 |
| 2026-02-27 | Iteration 2 fixes | Issues #34, #23, #27, #33, #19 fixed. Commits: a0862cb, a6a24c7, 061b431, 48a2990, a525ac9 |
| 2026-02-27 | Iteration 2 tested | All 5 fixes verified passing |
| 2026-02-27 | Batch 3 audit | 20 new issues found (#37-#56) from screenshots 41-59 |
| 2026-02-27 | Iteration 3 fixes | Issues #41, #44, #45, #55, #50 fixed. Commits: b923973, c96300a, 843deab, da98abe, d463c64 |
| 2026-02-27 | Iteration 3 tested | All 5 fixes verified passing (5/5). Tested against local dev server. All 490 unit tests pass. |
| 2026-02-27 | Iteration 4 fixes | Issues #6, #22, #29, #39, #40, #43, #46, #48 fixed. Improved #44, #45. Deferred #47. SW v44. |
| 2026-02-27 | Iteration 4 deployed | Deployed to dev branch. 9 commits: b16f825, b15c7ae, 75708fc, de8eb28, 9d08c32, 7a41094, a478d3e, d81ac10, f19da24 |
| 2026-02-27 | Iteration 5 fixes | Issues #8, #9, #12, #18, #20, #36 fixed. SW v45. Commits: 6b4c0a4, b3f712c, ecbb219, 99f40cf, c0e6ff6, 5484aa6, 47684cc |
