# Artist/Developer Vision: Intelligent Input Flow System

## Executive Summary

This document describes the vision for an **intelligent, context-aware input system** for the Manholes Mapper application. The system transforms data collection from static forms to dynamic, adaptive inputs that respond to field values in real-time, reducing errors and improving field worker efficiency.

---

## Core Concept

The intelligent input flow system operates on a simple but powerful principle:

> **When a user selects a specific value in one field, other fields should automatically adapt - becoming hidden, required, or reset based on business rules.**

For example:
- When `accuracy_level = "סכימטית"` (Schematic), all detailed measurement fields are automatically reset and hidden
- When `maintenance_status = "לא ניתן לפתיחה"` (Cannot Open), diameter and access fields become irrelevant and are disabled
- When `maintenance_status = "שוחה מכוסה"` (Covered Manhole), a notes field becomes required

---

## Architecture

### Data Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ORGANIZATIONS                                │
│  ┌─────────┐                                                        │
│  │ Org A   │──────┬──────────────────────────────────────────────┐  │
│  └─────────┘      │                                              │  │
│                   ▼                                              │  │
│            ┌─────────────┐     ┌─────────────┐     ┌──────────┐ │  │
│            │  Project 1  │     │  Project 2  │     │ Project N│ │  │
│            │             │     │             │     │          │ │  │
│            │ InputFlow   │     │ InputFlow   │     │ InputFlow│ │  │
│            │ Config      │     │ Config      │     │ Config   │ │  │
│            └──────┬──────┘     └──────┬──────┘     └────┬─────┘ │  │
│                   │                   │                  │       │  │
│                   ▼                   ▼                  ▼       │  │
│            ┌──────────┐        ┌──────────┐       ┌──────────┐  │  │
│            │ Sketch 1 │        │ Sketch 2 │       │ Sketch N │  │  │
│            │ (Snapshot│        │ (Snapshot│       │ (Snapshot│  │  │
│            │  Config) │        │  Config) │       │  Config) │  │  │
│            └──────────┘        └──────────┘       └──────────┘  │  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Entities

1. **Organization**: Top-level container, owns projects and users
2. **Project**: Template with input flow configuration, shared across organization
3. **Sketch**: Individual drawing session, stores snapshot of config at creation
4. **Input Flow Config**: JSON rules defining field behavior

---

## Input Flow Configuration

### Rule Structure

Each rule consists of:

```json
{
  "id": "unique_rule_id",
  "name": "Human readable name",
  "description": "What this rule does",
  "enabled": true,
  "trigger": {
    "field": "accuracy_level",
    "operator": "equals",
    "value": 1
  },
  "actions": [
    { "type": "bulk_reset", "fields": ["maintenance_status", "cover_diameter", "material", "access"] }
  ]
}
```

### Action Types

| Type | Description | Example |
|------|-------------|---------|
| `nullify` | Set field to empty/default value | `{ "type": "nullify", "field": "cover_diameter" }` |
| `disable` | Hide field from input form | `{ "type": "disable", "field": "access" }` |
| `require` | Make field mandatory | `{ "type": "require", "field": "notes" }` |
| `bulk_reset` | Reset multiple fields at once | `{ "type": "bulk_reset", "fields": ["a", "b", "c"] }` |

### Operators

| Operator | Description |
|----------|-------------|
| `equals` | Field value matches exactly |
| `not_equals` | Field value differs |
| `empty` | Field is null/empty/zero |
| `not_empty` | Field has a value |

---

## Default Rules

The system ships with sensible defaults that can be customized per project:

### Node Rules

1. **Schematic Accuracy → Bulk Reset**
   - Trigger: `accuracy_level = 1 (סכימטית)`
   - Actions: Reset `maintenance_status`, `cover_diameter`, `material`, `access`

2. **Cannot Open → Disable Details**
   - Trigger: `maintenance_status = 3 (לא ניתן לפתיחה)`
   - Actions: Nullify `cover_diameter`, Disable `access`, `material`

3. **Covered Manhole → Disable Details**
   - Trigger: `maintenance_status = 4 (שוחה מכוסה)`
   - Actions: Nullify `cover_diameter`, Disable `access`, `material`

4. **Sewage No Access → Limited Fields**
   - Trigger: `maintenance_status = 5 (שוחת ביוב - ללא גישה)`
   - Actions: Nullify `cover_diameter`, Disable `access`

### Edge Rules

1. **Drainage Line → Specific Defaults**
   - Trigger: `edge_type = 4802 (קו סניקה)`
   - Actions: Nullify `fall_depth`

---

## User Experience Flow

### Creating a New Sketch

```
┌─────────────────────────────────────────────────────────┐
│                    START NEW SKETCH                      │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Project:  [▼ Select Project...            ]    │    │
│  │            ├─ Water Infrastructure Phase 1      │    │
│  │            ├─ Sewage Mapping 2026               │    │
│  │            └─ Emergency Repairs                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Date:     [ 2026-01-23 📅 ]                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│       [ Cancel ]                    [ Start ]            │
└─────────────────────────────────────────────────────────┘
```

### Dynamic Form Behavior

When a user selects "סכימטית" (Schematic) for accuracy level:

**Before:**
```
┌─────────────────────────────────────┐
│  Accuracy Level:  [ הנדסית  ▼]      │
│  Maintenance:     [ תקין    ▼]      │
│  Cover Diameter:  [ 55      ]       │
│  Material:        [ בטון    ▼]      │
│  Access:          [ סולם    ▼]      │
└─────────────────────────────────────┘
```

**After selecting סכימטית:**
```
┌─────────────────────────────────────┐
│  Accuracy Level:  [ סכימטית ▼]      │
│                                     │
│  ℹ️ Schematic mode - detailed       │
│     fields have been reset          │
│                                     │
└─────────────────────────────────────┘
```

---

## Configuration UI

### Projects Screen (`#/projects`)

Org admins can manage projects:

```
┌───────────────────────────────────────────────────────────┐
│  📁 Project Management                                    │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  🏗️ Water Infrastructure Phase 1                   │  │
│  │  12 sketches  •  Last updated: 2026-01-20          │  │
│  │  [ Edit ] [ Input Flow ⚙️ ] [ Delete ]             │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  🚰 Sewage Mapping 2026                             │  │
│  │  5 sketches  •  Last updated: 2026-01-18           │  │
│  │  [ Edit ] [ Input Flow ⚙️ ] [ Delete ]             │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  [ + Add Project ]                                        │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Input Flow Editor (`#/projects/:id/input-flow`)

Visual rule builder:

```
┌───────────────────────────────────────────────────────────┐
│  ⚙️ Input Flow Settings - Water Infrastructure Phase 1   │
│  [ Import JSON ] [ Export JSON ]                          │
├───────────────────────────────────────────────────────────┤
│  [ Nodes ]  [ Edges ]                                     │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ ✅ Schematic Bulk Reset                             │  │
│  │ When: accuracy_level = סכימטית                      │  │
│  │ Actions: Reset maintenance_status, cover_diameter,  │  │
│  │          material, access                           │  │
│  │ [ Edit ✏️ ] [ Delete 🗑️ ]                          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ ✅ Cannot Open - Disable Fields                     │  │
│  │ When: maintenance_status = לא ניתן לפתיחה           │  │
│  │ Actions: Nullify cover_diameter, Hide access,       │  │
│  │          material                                   │  │
│  │ [ Edit ✏️ ] [ Delete 🗑️ ]                          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  [ + Add Rule ]                                           │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                    [ Cancel ] [ Save ]                    │
└───────────────────────────────────────────────────────────┘
```

---

## Security Model

### Access Control

| Role | Can View Projects | Can Edit Projects | Can Edit Input Flow | Can Create Sketches |
|------|-------------------|-------------------|---------------------|---------------------|
| User | Own Org Only | ❌ | ❌ | ✅ (must select project) |
| Org Admin | Own Org Only | ✅ | ✅ | ✅ |
| Super Admin | All Orgs | ✅ | ✅ | ✅ |

### Data Protection

1. **Config Snapshots**: When a sketch is created, the project's input flow config is copied as a snapshot. This ensures:
   - Historical data isn't affected by config changes
   - Sketches remain valid even if project config is modified
   
2. **Organization Isolation**: Users can only access projects within their organization

---

## API Endpoints

### Projects

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/projects` | List projects for user's org | All authenticated |
| POST | `/api/projects` | Create project | Org Admin+ |
| GET | `/api/projects/:id` | Get project details | All authenticated |
| PUT | `/api/projects/:id` | Update project | Org Admin+ |
| DELETE | `/api/projects/:id` | Delete project | Org Admin+ |
| POST | `/api/projects/:id` | Duplicate project | Org Admin+ |

### Sketches (Updated)

| Method | Endpoint | Description | Change |
|--------|----------|-------------|--------|
| POST | `/api/sketches` | Create sketch | Now requires `projectId`, copies config |
| PUT | `/api/sketches/:id` | Update sketch | Can change `projectId`, update snapshot |

---

## File Structure

```
src/
├── admin/
│   ├── admin-settings.js          # Existing admin settings
│   └── input-flow-settings.js     # NEW: Visual rule builder
├── state/
│   └── constants.js               # UPDATED: Added DEFAULT_INPUT_FLOW_CONFIG
├── utils/
│   └── input-flow-engine.js       # NEW: Rule evaluation engine
└── legacy/
    └── main.js                    # UPDATED: Integrated rule engine

api/
├── projects/
│   ├── index.js                   # NEW: List/Create projects
│   └── [id].js                    # NEW: CRUD for project
├── sketches/
│   ├── index.js                   # UPDATED: Project support
│   └── [id].js                    # UPDATED: Project support
└── _lib/
    ├── db.js                      # UPDATED: Project functions
    └── schema.sql                 # UPDATED: Projects table
```

---

## Implementation Status

- ✅ Database schema for projects
- ✅ Project CRUD API endpoints
- ✅ Default input flow configuration
- ✅ Input flow rule engine
- ✅ Visual rule builder UI
- ✅ Project selection on sketch creation
- ✅ Dynamic form field behavior
- ✅ i18n translations

---

## Future Enhancements

1. **Rule Templates**: Pre-built rule sets for common scenarios
2. **Field Dependencies**: More complex conditions (AND/OR)
3. **Calculated Fields**: Auto-compute values based on others
4. **Validation Rules**: Custom validation messages
5. **Workflow States**: Multi-step data collection
6. **Audit Trail**: Track which rules were applied

---

## Summary

The Intelligent Input Flow System transforms data collection by:

1. **Reducing Errors**: Invalid field combinations are prevented
2. **Improving Speed**: Irrelevant fields are hidden automatically
3. **Ensuring Consistency**: Organization-wide rules are enforced
4. **Enabling Flexibility**: Each project can have custom rules
5. **Preserving History**: Sketch snapshots maintain data integrity

This creates a smarter, faster, and more reliable field data collection experience.
