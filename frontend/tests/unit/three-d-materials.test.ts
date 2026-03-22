/**
 * Unit tests for src/three-d/three-d-materials.js
 *
 * Tests createMaterials factory, caching, estimated clones, disposal,
 * and color mapping constants.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createMaterials,
  NODE_TYPE_COLORS,
  EDGE_TYPE_COLORS,
} from '../../src/three-d/three-d-materials.js';

// ─── Color mappings ────────────────────────────────────────────────────────

describe('NODE_TYPE_COLORS', () => {
  it('maps Manhole to a color', () => {
    expect(NODE_TYPE_COLORS.Manhole).toBeDefined();
    expect(typeof NODE_TYPE_COLORS.Manhole).toBe('number');
  });

  it('maps Drainage to a color', () => {
    expect(NODE_TYPE_COLORS.Drainage).toBeDefined();
  });

  it('maps Home to a color', () => {
    expect(NODE_TYPE_COLORS.Home).toBeDefined();
  });

  it('maps Covered to a color', () => {
    expect(NODE_TYPE_COLORS.Covered).toBeDefined();
  });

  it('maps ForLater to a color', () => {
    expect(NODE_TYPE_COLORS.ForLater).toBeDefined();
  });

  it('all colors are distinct', () => {
    const colors = Object.values(NODE_TYPE_COLORS);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });
});

describe('EDGE_TYPE_COLORS', () => {
  it('maps קו ראשי (main line) to blue', () => {
    expect(EDGE_TYPE_COLORS['קו ראשי']).toBe(0x2563eb);
  });

  it('maps קו סניקה to orange', () => {
    expect(EDGE_TYPE_COLORS['קו סניקה']).toBe(0xfb923c);
  });

  it('maps קו משני to teal', () => {
    expect(EDGE_TYPE_COLORS['קו משני']).toBe(0x0d9488);
  });
});

// ─── createMaterials ───────────────────────────────────────────────────────

describe('createMaterials', () => {
  function createMockTHREE() {
    // Must use function/class for `new` to work
    function MockMaterial(this: any, opts: any = {}) {
      this.dispose = vi.fn();
      this.clone = vi.fn(() => {
        const c = new (MockMaterial as any)();
        c.transparent = true;
        c.opacity = 0.5;
        return c;
      });
      this.color = opts.color || 0;
      this.side = opts.side || 0;
      this.roughness = opts.roughness || 0;
      this.metalness = opts.metalness || 0;
      this.transparent = opts.transparent || false;
      this.opacity = opts.opacity ?? 1;
      this.depthWrite = opts.depthWrite ?? true;
    }
    return {
      MeshStandardMaterial: MockMaterial,
      DoubleSide: 2,
      BackSide: 1,
    };
  }

  let THREE: any;
  let materials: any;

  beforeEach(() => {
    THREE = createMockTHREE();
    materials = createMaterials(THREE);
  });

  it('creates ground material', () => {
    expect(materials.ground).toBeDefined();
  });

  it('creates manholeWall material', () => {
    expect(materials.manholeWall).toBeDefined();
  });

  it('creates manholeWallInner material', () => {
    expect(materials.manholeWallInner).toBeDefined();
  });

  it('creates houseWall material', () => {
    expect(materials.houseWall).toBeDefined();
  });

  it('creates houseRoof material', () => {
    expect(materials.houseRoof).toBeDefined();
  });

  it('manholeCover returns a material for known node types', () => {
    const mat = materials.manholeCover('Manhole');
    expect(mat).toBeDefined();
  });

  it('manholeCover caches materials per node type', () => {
    const mat1 = materials.manholeCover('Manhole');
    const mat2 = materials.manholeCover('Manhole');
    expect(mat1).toBe(mat2); // same reference (cached)
  });

  it('manholeCover returns different materials for different types', () => {
    const mat1 = materials.manholeCover('Manhole');
    const mat2 = materials.manholeCover('Home');
    expect(mat1).not.toBe(mat2);
  });

  it('pipe returns a material for edge type', () => {
    const mat = materials.pipe('קו ראשי');
    expect(mat).toBeDefined();
  });

  it('pipe caches materials per edge type', () => {
    const mat1 = materials.pipe('קו ראשי');
    const mat2 = materials.pipe('קו ראשי');
    expect(mat1).toBe(mat2);
  });

  it('estimated creates a semi-transparent clone', () => {
    const base = materials.manholeWall;
    const est = materials.estimated(base);
    expect(est).toBeDefined();
    expect(est.transparent).toBe(true);
    expect(est.opacity).toBe(0.5);
  });

  it('dispose cleans up all materials', () => {
    materials.manholeCover('Manhole');
    materials.pipe('קו ראשי');
    expect(() => materials.dispose()).not.toThrow();
    expect(materials.ground.dispose).toHaveBeenCalled();
    expect(materials.manholeWall.dispose).toHaveBeenCalled();
  });
});
