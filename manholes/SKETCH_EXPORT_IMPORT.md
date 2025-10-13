# Sketch Export/Import Feature

## Overview

The manholes mapper application now supports exporting and importing complete sketches in JSON format. This feature preserves all data including:
- **Node coordinates (x, y)** - Critical for maintaining sketch layout
- Node properties (ID, type, material, measurements, notes, etc.)
- Edge connections and properties
- Sketch metadata (creation date, name, nextNodeId)

## Features

### Export Sketch
- **Format**: JSON with human-readable structure
- **What's preserved**:
  - All node data including exact x,y coordinates
  - All edge data including measurements and properties
  - Sketch metadata (creation date, name)
  - Schema version for future compatibility
- **File naming**: Automatically generates filename based on sketch name and date
  - Example: `sketch_My_Project_2024-10-13.json`

### Import Sketch
- **Validation**: Automatically validates imported data structure
- **Safety**: Prompts before replacing current sketch
- **Recovery**: File input resets after import, allowing same file to be re-imported
- **Compatibility**: Supports sketches exported from this application

## How to Use

### Exporting a Sketch

1. **Desktop**: Click the download icon (⬇️) in the toolbar
2. **Mobile**: Open menu → "יצוא שרטוט" (Export Sketch)
3. The JSON file will be downloaded automatically

### Importing a Sketch

1. **Desktop**: Click the upload icon (⬆️) in the toolbar
2. **Mobile**: Open menu → "יבוא שרטוט" (Import Sketch)
3. Select a JSON file from your device
4. If you have a current sketch, confirm replacement
5. The imported sketch will load with all coordinates preserved

## Data Structure

### JSON Schema

```json
{
  "version": "1.0",
  "exportDate": "2024-10-13T12:00:00.000Z",
  "sketch": {
    "id": "sk_xxx",
    "name": "My Sketch",
    "creationDate": "2024-10-13",
    "nextNodeId": 5,
    "nodes": [
      {
        "id": "1",
        "x": 250.5,
        "y": 180.3,
        "nodeType": "Manhole",
        "type": "type1",
        "note": "Main junction",
        "material": "בטון",
        "coverDiameter": 60,
        "access": 1,
        "accuracyLevel": 2,
        "maintenanceStatus": 0,
        "nodeEngineeringStatus": 0
      }
    ],
    "edges": [
      {
        "id": 1697123456789.123,
        "tail": "1",
        "head": "2",
        "tail_measurement": "1.5",
        "head_measurement": "2.0",
        "fall_depth": "0.5",
        "fall_position": "1",
        "line_diameter": "200",
        "edge_type": "קו ראשי",
        "material": "בטון",
        "engineeringStatus": 0,
        "maintenanceStatus": 0,
        "note": ""
      }
    ]
  }
}
```

### Critical Fields

**Nodes:**
- `x, y`: Coordinates (numbers) - **Must be preserved**
- `id`: Unique identifier (string)
- `nodeType`: "Manhole", "Home", "Drainage", or "קולטן"

**Edges:**
- `tail, head`: Node IDs that the edge connects
- `id`: Unique identifier for the edge

**Sketch:**
- `nextNodeId`: Next available node ID (important for maintaining ID sequence)
- `creationDate`: Original creation date

## Use Cases

### 1. Backup and Archive
Export sketches regularly to create backups of your work.

### 2. Share Sketches
Share complete sketches with team members who can import them on their devices.

### 3. Transfer Between Devices
Export on one device, import on another - all coordinates preserved.

### 4. Version Control
Export sketches at different stages of a project for version history.

### 5. Merge/Combine Sketches
Export individual sketches and manually merge JSON files if needed.

## Differences from CSV Export

| Feature | JSON Export | CSV Export |
|---------|-------------|------------|
| **Purpose** | Complete sketch backup | Data analysis |
| **Coordinates** | ✅ Preserved | ❌ Not included |
| **Re-import** | ✅ Full restoration | ❌ Not supported |
| **Format** | Single JSON file | Separate files (nodes/edges) |
| **Use Case** | Backup, sharing | Excel analysis |

## Technical Details

### Validation on Import
The import function validates:
1. JSON structure is correct
2. `sketch` object exists
3. `nodes` and `edges` are arrays
4. Each node has required `x`, `y`, `id` fields
5. Each edge has required `tail`, `head` fields

### Error Handling
- Invalid JSON format → Error message with details
- Missing required fields → Specific validation error
- File read errors → User-friendly error message

### Storage Integration
- Imported sketches are saved to IndexedDB
- Works offline (PWA feature)
- Auto-save if enabled

## File Locations

- **Implementation**: `manholes/src/utils/sketch-io.js`
- **UI Integration**: `manholes/src/legacy/main.js`
- **Translations**: `manholes/src/i18n.js`
- **UI Elements**: `manholes/index.html`

## Translation Keys

### Hebrew (he)
- `exportSketch`: "יצוא שרטוט"
- `importSketch`: "יבוא שרטוט"
- `toasts.sketchExported`: "שרטוט יוצא"
- `toasts.sketchImported`: "שרטוט יובא בהצלחה"
- `alerts.noSketchToExport`: "אין שרטוט ליצוא"
- `alerts.confirmImportReplace`: "יבוא שרטוט ידרוס את השרטוט הנוכחי. להמשיך?"

### English (en)
- `exportSketch`: "Export Sketch"
- `importSketch`: "Import Sketch"
- `toasts.sketchExported`: "Sketch exported"
- `toasts.sketchImported`: "Sketch imported successfully"
- `alerts.noSketchToExport`: "There is no sketch to export"
- `alerts.confirmImportReplace`: "Importing a sketch will replace the current sketch. Continue?"

## Future Enhancements

Possible improvements:
1. Batch import/export of multiple sketches
2. Export to different formats (SVG, PNG)
3. Partial import (merge with existing sketch)
4. Cloud sync integration
5. Sketch comparison/diff view

## Notes

- The x,y coordinates are preserved exactly as floating-point numbers
- Node IDs are maintained as strings for consistency
- Edge IDs are numeric timestamps with random component
- The schema includes a version field for future compatibility

