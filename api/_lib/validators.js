/**
 * Input validation helpers for API routes
 * 
 * Provides schema validation to prevent malformed/malicious payloads.
 */

// Limits
const MAX_NODES = 10000;
const MAX_EDGES = 50000;
const MAX_STRING_LENGTH = 1000;
const MAX_NOTE_LENGTH = 5000;
const MAX_NAME_LENGTH = 200;

// Valid role values
export const VALID_ROLES = ['user', 'admin', 'super_admin'];

// Valid feature keys
export const VALID_FEATURE_KEYS = [
  'export_csv',
  'export_sketch',
  'admin_settings',
  'finish_workday',
  'node_types',
  'edge_types',
];

/**
 * Validate and sanitize a string value
 * @param {any} value - Value to validate
 * @param {number} maxLen - Maximum allowed length
 * @returns {string|null} - Sanitized string or null
 */
export function validateString(value, maxLen = MAX_STRING_LENGTH) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  return value.slice(0, maxLen);
}

/**
 * Validate a role value
 * @param {string} role - Role to validate
 * @returns {boolean}
 */
export function validateRole(role) {
  return VALID_ROLES.includes(role);
}

/**
 * Validate a feature key
 * @param {string} key - Feature key to validate
 * @returns {boolean}
 */
export function validateFeatureKey(key) {
  return VALID_FEATURE_KEYS.includes(key);
}

/**
 * Validate UUID format
 * @param {string} id - ID to validate
 * @returns {boolean}
 */
export function validateUUID(id) {
  if (typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Validate sketch input data
 * @param {Object} body - Request body
 * @returns {string[]|null} - Array of error messages or null if valid
 */
export function validateSketchInput(body) {
  const errors = [];

  // Validate name (can be null or string)
  if (body.name !== undefined && body.name !== null) {
    if (typeof body.name !== 'string') {
      errors.push('name must be a string or null');
    } else if (body.name.length > MAX_NAME_LENGTH) {
      errors.push(`name exceeds maximum of ${MAX_NAME_LENGTH} characters`);
    }
  }

  // Validate nodes array
  if (body.nodes !== undefined) {
    if (!Array.isArray(body.nodes)) {
      errors.push('nodes must be an array');
    } else if (body.nodes.length > MAX_NODES) {
      errors.push(`nodes exceeds maximum of ${MAX_NODES}`);
    } else {
      // Validate node structure
      for (let i = 0; i < body.nodes.length; i++) {
        const node = body.nodes[i];
        if (typeof node !== 'object' || node === null) {
          errors.push(`node at index ${i} must be an object`);
          break;
        }
        if (typeof node.x !== 'number' || typeof node.y !== 'number') {
          errors.push(`node at index ${i} must have numeric x and y coordinates`);
          break;
        }
        if (!node.id) {
          errors.push(`node at index ${i} must have an id`);
          break;
        }
      }
    }
  }

  // Validate edges array
  if (body.edges !== undefined) {
    if (!Array.isArray(body.edges)) {
      errors.push('edges must be an array');
    } else if (body.edges.length > MAX_EDGES) {
      errors.push(`edges exceeds maximum of ${MAX_EDGES}`);
    } else {
      // Validate edge structure
      for (let i = 0; i < body.edges.length; i++) {
        const edge = body.edges[i];
        if (typeof edge !== 'object' || edge === null) {
          errors.push(`edge at index ${i} must be an object`);
          break;
        }
        // Dangling edges: tail can be null (inbound) or head can be null (outbound)
        // At least one of tail or head must be present
        const hasTail = edge.tail !== null && edge.tail !== undefined;
        const hasHead = edge.head !== null && edge.head !== undefined;
        if (!hasTail && !hasHead) {
          errors.push(`edge at index ${i} must have at least a tail or head`);
          break;
        }
        // Note: tailPosition/danglingEndpoint are recommended for dangling edges
        // but not strictly required for backward compatibility
      }
    }
  }

  // Validate adminConfig
  if (body.adminConfig !== undefined) {
    if (typeof body.adminConfig !== 'object' || body.adminConfig === null || Array.isArray(body.adminConfig)) {
      errors.push('adminConfig must be an object');
    }
  }

  // Validate creationDate format if provided
  if (body.creationDate !== undefined && body.creationDate !== null) {
    if (typeof body.creationDate !== 'string') {
      errors.push('creationDate must be a string');
    }
  }

  return errors.length > 0 ? errors : null;
}

/**
 * Validate user update input
 * @param {Object} body - Request body
 * @param {boolean} isSuperAdmin - Whether requester is super admin
 * @returns {string[]|null} - Array of error messages or null if valid
 */
export function validateUserUpdateInput(body, isSuperAdmin = false) {
  const errors = [];

  // Validate role
  if (body.role !== undefined) {
    if (typeof body.role !== 'string') {
      errors.push('role must be a string');
    } else if (!VALID_ROLES.includes(body.role)) {
      errors.push(`role must be one of: ${VALID_ROLES.join(', ')}`);
    }
  }

  // Validate organizationId
  if (body.organizationId !== undefined && body.organizationId !== null) {
    if (typeof body.organizationId !== 'string') {
      errors.push('organizationId must be a string');
    } else if (!validateUUID(body.organizationId)) {
      errors.push('organizationId must be a valid UUID');
    }
  }

  return errors.length > 0 ? errors : null;
}

/**
 * Validate organization input
 * @param {Object} body - Request body
 * @returns {string[]|null} - Array of error messages or null if valid
 */
export function validateOrganizationInput(body) {
  const errors = [];

  if (body.name === undefined || body.name === null) {
    errors.push('name is required');
  } else if (typeof body.name !== 'string') {
    errors.push('name must be a string');
  } else if (body.name.trim().length === 0) {
    errors.push('name cannot be empty');
  } else if (body.name.length > MAX_NAME_LENGTH) {
    errors.push(`name exceeds maximum of ${MAX_NAME_LENGTH} characters`);
  }

  return errors.length > 0 ? errors : null;
}

/**
 * Validate features update input
 * @param {Object} body - Request body
 * @returns {string[]|null} - Array of error messages or null if valid
 */
export function validateFeaturesInput(body) {
  const errors = [];

  if (!body.features || typeof body.features !== 'object' || Array.isArray(body.features)) {
    errors.push('features must be an object');
    return errors;
  }

  for (const [key, value] of Object.entries(body.features)) {
    if (!VALID_FEATURE_KEYS.includes(key)) {
      errors.push(`invalid feature key: ${key}`);
    }
    if (typeof value !== 'boolean') {
      errors.push(`feature value for ${key} must be boolean`);
    }
  }

  return errors.length > 0 ? errors : null;
}
