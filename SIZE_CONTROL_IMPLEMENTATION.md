# Size Control Implementation Summary

## Overview
Added the ability to dynamically increase and decrease the size of manhole/drainage/home nodes with proportional font scaling for node labels and edge measurements.

## Changes Made

### 1. User Interface (index.html)
- **Desktop toolbar**: Added size increase/decrease buttons with Material Icons (`add_circle_outline` and `remove_circle_outline`)
- **Mobile menu**: Added corresponding size control buttons with labels
- Buttons are positioned in a segmented control group next to export controls

### 2. State Management (main.js)
- **Size scale state variable**: `sizeScale` (default: 1.0)
- **Size scale range**: 0.5 (50%) to 3.0 (300%)
- **Size scale step**: 0.2 (20% increments)
- **Persistence**: Size preference saved to `localStorage['graphSketch.sizeScale']`
- **Loading**: Size scale restored on app initialization

### 3. Rendering Updates (main.js)

#### Node Rendering (`drawNode` function)
- Node radius scales with `sizeScale`: `NODE_RADIUS * sizeScale`
- Node label font size scales proportionally: `16px * sizeScale`
- Home icon and direct connection badge scale accordingly
- Both regular nodes and drainage nodes (rectangles) scale properly

#### Edge Label Rendering (`drawEdgeLabels` function)
- Edge measurement font size scales: `14px * sizeScale`
- Label offset from edge scales: `6px * sizeScale`

#### Fall Icon Rendering (`drawEdge` function)
- Fall icon distance from node head scales with node size
- Fall icon size scales: `16px * sizeScale`
- Background circle and inner icon scale proportionally

### 4. Hit Detection (main.js)
- **Node selection**: Updated `findNodeAt` to use scaled radius for accurate click detection
- **Touch selection**: Updated `findNodeAtWithExpansion` for touch targets
- **Drainage nodes**: Rectangular hit detection scales with size for drainage/קולטן nodes

### 5. Internationalization (i18n.js)
Added translations for both Hebrew and English:
- **Hebrew**:
  - `sizeIncrease`: 'הגדל גודל'
  - `sizeDecrease`: 'הקטן גודל'
  - `toasts.sizeChanged`: (p) => `` גודל: ${p}% ``
- **English**:
  - `sizeIncrease`: 'Increase size'
  - `sizeDecrease`: 'Decrease size'
  - `toasts.sizeChanged`: (p) => `` Size: ${p}% ``

### 6. Event Handlers (main.js)
- `increaseSizeScale()`: Increases size by 20%, shows toast notification
- `decreaseSizeScale()`: Decreases size by 20%, shows toast notification
- Event listeners attached to both desktop and mobile buttons
- Toast messages show current size percentage (e.g., "גודל: 120%")
- iOS tap-to-click synthesis enabled for size buttons

### 7. Language Support (main.js)
- Button titles update when language is changed
- `applyLangToStaticUI()` function updated to apply translations to size control buttons
- Both desktop and mobile button labels update dynamically

## User Experience
1. **Desktop**: Click the + or - icons in the toolbar to increase/decrease size
2. **Mobile**: Open the hamburger menu and use the size control buttons
3. **Feedback**: Toast notification shows current size percentage
4. **Persistence**: Size preference is saved and restored between sessions
5. **Proportional scaling**: All elements (nodes, fonts, icons, hit areas) scale together

## Technical Details
- Size scale multiplies base values (NODE_RADIUS = 20px)
- Font sizes are rounded to nearest integer for crisp rendering
- Hit detection areas scale to maintain usability at all sizes
- No breaking changes to existing functionality
- Fully compatible with zoom/pan features

## Files Modified
1. `manholes/index.html` - Added UI controls
2. `manholes/src/legacy/main.js` - Core implementation
3. `manholes/src/i18n.js` - Translations

## Build Status
✅ Build successful with no errors
✅ No linter errors
✅ All functionality tested and working

