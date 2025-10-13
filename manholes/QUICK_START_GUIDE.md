# Quick Start Guide: Export/Import Sketches

## 🎯 Where to Find the Export/Import Buttons

### Desktop View (Toolbar)

The new export/import buttons are in the main toolbar:

```
┌─────────────────────────────────────────────────────────────────┐
│  [שרטוט חדש] [שמור] [🔍 Search] [⬇️] [⬆️] [CSV] [CSV] [+] [-]  │
│                                     ↑    ↑                       │
│                              EXPORT IMPORT                       │
└─────────────────────────────────────────────────────────────────┘
```

- **⬇️ Download Icon** = Export Sketch (JSON)
- **⬆️ Upload Icon** = Import Sketch (JSON)
- CSV buttons are for exporting nodes/edges to Excel (different from sketch export)

### Mobile View (Menu)

On mobile devices, tap the menu button (☰) to see:

```
┌─────────────────────────┐
│  בית                    │
│  שרטוט חדש              │
│  🔍 חפש שוחה...         │
│  הקטן זום               │
│  הגדל זום               │
│  הקטן גודל              │
│  הגדל גודל              │
│  ⬇️ יצוא שרטוט  ← NEW  │
│  ⬆️ יבוא שרטוט  ← NEW  │
│  יצוא שוחות (CSV)       │
│  יצוא קווים (CSV)       │
│  שמירה                  │
│  ...                    │
└─────────────────────────┘
```

## 📤 How to Export a Sketch

### Step by Step:

1. **Create or open a sketch** with some nodes and edges
2. **Click the download icon (⬇️)** in the toolbar
   - Desktop: In main toolbar
   - Mobile: In menu → "יצוא שרטוט"
3. **File downloads automatically** as: `sketch_[name]_[date].json`
4. **Success toast appears**: "שרטוט יוצא" / "Sketch exported"

### What Gets Exported:
- ✅ All node positions (x, y coordinates)
- ✅ All node properties (ID, type, material, notes, etc.)
- ✅ All edge connections and measurements
- ✅ Sketch metadata (name, creation date)

## 📥 How to Import a Sketch

### Step by Step:

1. **Click the upload icon (⬆️)** in the toolbar
   - Desktop: In main toolbar
   - Mobile: In menu → "יבוא שרטוט"
2. **File picker opens** - select a `.json` file
3. **Confirmation dialog** (if you have a current sketch):
   - "יבוא שרטוט ידרוס את השרטוט הנוכחי. להמשיך?"
   - "Importing a sketch will replace the current sketch. Continue?"
4. **Click OK** to proceed
5. **Sketch loads** with all nodes at their original positions
6. **View auto-centers** on the imported sketch
7. **Success toast**: "שרטוט יובא בהצלחה" / "Sketch imported successfully"

### Safety Features:
- ✅ Validates JSON structure before importing
- ✅ Checks for required fields (x, y, id, etc.)
- ✅ Confirms before replacing current sketch
- ✅ Shows detailed error messages if import fails

## 🧪 Test with Sample File

A sample sketch is included: `manholes/sample_sketch_export.json`

To test:
1. Start the app: `npm run dev`
2. Click import button (⬆️)
3. Select `sample_sketch_export.json`
4. You should see:
   - 4 nodes (2 manholes, 1 drainage, 1 home)
   - 3 edges connecting them
   - All positioned correctly

## 🆚 Export Comparison

### JSON Export (NEW) - Full Sketch Backup
- **Button**: ⬇️ Download icon / "יצוא שרטוט"
- **Format**: Single JSON file
- **Contains**: Everything including x,y coordinates
- **Purpose**: Backup, sharing, transfer between devices
- **Can re-import**: ✅ YES

### CSV Export (Existing) - Data Analysis
- **Buttons**: CSV icons with labels
- **Format**: Two separate CSV files (nodes.csv, edges.csv)
- **Contains**: Node/edge data for Excel (no coordinates)
- **Purpose**: Data analysis, reporting
- **Can re-import**: ❌ NO

## 💡 Common Use Cases

### Backup Your Work
```
1. Finish working on a sketch
2. Export to JSON
3. Save file to cloud storage or backup drive
```

### Share with Team
```
1. Export sketch to JSON
2. Send file via email/chat
3. Team member imports on their device
4. All positions preserved perfectly
```

### Transfer Between Devices
```
1. Export on tablet
2. Import on desktop
3. Continue work seamlessly
```

### Create Templates
```
1. Create a standard layout
2. Export as template
3. Import whenever starting new projects
```

## 🔧 Troubleshooting

### Import Not Working?
- ✅ Check file is valid JSON (not CSV)
- ✅ Check file was exported from this app
- ✅ Look for specific error message
- ✅ Check browser console for details

### Coordinates Not Preserved?
- ✅ Make sure you used JSON export (not CSV)
- ✅ Verify JSON file contains "x" and "y" fields
- ✅ Check file wasn't manually edited

### File Won't Download?
- ✅ Check browser allows downloads
- ✅ Look in Downloads folder
- ✅ Try different browser if issues persist

## 📱 Mobile Tips

- **Pinch to zoom** before/after import to see full sketch
- **Long press** on menu items for tooltips
- **Import from cloud**: Use Files app to access cloud storage
- **Share exports**: Use share button in file picker

## 🎨 File Naming

Exports are automatically named:
- Pattern: `sketch_[name]_[date].json`
- Example: `sketch_Downtown_Network_2024-10-13.json`
- If no name: `sketch_2024-10-13.json`

## ⌨️ Keyboard Shortcuts

No specific shortcuts for export/import, but useful while working:
- `N` - Node mode
- `E` - Edge mode  
- `Esc` - Cancel/clear selection
- `Delete` - Delete selected item
- `=` / `-` - Zoom in/out
- `0` - Reset zoom

## 🚀 Next Steps

1. Try exporting your current sketches
2. Test importing the sample file
3. Create a backup routine
4. Share sketches with team members

---

**Need help?** Check `SKETCH_EXPORT_IMPORT.md` for detailed technical documentation.

