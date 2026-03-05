import { describe, it, expect } from 'vitest';
import { validateSketchInput, validateUUID } from '../../api/_lib/validators.js';
import { 
  validSketch, 
  danglingEdgeSketch, 
  invalidNodeSketch, 
  oversizedSketch 
} from '../fixtures/sketches.js';

describe('Validators Unit Tests', () => {
  describe('validateSketchInput', () => {
    it('should return null for valid sketch data', () => {
      const errors = validateSketchInput(validSketch);
      expect(errors).toBeNull();
    });

    it('should return null for minimal valid sketch', () => {
      const errors = validateSketchInput({
        name: 'Minimal',
        nodes: [],
        edges: []
      });
      expect(errors).toBeNull();
    });

    it('should return null for sketch with dangling edges', () => {
      const errors = validateSketchInput(danglingEdgeSketch);
      expect(errors).toBeNull();
    });

    it('should reject non-string name', () => {
      const errors = validateSketchInput({ name: 123 });
      expect(errors).toContain('name must be a string or null');
    });

    it('should reject non-array nodes', () => {
      const errors = validateSketchInput({ nodes: {} });
      expect(errors).toContain('nodes must be an array');
    });

    it('should reject nodes without numeric coordinates', () => {
      const errors = validateSketchInput(invalidNodeSketch);
      expect(errors).toContain('node at index 0 must have numeric x and y coordinates');
    });

    it('should reject nodes without id', () => {
      const errors = validateSketchInput({
        nodes: [{ x: 10, y: 20 }]
      });
      expect(errors).toContain('node at index 0 must have an id');
    });

    it('should reject edges that have neither tail nor head', () => {
      const errors = validateSketchInput({
        edges: [{ id: 'e1' }]
      });
      expect(errors).toContain('edge at index 0 must have at least a tail or head');
    });

    it('should reject oversized node array', () => {
      const bigSketch = oversizedSketch(10001);
      const errors = validateSketchInput(bigSketch);
      expect(errors).toContain('nodes exceeds maximum of 10000');
    });

    it('should reject non-object adminConfig', () => {
      const errors = validateSketchInput({ adminConfig: 'not-an-object' });
      expect(errors).toContain('adminConfig must be an object');
    });
  });

  describe('validateUUID', () => {
    it('should return true for valid UUID', () => {
      expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(validateUUID('7f33d02b-871c-4394-884b-017e88c79219')).toBe(true);
    });

    it('should return false for invalid UUID format', () => {
      expect(validateUUID('not-a-uuid')).toBe(false);
      expect(validateUUID('550e8400-e29b-41d4-a716')).toBe(false);
      expect(validateUUID('')).toBe(false);
      expect(validateUUID(null as any)).toBe(false);
    });
  });
});
