# Manholes Mapper — Modern Landscape-First Redesign

> A proposal for restructuring the app around landscape-oriented field work, with purposeful gamification that makes surveying faster, more reliable, and genuinely satisfying.

---

## Design Philosophy

**The core insight:** Field surveyors hold their phones in landscape when working seriously — it matches the natural horizon, gives more room for network visualization, and feels like a professional instrument rather than a social media app.

**Gamification philosophy:** Not cosmetic badges or fake points. Every gamification element serves a real purpose — reducing errors, encouraging completeness, building good habits, and making the tedious parts (depth measurements, GPS waiting) feel like progress rather than friction.

---

## 1. Landscape Layout — "The Cockpit"

### The Three-Zone Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ◀ Zone A: Intel Strip          Zone B: Canvas              Zone C: Action Rail ▶ │
│                                                                                    │
│ ┌──────────┐  ┌──────────────────────────────────────┐  ┌──────────────┐          │
│ │           │  │                                      │  │              │          │
│ │  Sketch   │  │                                      │  │   Context    │          │
│ │  Health   │  │          CANVAS                      │  │   Actions    │          │
│ │  -------  │  │        (main work area)              │  │   --------   │          │
│ │  GPS      │  │                                      │  │   [Node]     │          │
│ │  Status   │  │                                      │  │   [Edge]     │          │
│ │  -------  │  │                                      │  │   [GPS ◉]    │          │
│ │  Session  │  │                                      │  │   [Undo]     │          │
│ │  Stats    │  │                                      │  │   [Zoom]     │          │
│ │           │  │                                      │  │              │          │
│ └──────────┘  └──────────────────────────────────────┘  └──────────────┘          │
│                                                                                    │
│ ░░░░░░░░░░░░░░░░░░░░░░ Progress Bar (sketch completion) ░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────────────────────────────────┐
```

### Zone A — Intel Strip (Left, ~120px, collapsible)

A slim, always-visible information panel that replaces the hidden header. Shows what matters *right now*:

**GPS Module (top)**
- Live satellite count + fix quality badge (color-coded ring)
- Accuracy readout: `0.03m ● RTK` (green) or `12.4m ○ GPS` (yellow)
- Stale indicator: dims after 3s with no update
- Tap to expand: full GNSS details (HDOP, satellites, connection type)

**Sketch Health (middle)**
- Compact progress ring: % of nodes with coordinates
- Issue count badge: `3 ⚠` (tap to cycle through issues on canvas)
- Network stats: `12 nodes · 14 edges · 0.8 km`

**Session Tracker (bottom)**
- Timer: how long this session has been active
- Nodes placed this session: `+5`
- Today's streak indicator (see gamification section)

### Zone B — Canvas (Center, fills remaining space)

The drawing surface — maximized in landscape. Key changes:

- **No header overlay.** All info moved to Zone A/C
- **Contextual overlays only:** Node/edge detail panels slide in as bottom sheets *within* the canvas zone, not as separate panels
- **Mini-map** (optional, top-right corner): thumbnail of full network with viewport rectangle
- **Mode indicator:** Subtle colored border glow — blue for Node mode, green for Edge mode, amber for GPS capture

### Zone C — Action Rail (Right, ~56px, always visible)

Vertical toolbar replacing the current scattered FAB + bottom toolbar:

```
┌────────┐
│  ● N   │  ← Node mode (active = filled)
│  ╱ E   │  ← Edge mode
│  ⌂ H   │  ← Home node
│  ▽ D   │  ← Drainage node
│────────│
│  ◎ GPS │  ← Capture GPS (pulses when fix available)
│  ⟲ TSC │  ← TSC3 connection
│────────│
│  ↩ Z   │  ← Undo
│  + −   │  ← Zoom
│  ⊞     │  ← Fit to screen
│────────│
│  ⋮     │  ← More (export, settings, sync)
│────────│
│  ▶     │  ← Collapse Zone A (maximize canvas)
└────────┘
```

### Collapse Behavior

- **Full landscape:** All three zones visible
- **Tap ▶ on Action Rail:** Zone A collapses, canvas expands to ~90% width
- **Double-tap canvas:** Toggles between full cockpit and canvas-only mode
- **Portrait fallback:** Zones A+C merge into top bar + bottom toolbar (current-ish layout)

---

## 2. The Detail Sheet — Contextual, Not Disruptive

When a node or edge is selected, a **bottom sheet** slides up *inside* the canvas zone:

```
┌──────────────────────────────────────────────┐
│  Canvas (node selected, blue ring)           │
│                                              │
│                   ●──────●                   │
│                   5      6                   │
│                                              │
│╔════════════════════════════════════════════╗│
║  Node 5 · Manhole · ● RTK Fixed            ║│
║                                             ║│
║  ┌─────┬──────┬──────┬──────┬──────┐       ║│
║  │Coord│Maint │Mat.  │Diam. │Access│       ║│
║  │ ✓   │ ✓    │ ○    │ ○    │ ○    │       ║│
║  └─────┴──────┴──────┴──────┴──────┘       ║│
║                                             ║│
║  Material: [Concrete ▾]                     ║│
║                                             ║│
║  ◄ Prev field    [Save & Next ▶]           ║│
╚════════════════════════════════════════════╝│
└──────────────────────────────────────────────┘
```

**Key improvements:**
- **Tab completion indicators:** ✓ (filled), ○ (empty) — user sees at a glance what's missing
- **Save & Next flow:** After filling material, auto-advances to diameter. Reduces taps
- **Swipe to dismiss:** Pull down to close, canvas stays interactive above
- **Height:** Max 40% of canvas zone — always see the network context

---

## 3. Gamification System — "Survey Mastery"

### 3.1 Sketch Completion Ring

A circular progress indicator in Zone A that fills as the sketch approaches "complete":

**Scoring formula (per sketch):**
| Factor | Weight | What counts |
|--------|--------|-------------|
| Nodes with coordinates | 40% | `surveyX/Y != null` on non-schematic nodes |
| Edges with measurements | 30% | Both `tail_measurement` and `head_measurement` filled |
| Zero issues | 20% | No missing coords, no negative gradients, no long edges |
| All fields filled | 10% | Material, diameter, access on every node |

**Visual:**
- Ring color transitions: Red (0-30%) → Orange (30-60%) → Yellow (60-85%) → Green (85-100%)
- At 100%: Ring pulses once with a satisfying glow + subtle haptic
- Percentage shown in center: `78%`

**Why it works:** Surveyors often leave sketches "mostly done" and move on. The ring creates gentle pressure to finish — and makes it obvious what's missing without opening issue panels.

### 3.2 Session Streak System

**Daily streak:** Tracks consecutive days where the user completed at least one meaningful action (placed a node with GPS, completed an edge measurement, resolved an issue).

```
Zone A — Session Tracker:
┌──────────────┐
│ 🔥 7 days    │  ← Current streak
│ Today: 5/8   │  ← Daily progress (5 of 8 nodes measured)
│ ■■■■■□□□     │  ← Visual bar
└──────────────┘
```

**Not a toy.** The streak tracks *actual productive work*, not app opens. It answers the question managers silently ask: "Is the crew actually surveying every day?"

**Streak milestones:**
- 3 days → "Consistent" badge (shown in user profile)
- 7 days → "Reliable" badge
- 30 days → "Field Veteran" badge

### 3.3 Accuracy Leaderboard (Per Project)

In the project view, show a simple table:

```
┌──────────────────────────────────────┐
│  Project: Water Network Phase 3      │
│                                      │
│  Surveyor      Nodes   Avg Accuracy  │
│  ─────────────────────────────────── │
│  Ahmad K.       142    0.028m  ★★★   │
│  Yossi R.        98    0.041m  ★★    │
│  Mira S.         67    0.052m  ★★    │
│                                      │
│  Team total: 307 nodes · 2.4 km      │
└──────────────────────────────────────┘
```

**Why:** Surveyors take pride in accuracy. Making it visible creates healthy competition and helps project managers identify who might need equipment calibration.

**Star ratings:**
- ★★★ = Avg accuracy < 0.035m (excellent RTK)
- ★★ = < 0.05m (good RTK)
- ★ = < 0.1m (acceptable)
- No stars = > 0.1m (needs attention)

### 3.4 Quick-Win Notifications

Context-aware toasts that celebrate real achievements (not spam):

| Trigger | Message | Frequency |
|---------|---------|-----------|
| First RTK fix of the day | "RTK Fixed — you're ready to survey" | Once/day |
| 10th node in a session | "10 nodes mapped — strong session" | Once/session |
| Sketch hits 100% | "Sketch complete — zero issues remaining" | Once/sketch |
| Edge measurement completes a chain | "Full measurement chain: Node 1→5 done" | Once/chain |
| Resolved last issue | "All issues resolved — sketch is clean" | Once/sketch |
| First export of the day | "Data exported — ready for office" | Once/day |

**Rule:** Max 1 notification per 5 minutes. Never during active drawing (only on natural pauses).

### 3.5 The "Heat Map" View

A toggle that colors the canvas based on data completeness:

- **Green nodes:** All data filled, coordinates captured, no issues
- **Orange nodes:** Partially complete (missing some fields)
- **Red nodes:** Critical issues (no coordinates, negative gradient)
- **Gray edges:** Missing measurements
- **Blue edges:** Fully measured

**Why:** Field workers can literally see where the gaps are at a glance. "I need to go back to that red cluster on the west side."

---

## 4. Workflow Optimizations for Landscape

### 4.1 One-Handed Edge Mode

In landscape, the phone is held with two hands. The right thumb naturally rests near Zone C:

- **Tap Node** → select it (blue ring)
- **Long-press Node** → auto-enters Edge Mode, starts edge from that node
- **Drag to another node** → edge created
- **Release on empty space** → dangling edge created

This eliminates the mode-switch step entirely for edge creation.

### 4.2 GPS Quick-Capture Flow

When GPS has a good fix and user taps a node:

```
┌──────────────────────────────────────────────────────────────┐
│  ● Apply GPS to Node 5?                                      │
│                                                               │
│  Quality: RTK Fixed (0.028m) · 14 satellites                 │
│                                                               │
│  [Apply ✓]                              [Cancel ✗]           │
└──────────────────────────────────────────────────────────────┘
```

One tap to confirm. No dialog boxes, no tab navigation. The data flows directly.

### 4.3 Measurement Rail

When editing an edge's depth measurements, show an inline rail instead of a detail panel:

```
Canvas view with edge 5→6 selected:

         ●════════════════════●
         5                    6
      [2.10m]              [___m]  ← Tap to enter head depth
         │                    │
    ─────┤                    ├───── ground level reference
```

The depth inputs float directly on the canvas near the relevant nodes. The surveyor can see exactly which end they're measuring. No context switching.

### 4.4 Smart Auto-Advance

After placing a node + capturing GPS, automatically offer:

1. "Draw edge from here?" (if adjacent nodes exist)
2. "Place next node?" (stays in Node mode, ready)
3. "Enter depth?" (if edge just created)

This creates a flow state where each action leads naturally to the next, minimizing idle time.

---

## 5. Progressive Disclosure — Skill Levels

New users see a simplified interface. Features unlock as they demonstrate competency:

### Level 1 — Apprentice (Default for new users)
- Node placement + basic properties (type, note)
- Edge drawing
- Browser GPS only
- Simple export (JSON)

### Level 2 — Surveyor (After 50 nodes placed)
- All node properties (material, diameter, access)
- GPS accuracy display
- CSV export
- Issue detection panel
- Sketch completion ring

### Level 3 — Expert (After 200 nodes + 10 GPS captures)
- Bluetooth GNSS connection
- TSC3 integration
- Project canvas (multi-sketch)
- Heat map view
- Accuracy leaderboard

### Level 4 — Admin (Role-based, not earned)
- Organization management
- Input flow configuration
- Feature flags
- Reference layers

**Important:** Users can manually unlock any level in Settings → "Show all features". This is not gatekeeping — it's reducing overwhelm for new field workers who just need to map manholes.

---

## 6. Navigation & Routing (Landscape-Aware)

### Hash Routes (Updated)

| Route | View | Layout |
|-------|------|--------|
| `#/` | Sketch list (home) | Full-width card grid |
| `#/sketch/:id` | Canvas workspace | Three-zone cockpit |
| `#/sketch/:id/issues` | Issues overlay on canvas | Zone A expands to show issue list |
| `#/project/:id` | Project canvas | Cockpit + sketch switcher in Zone A |
| `#/project/:id/stats` | Project statistics | Full-width dashboard |
| `#/profile` | User profile + badges + stats | Card layout |
| `#/leaderboard` | Project accuracy leaderboard | Table layout |
| `#/login` | Auth | Centered card |
| `#/admin` | Admin panel | Sidebar + content |

### The Home Screen — "Mission Control"

Replace the current sketch list with a dashboard that shows what matters:

```
┌───────────────────────────────────────────────────────────┐
│  Good morning, Ahmad                        🔥 7-day streak │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  Active Sketch   │  │  Today's Stats   │                 │
│  │                  │  │                  │                  │
│  │  Water Main #3   │  │  Nodes: 12       │                 │
│  │  ████████░░ 78%  │  │  Edges: 15       │                 │
│  │  3 issues left   │  │  GPS: 8 captures │                 │
│  │                  │  │  Accuracy: 0.03m │                 │
│  │  [Continue ▶]    │  │                  │                 │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  Recent Sketches                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │Drain #2  │ │Park Rd   │ │Main St   │ │ + New    │      │
│  │ ✓ 100%   │ │ ██░ 45%  │ │ ████ 92% │ │  Sketch  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  Project: Water Network Phase 3                             │
│  Team progress: 307/400 nodes  ████████████░░░ 77%         │
└───────────────────────────────────────────────────────────┘
```

---

## 7. Micro-Interactions & Polish

### GPS Fix Celebration
When RTK Fixed is first achieved in a session, the GPS indicator in Zone A briefly pulses with a green ring expanding outward — like a sonar ping. Subtle, professional, satisfying.

### Node Placement Feedback
Each node placed triggers a brief scale-up animation (1.0 → 1.1 → 1.0 over 150ms) and a soft haptic tap. The node "lands" on the canvas.

### Edge Completion Snap
When an edge connects to its target node, the endpoint snaps with a subtle elastic animation. The edge briefly thickens then settles to normal width.

### Issue Resolution
When the last issue in a sketch is resolved, the completion ring fills to 100% with a smooth animation, the ring turns green, and a single celebratory toast appears: "Sketch complete — zero issues."

### Streak Freeze (Forgiveness)
If a user misses one day, the streak doesn't break immediately — they get a "streak freeze" (one per week, auto-applied). This prevents demotivation from weekends or sick days.

---

## 8. Dark Mode in the Field

Field work happens at dawn and dusk. The current dark mode needs enhancement:

- **Auto dark mode** based on ambient light sensor (where available) or time of day
- **High-contrast canvas mode:** Thicker lines, brighter node colors, white labels on dark background
- **GPS accuracy colors adjusted for dark:** Green stays green, but orange/red become more vivid against dark canvas
- **Reduced blue light** option for pre-dawn work

---

## 9. Offline-First Indicators

In landscape cockpit view, sync status is always visible in Zone A:

```
┌──────────────┐
│ ☁ Synced     │  ← Green cloud = all synced
│ 2 min ago    │
└──────────────┘

┌──────────────┐
│ ⟳ Syncing... │  ← Blue rotating = active sync
│ 3 pending    │
└──────────────┘

┌──────────────┐
│ ✕ Offline    │  ← Gray = no connection
│ 12 queued    │  ← Shows pending operations count
└──────────────┘
```

---

## 10. Implementation Priority

### Phase 1 — Layout Foundation (Week 1-2)
- Three-zone landscape cockpit layout
- Zone A: GPS + sketch health + session stats
- Zone C: Action rail (replaces FAB + toolbar)
- Bottom sheet detail panel (replaces sidebar drawer)
- Portrait fallback layout

### Phase 2 — Gamification Core (Week 3-4)
- Sketch completion ring (Zone A)
- Session stats tracker
- Quick-win notification system
- Heat map view toggle

### Phase 3 — Workflow Optimization (Week 5-6)
- One-handed edge mode (long-press drag)
- GPS quick-capture flow
- Measurement rail (inline depth input)
- Smart auto-advance

### Phase 4 — Social & Progression (Week 7-8)
- Daily streak system
- User profile with badges
- Project accuracy leaderboard
- Progressive disclosure (skill levels)

### Phase 5 — Polish (Week 9-10)
- Micro-interactions (animations, haptics)
- Enhanced dark mode
- Mini-map overlay
- Home screen dashboard ("Mission Control")

---

## Summary

This redesign transforms Manholes Mapper from a "drawing tool that works on phones" into a **purpose-built field surveying instrument** that:

1. **Respects the landscape grip** — all critical info visible without rotating
2. **Reduces taps per operation** — GPS capture, edge creation, measurements all streamlined
3. **Makes completeness visible** — the ring, heat map, and issue badges ensure nothing is forgotten
4. **Rewards good work authentically** — accuracy leaderboard, streaks, and completion celebrations tied to real outcomes
5. **Grows with the user** — progressive disclosure prevents overwhelm while keeping power accessible
6. **Works offline gracefully** — sync status always visible, never blocks the workflow

The gamification is not decoration — every element drives a real behavior: finish your sketches, maintain accuracy, survey consistently, don't leave gaps in the network.
