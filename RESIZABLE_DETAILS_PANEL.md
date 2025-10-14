# Resizable Details Panel Implementation

## Overview
The details panel (sidebar/drawer) is now fully resizable, allowing users to drag it up and down to adjust its size according to their needs.

## Features

### 1. **Drag Handle**
- A visual drag handle bar appears at the top of the details panel
- The handle is 40px wide and 4px tall with a subtle grey color
- Hover/active states provide visual feedback (darker grey)
- Uses `ns-resize` cursor to indicate vertical resizing capability

### 2. **Resizing Behavior**
- **Mouse Support**: Click and drag the handle bar to resize
- **Touch Support**: Touch and drag for mobile devices
- **Min Height**: 150px minimum to ensure usability
- **Max Height**: 85% of viewport height to prevent covering the entire screen
- **Smooth Dragging**: Transitions are disabled during resize for responsive feel

### 3. **Persistence**
- Panel height is saved to localStorage
- Restored automatically when the panel is reopened
- Survives page refreshes and navigation

### 4. **Responsive Design**
- Works on both desktop and mobile devices
- Automatically adjusts constraints based on viewport size
- Window resize events are handled gracefully

## Technical Implementation

### Files Modified/Created:

1. **`manholes/index.html`**
   - Added drag handle structure before the sidebar header
   ```html
   <div class="sidebar-drag-handle">
     <div class="drag-handle-bar"></div>
   </div>
   ```

2. **`manholes/styles.css`**
   - Added styles for the drag handle
   - Added `.resizing` class to disable transitions during drag
   - Visual feedback for hover/active states

3. **`manholes/src/utils/resizable-drawer.js`** (NEW)
   - Core resizing logic
   - Event handlers for mouse and touch
   - localStorage integration
   - Height constraints and validation

4. **`manholes/src/main-entry.js`**
   - Imported and initialized the resizable drawer module
   - Runs on DOMContentLoaded

## User Experience

### Desktop
- Hover over the drag handle to see the resize cursor
- Click and drag to adjust panel height
- Release to set the height

### Mobile
- Touch and drag the handle bar at the top of the panel
- Smooth, responsive dragging experience
- Automatically constrained to reasonable sizes

## CSS Classes

- `.sidebar-drag-handle` - Container for the drag handle
- `.drag-handle-bar` - Visual bar element that users interact with
- `.resizing` - Applied during resize to disable transitions

## JavaScript API

The module exports:
- `initResizableDrawer()` - Main initialization function

### Event Flow:
1. **Start**: `mousedown` / `touchstart` on drag handle
2. **Resize**: `mousemove` / `touchmove` updates height
3. **End**: `mouseup` / `touchend` saves to localStorage

## Browser Support
- Modern browsers with ES6 module support
- Touch events for mobile devices
- localStorage API for persistence
- MutationObserver for class change detection

## Future Enhancements
- Double-click/tap to reset to default height
- Snap points for common sizes (small, medium, large)
- Animation when snapping to predefined sizes
- Visual indicators for min/max constraints

