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
  searchAddress: {
    id: 'searchAddress',
    placeholderKey: 'searchAddress',
    titleKey: 'searchAddressTitle',
  },

  // Secondary actions - organized in dropdown with clear groups
  secondaryGroups: [
    {
      id: 'sketch',
      labelKey: 'menuGroup.sketch',
      icon: 'description',
      items: [
        {
          id: 'exportSketch',
          icon: 'download',
          labelKey: 'exportSketch',
        },
        {
          id: 'importSketch',
          icon: 'upload',
          labelKey: 'importSketch',
        },
      ],
    },
    {
      id: 'csv',
      labelKey: 'menuGroup.csv',
      icon: 'table_chart',
      items: [
        {
          id: 'exportNodes',
          icon: 'donut_large',
          labelKey: 'exportNodes',
        },
        {
          id: 'exportEdges',
          icon: 'call_split',
          labelKey: 'exportEdges',
        },
      ],
    },
    {
      id: 'workday',
      labelKey: 'menuGroup.workday',
      icon: 'schedule',
      items: [
        {
          id: 'finishWorkday',
          icon: 'done_all',
          labelKey: 'finishWorkday.button',
          variant: 'success',
        },
      ],
    },
    {
      id: 'location',
      labelKey: 'menuGroup.location',
      icon: 'location_on',
      items: [
        {
          id: 'importCoordinates',
          icon: 'place',
          labelKey: 'coordinates.import',
        },
        {
          id: 'toggleCoordinates',
          icon: 'my_location',
          labelKey: 'coordinates.enable',
          type: 'toggle',
        },
        {
          id: 'coordinateScale',
          icon: 'straighten',
          labelKey: 'coordinates.scale',
          type: 'scale',
        },
        {
          id: 'toggleMapLayer',
          icon: 'map',
          labelKey: 'mapLayer.enable',
          type: 'toggle',
        },
      ],
    },
    {
      id: 'gnss',
      labelKey: 'menuGroup.gnss',
      icon: 'satellite_alt',
      items: [
        {
          id: 'toggleLiveMeasure',
          icon: 'gps_fixed',
          labelKey: 'liveMeasure.enable',
          type: 'toggle',
        },
      ],
    },
    {
      id: 'survey',
      labelKey: 'menuGroup.survey',
      icon: 'precision_manufacturing',
      items: [
        {
          id: 'connectSurveyBluetooth',
          icon: 'bluetooth',
          labelKey: 'survey.connectBluetooth',
        },
        {
          id: 'connectSurveyWebSocket',
          icon: 'wifi',
          labelKey: 'survey.connectWebSocket',
        },
        {
          id: 'disconnectSurvey',
          icon: 'bluetooth_disabled',
          labelKey: 'survey.disconnect',
        },
      ],
    },
  ],

  // Legacy flat secondary array (for compatibility)
  secondary: [
    {
      id: 'exportSketch',
      icon: 'download',
      labelKey: 'exportSketch',
      group: 'sketch',
    },
    {
      id: 'importSketch',
      icon: 'upload',
      labelKey: 'importSketch',
      group: 'sketch',
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
      variant: 'success',
      group: 'workday',
    },
    { type: 'divider' },
    {
      id: 'importCoordinates',
      icon: 'place',
      labelKey: 'coordinates.import',
      group: 'location',
    },
    {
      id: 'toggleCoordinates',
      icon: 'my_location',
      labelKey: 'coordinates.enable',
      type: 'toggle',
      group: 'location',
    },
    {
      id: 'coordinateScale',
      icon: 'straighten',
      labelKey: 'coordinates.scale',
      type: 'scale',
      group: 'location',
    },
    {
      id: 'toggleMapLayer',
      icon: 'map',
      labelKey: 'mapLayer.enable',
      type: 'toggle',
      group: 'location',
    },
    { type: 'divider' },
    {
      id: 'toggleLiveMeasure',
      icon: 'gps_fixed',
      labelKey: 'liveMeasure.enable',
      type: 'toggle',
      group: 'gnss',
    },
    { type: 'divider' },
    {
      id: 'connectSurveyBluetooth',
      icon: 'bluetooth',
      labelKey: 'survey.connectBluetooth',
      group: 'survey',
    },
    {
      id: 'connectSurveyWebSocket',
      icon: 'wifi',
      labelKey: 'survey.connectWebSocket',
      group: 'survey',
    },
    {
      id: 'disconnectSurvey',
      icon: 'bluetooth_disabled',
      labelKey: 'survey.disconnect',
      group: 'survey',
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
      icon: 'home',
      items: ['home', 'newSketch'],
    },
    {
      id: 'search',
      labelKey: 'menuGroupSearch',
      icon: 'search',
      items: ['searchNode', 'searchAddress'],
    },
    {
      id: 'view',
      labelKey: 'menuGroupView',
      icon: 'visibility',
      items: ['sizeDecrease', 'sizeIncrease'],
    },
    {
      id: 'sketch',
      labelKey: 'menuGroup.sketch',
      icon: 'description',
      items: ['save', 'exportSketch', 'importSketch'],
    },
    {
      id: 'csv',
      labelKey: 'menuGroup.csv',
      icon: 'table_chart',
      items: ['exportNodes', 'exportEdges'],
    },
    {
      id: 'location',
      labelKey: 'menuGroup.location',
      icon: 'location_on',
      items: ['importCoordinates', 'toggleCoordinates', 'coordinateScale', 'toggleMapLayer'],
    },
    {
      id: 'gnss',
      labelKey: 'menuGroup.gnss',
      icon: 'satellite_alt',
      items: ['toggleLiveMeasure'],
    },
    {
      id: 'survey',
      labelKey: 'menuGroup.survey',
      icon: 'precision_manufacturing',
      items: ['connectSurveyBluetooth', 'connectSurveyWebSocket', 'disconnectSurvey'],
    },
    {
      id: 'workday',
      labelKey: 'menuGroup.workday',
      icon: 'schedule',
      items: ['finishWorkday'],
    },
    {
      id: 'settings',
      labelKey: 'menuGroupSettings',
      icon: 'settings',
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
