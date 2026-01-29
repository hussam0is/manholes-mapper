/**
 * Menu Configuration
 * Declarative structure for all menu actions with hierarchy levels
 */

export const menuConfig = {
  // Primary actions - always visible, prominent styling
  primary: [
    {
      id: 'newSketch',
      icon: 'note_add',
      labelKey: 'newSketch',
      showLabel: true,
    },
    {
      id: 'save',
      icon: 'save',
      labelKey: 'save',
      showLabel: true,
      hasAutosaveIndicator: true,
    },
  ],

  // Search - dedicated group
  search: {
    id: 'searchNode',
    placeholderKey: 'searchNode',
    titleKey: 'searchNodeTitle',
  },

  // Secondary actions - grouped in dropdown on smaller screens
  secondary: [
    {
      id: 'exportSketch',
      icon: 'download',
      labelKey: 'exportSketch',
      group: 'export',
    },
    {
      id: 'importSketch',
      icon: 'upload',
      labelKey: 'importSketch',
      group: 'export',
    },
    { type: 'divider' },
    {
      id: 'exportNodes',
      icon: 'donut_large',
      labelKey: 'exportNodes',
      group: 'csv',
    },
    {
      id: 'exportEdges',
      icon: 'call_split',
      labelKey: 'exportEdges',
      group: 'csv',
    },
    { type: 'divider' },
    {
      id: 'finishWorkday',
      icon: 'done_all',
      labelKey: 'finishWorkday.button',
      variant: 'primary',
      group: 'workday',
    },
    { type: 'divider' },
    {
      id: 'importCoordinates',
      icon: 'place',
      labelKey: 'coordinates.import',
      group: 'coordinates',
    },
    {
      id: 'toggleCoordinates',
      icon: 'my_location',
      labelKey: 'coordinates.enable',
      type: 'toggle',
      group: 'coordinates',
    },
    {
      id: 'coordinateScale',
      icon: 'straighten',
      labelKey: 'coordinates.scale',
      type: 'scale',
      group: 'coordinates',
    },
    { type: 'divider' },
    {
      id: 'toggleLiveMeasure',
      icon: 'gps_fixed',
      labelKey: 'liveMeasure.enable',
      type: 'toggle',
      group: 'gnss',
    },
  ],

  // Size controls - compact segmented group
  sizeControls: [
    {
      id: 'sizeDecrease',
      icon: 'remove_circle_outline',
      labelKey: 'sizeDecrease',
      showLabel: false,
    },
    {
      id: 'sizeIncrease',
      icon: 'add_circle_outline',
      labelKey: 'sizeIncrease',
      showLabel: false,
    },
  ],

  // Utility actions - icon-only, far right
  utility: [
    {
      id: 'autosave',
      type: 'toggle',
      labelKey: 'autosave',
      showLabel: true,
    },
    {
      id: 'language',
      type: 'select',
      labelKey: 'language',
      options: [
        { value: 'he', label: 'עברית' },
        { value: 'en', label: 'English' },
      ],
    },
    {
      id: 'help',
      icon: 'help_outline',
      labelKey: 'help',
      showLabel: false,
    },
    {
      id: 'admin',
      icon: 'tune',
      labelKey: 'admin.manage',
      showLabel: false,
    },
    {
      id: 'projects',
      icon: 'folder_open',
      labelKey: 'projects.title',
      showLabel: false,
    },
    {
      id: 'home',
      icon: 'home',
      labelKey: 'home',
      showLabel: true,
    },
  ],

  // Mobile menu groups for organized slide-out panel
  mobileGroups: [
    {
      id: 'nav',
      labelKey: 'menuGroupNav',
      items: ['home', 'newSketch'],
    },
    {
      id: 'search',
      labelKey: 'menuGroupSearch',
      items: ['searchNode'],
    },
    {
      id: 'view',
      labelKey: 'menuGroupView',
      items: ['sizeDecrease', 'sizeIncrease'],
    },
    {
      id: 'data',
      labelKey: 'menuGroupData',
      items: [
        'exportSketch',
        'importSketch',
        'exportNodes',
        'exportEdges',
        'save',
        'finishWorkday',
        'importCoordinates',
        'toggleCoordinates',
        'coordinateScale',
      ],
    },
    {
      id: 'settings',
      labelKey: 'menuGroupSettings',
      items: ['autosave', 'language', 'help', 'admin', 'projects'],
    },
  ],
};

// Breakpoints for responsive behavior
export const breakpoints = {
  mobile: 600,
  tablet: 900,
  desktop: 1100,
};

// Get all action IDs as a flat list
export function getAllActionIds() {
  const ids = new Set();
  
  menuConfig.primary.forEach(item => ids.add(item.id));
  menuConfig.secondary.forEach(item => {
    if (item.id) ids.add(item.id);
  });
  menuConfig.sizeControls.forEach(item => ids.add(item.id));
  menuConfig.utility.forEach(item => ids.add(item.id));
  
  return Array.from(ids);
}

// Find action config by ID
export function getActionConfig(actionId) {
  const allActions = [
    ...menuConfig.primary,
    ...menuConfig.secondary.filter(item => item.id),
    ...menuConfig.sizeControls,
    ...menuConfig.utility,
  ];
  
  return allActions.find(action => action.id === actionId);
}
