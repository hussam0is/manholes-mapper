// Centralized constants and option catalogs for Graph Sketcher
// NOTE: main.js still defines these inline; we will switch imports to this module incrementally.

export const NODE_RADIUS = 20;

export const COLORS = {
  node: {
    fillDefault: '#60a5fa',   // blue-400 (more blue)
    fillMissing: '#fb923c',   // orange-400 (more orange)
    fillSelectedMissing: '#fed7aa', // orange-200 (richer than 100)
    fillBlocked: '#cbd5e1',   // slate-300
    fillSelected: '#bfdbfe',  // blue-200 (richer than 100)
    stroke: '#2563eb',        // blue-600
    label: '#1f2937',         // slate-800
  },
  edge: {
    typePrimary: '#2563eb',   // blue-600
    typeSecondary: '#0d9488', // teal-600
    selected: '#7c3aed',      // violet-600
    preview: '#94a3b8',       // slate-400
    label: '#334155',         // slate-700
  }
};

export const NODE_TYPES = ['type1', 'type2'];

export const NODE_MATERIAL_OPTIONS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'פלדה מגולוונת' },
  { code: 2, label: 'פלדה עם ציפוי פנים וחוץ' },
  { code: 3, label: 'פלדה ללא ציפוי' },
  { code: 4, label: 'פי. וי. סי. לפי ת"י 884' },
  { code: 5, label: 'פי. וי. סי. לחץ' },
  { code: 6, label: 'פיברגלס' },
  { code: 7, label: 'בטון' },
  { code: 8, label: 'אסבסט צמנט' },
  { code: 10, label: 'פקסגול - פוליאטילן' },
  { code: 11, label: 'יציקת ברזל' },
  { code: 12, label: 'פלסטיק - שוחת חופית' },
  { code: 13, label: 'שוחת PVC' },
  { code: 9, label: 'אבו' },
];

export const NODE_COVER_DIAMETERS = ['לא ידוע', '35', '45', '55', '65'];

export const NODE_ACCESS_OPTIONS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'מדרגות ברזל חשוף' },
  { code: 2, label: 'מדרגות ברזל מצופה PVC' },
  { code: 3, label: 'סולם פלדה' },
  { code: 4, label: 'אין אמצעי ירידה' },
  { code: 5, label: 'מדרגות PVC מובנות' },
];

export const NODE_ENGINEERING_STATUS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'פעיל' },
  { code: 2, label: 'לא פעיל' },
  { code: 3, label: 'מתוכנן' },
  { code: 4, label: 'מבוטל' },
];

export const NODE_MAINTENANCE_OPTIONS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'תקין' },
  { code: 2, label: 'אביזר שבור' },
  { code: 3, label: 'לא ניתן לפתיחה' },
  { code: 4, label: 'שוחה מכוסה' },
  { code: 5, label: 'שוחת ביוב - ללא גישה' },
  { code: 6, label: 'שוחה מלאה חול / זבל' },
  { code: 7, label: 'מספל גבוה (סתומה)' },
  { code: 8, label: 'מכסה שבור/לא תקין' },
  { code: 9, label: 'שוחה יבשה/קו יבש' },
  { code: 10, label: 'ללא מכסה' },
  { code: 11, label: 'לא מחובר' },
  { code: 12, label: 'הכנה' },
  { code: 13, label: 'בית נעול' },
  { code: 14, label: 'אחר' },
];

// Accuracy level for nodes (0 = Engineering, 1 = Schematic)
export const NODE_ACCURACY_OPTIONS = [
  { code: 0, label: 'הנדסית' },
  { code: 1, label: 'סכימטית' },
];

export const EDGE_MATERIAL_OPTIONS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'פלדה מגולוונת' },
  { code: 2, label: 'פלדה עם ציפוי פנים וחוץ' },
  { code: 3, label: 'פלדה ללא ציפוי' },
  { code: 4, label: 'פי. וי. סי. לפי ת"י 884' },
  { code: 5, label: 'פי. וי. סי. לחץ' },
  { code: 6, label: 'פיברגלס' },
  { code: 7, label: 'בטון' },
  { code: 8, label: 'אסבסט צמנט' },
  { code: 10, label: 'פקסגול - פוליאטילן' },
  { code: 11, label: 'יציקת ברזל' },
  { code: 12, label: 'פלסטיק - שוחת חופית' },
  { code: 13, label: 'שוחת PVC' },
  { code: 9, label: 'אבו' },
];

export const EDGE_LINE_DIAMETERS = [
  '10','25','26','50','75','100','150','160','200','250','300','350','400','500','600','650','700','800','900','1000','1250','1500','1800','2000'
];

export const EDGE_TYPES = ['קו ראשי', 'קו סניקה', 'קו משני'];

export const EDGE_TYPE_COLORS = {
  'קו ראשי': COLORS.edge.typePrimary,
  'קו סניקה': '#fb923c',
  'קו משני': COLORS.edge.typeSecondary,
};

// Colors used when an edge is selected: slightly lighter variant per edge type
export const EDGE_TYPE_SELECTED_COLORS = {
  'קו ראשי': '#60a5fa',   // lighter than base, stronger blue (blue-400)
  'קו סניקה': '#fdba74',  // lighter than base, more orange (orange-300)
  'קו משני': '#86efac',   // lighter green (green-300)
};

export const EDGE_TYPE_OPTIONS = [
  { code: 4801, label: 'קו ראשי' },
  { code: 4802, label: 'קו סניקה' },
  { code: 4803, label: 'קו משני' },
];

export const EDGE_ENGINEERING_STATUS = [
  { code: 0, label: 'לא ידוע' },
  { code: 1, label: 'פעיל' },
  { code: 2, label: 'לא פעיל' },
  { code: 3, label: 'מתוכנן' },
  { code: 4, label: 'מבוטל' },
];
