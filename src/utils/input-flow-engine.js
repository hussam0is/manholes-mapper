/**
 * Input Flow Engine
 * 
 * Evaluates conditional rules and applies actions to form fields
 * based on the input flow configuration.
 */

import { DEFAULT_INPUT_FLOW_CONFIG } from '../state/constants.js';

/**
 * Evaluate a single trigger condition against entity data
 * @param {Object} trigger - The trigger condition { field, operator, value }
 * @param {Object} entity - The node or edge data
 * @returns {boolean} - Whether the trigger condition is met
 */
export function evaluateTrigger(trigger, entity) {
  if (!trigger || !trigger.field) return false;
  
  const fieldValue = entity[trigger.field];
  const triggerValue = trigger.value;
  
  switch (trigger.operator) {
    case 'equals':
      // Handle both string and number comparisons
      return String(fieldValue) === String(triggerValue) || 
             Number(fieldValue) === Number(triggerValue);
    
    case 'not_equals':
      return String(fieldValue) !== String(triggerValue) && 
             Number(fieldValue) !== Number(triggerValue);
    
    case 'empty':
      return fieldValue === null || 
             fieldValue === undefined || 
             fieldValue === '' || 
             fieldValue === 0;
    
    case 'not_empty':
      return fieldValue !== null && 
             fieldValue !== undefined && 
             fieldValue !== '' && 
             fieldValue !== 0;
    
    default:
      return false;
  }
}

/**
 * Evaluate all rules for an entity and return the triggered actions
 * @param {Object} config - The input flow configuration
 * @param {string} entityType - 'nodes' or 'edges'
 * @param {Object} entity - The node or edge data
 * @returns {Object} - Object with field states { disabled: Set, required: Set, nullified: Set, bulkReset: Array }
 */
export function evaluateRules(config, entityType, entity) {
  const result = {
    disabled: new Set(),      // Fields that should be disabled/hidden
    required: new Set(),      // Fields that are required
    nullified: new Set(),     // Fields that should be set to null
    bulkReset: [],           // Arrays of fields to bulk reset
    triggeredRules: []       // List of triggered rule IDs for debugging
  };
  
  // Use default config if none provided
  const effectiveConfig = config || DEFAULT_INPUT_FLOW_CONFIG;
  
  // Get rules for this entity type
  const entityConfig = effectiveConfig[entityType];
  if (!entityConfig || !entityConfig.rules) {
    return result;
  }
  
  // Evaluate each rule
  for (const rule of entityConfig.rules) {
    // Skip disabled rules
    if (rule.enabled === false) continue;
    
    // Check if trigger condition is met
    if (!evaluateTrigger(rule.trigger, entity)) continue;
    
    // Rule is triggered - apply all its actions
    result.triggeredRules.push(rule.id);
    
    for (const action of rule.actions) {
      switch (action.type) {
        case 'nullify':
          if (action.field) {
            result.nullified.add(action.field);
          }
          break;
        
        case 'disable':
          if (action.field) {
            result.disabled.add(action.field);
          }
          break;
        
        case 'require':
          if (action.field) {
            result.required.add(action.field);
          }
          break;
        
        case 'bulk_reset':
          if (Array.isArray(action.fields)) {
            result.bulkReset.push(...action.fields);
            // Bulk reset also nullifies all fields
            action.fields.forEach(f => result.nullified.add(f));
          }
          break;
      }
    }
  }
  
  return result;
}

/**
 * Apply the evaluated rule results to an entity
 * @param {Object} entity - The node or edge data to modify
 * @param {Object} ruleResults - Results from evaluateRules()
 * @param {Object} defaults - Default values for fields (from adminConfig)
 * @returns {Object} - The modified entity
 */
export function applyActions(entity, ruleResults, defaults = {}) {
  const modified = { ...entity };
  
  // Apply nullifications
  for (const field of ruleResults.nullified) {
    // Set to empty/default value based on field type
    if (field === 'cover_diameter') {
      modified.coverDiameter = '';
    } else if (field === 'maintenance_status') {
      modified.maintenanceStatus = 0;
    } else if (field === 'material') {
      modified.material = defaults.material || 'לא ידוע';
    } else if (field === 'access') {
      modified.access = 0;
    } else if (field === 'accuracy_level') {
      modified.accuracyLevel = 0;
    } else if (field === 'line_diameter') {
      modified.line_diameter = '';
    } else if (field === 'fall_depth') {
      modified.fallDepth = '';
    } else if (field === 'engineering_status') {
      modified.engineeringStatus = 0;
    } else if (field === 'notes') {
      modified.notes = '';
    } else {
      // Generic nullification
      modified[field] = null;
    }
  }
  
  return modified;
}

/**
 * Check if a field should be visible (not disabled)
 * @param {Object} ruleResults - Results from evaluateRules()
 * @param {string} fieldKey - The field key to check
 * @returns {boolean} - Whether the field should be visible
 */
export function isFieldVisible(ruleResults, fieldKey) {
  return !ruleResults.disabled.has(fieldKey);
}

/**
 * Check if a field is required
 * @param {Object} ruleResults - Results from evaluateRules()
 * @param {string} fieldKey - The field key to check
 * @returns {boolean} - Whether the field is required
 */
export function isFieldRequired(ruleResults, fieldKey) {
  return ruleResults.required.has(fieldKey);
}

/**
 * Validate entity against required fields
 * @param {Object} entity - The node or edge data
 * @param {Object} ruleResults - Results from evaluateRules()
 * @returns {Array} - Array of missing required field keys
 */
export function validateRequiredFields(entity, ruleResults) {
  const missing = [];
  
  for (const field of ruleResults.required) {
    const value = entity[field];
    if (value === null || value === undefined || value === '' || value === 0) {
      missing.push(field);
    }
  }
  
  return missing;
}

/**
 * Get the effective input flow config for a sketch
 * Uses the sketch's snapshot if available, otherwise falls back to default
 * @param {Object} sketch - The sketch object
 * @returns {Object} - The input flow configuration to use
 */
export function getEffectiveInputFlowConfig(sketch) {
  if (sketch && sketch.snapshotInputFlowConfig && 
      Object.keys(sketch.snapshotInputFlowConfig).length > 0) {
    return sketch.snapshotInputFlowConfig;
  }
  return DEFAULT_INPUT_FLOW_CONFIG;
}

/**
 * Map camelCase entity properties to snake_case field keys used in rules
 * @param {Object} entity - The node or edge data
 * @returns {Object} - Entity with snake_case keys
 */
export function normalizeEntityForRules(entity) {
  return {
    accuracy_level: entity.accuracyLevel,
    maintenance_status: entity.maintenanceStatus,
    cover_diameter: entity.coverDiameter,
    material: entity.material,
    access: entity.access,
    engineering_status: entity.engineeringStatus,
    edge_type: entity.edgeType || entity.edge_type,
    line_diameter: entity.line_diameter,
    fall_depth: entity.fallDepth,
    tail_measurement: entity.tailMeasurement,
    head_measurement: entity.headMeasurement,
    notes: entity.notes,
    // Keep original properties too
    ...entity
  };
}

/**
 * Create an empty rule template
 * @param {string} entityType - 'nodes' or 'edges'
 * @returns {Object} - A new rule template
 */
export function createEmptyRule(entityType) {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: '',
    description: '',
    enabled: true,
    trigger: {
      field: '',
      operator: 'equals',
      value: ''
    },
    actions: []
  };
}

/**
 * Create an empty action template
 * @param {string} type - Action type: 'nullify', 'disable', 'require', 'bulk_reset'
 * @returns {Object} - A new action template
 */
export function createEmptyAction(type = 'nullify') {
  if (type === 'bulk_reset') {
    return { type: 'bulk_reset', fields: [] };
  }
  return { type, field: '' };
}

/**
 * Validate an input flow configuration
 * @param {Object} config - The configuration to validate
 * @returns {Object} - { valid: boolean, errors: Array }
 */
export function validateInputFlowConfig(config) {
  const errors = [];
  
  if (!config) {
    errors.push({ path: '', message: 'Configuration is required' });
    return { valid: false, errors };
  }
  
  // Validate nodes rules
  if (config.nodes && config.nodes.rules) {
    config.nodes.rules.forEach((rule, index) => {
      if (!rule.id) {
        errors.push({ path: `nodes.rules[${index}].id`, message: 'Rule ID is required' });
      }
      if (!rule.trigger || !rule.trigger.field) {
        errors.push({ path: `nodes.rules[${index}].trigger.field`, message: 'Trigger field is required' });
      }
      if (!rule.actions || rule.actions.length === 0) {
        errors.push({ path: `nodes.rules[${index}].actions`, message: 'At least one action is required' });
      }
    });
  }
  
  // Validate edges rules
  if (config.edges && config.edges.rules) {
    config.edges.rules.forEach((rule, index) => {
      if (!rule.id) {
        errors.push({ path: `edges.rules[${index}].id`, message: 'Rule ID is required' });
      }
      if (!rule.trigger || !rule.trigger.field) {
        errors.push({ path: `edges.rules[${index}].trigger.field`, message: 'Trigger field is required' });
      }
      if (!rule.actions || rule.actions.length === 0) {
        errors.push({ path: `edges.rules[${index}].actions`, message: 'At least one action is required' });
      }
    });
  }
  
  return { valid: errors.length === 0, errors };
}
