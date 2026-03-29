/**
 * Unit tests for Reference Layers Module
 *
 * Tests layer CRUD, visibility management, section features,
 * raw points layer creation, and localStorage persistence.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock govmap-layer dependency (reference-layers imports getMapReferencePoint)
vi.mock('../../src/map/govmap-layer.js', () => ({
  getMapReferencePoint: () => ({ x: 245879, y: 740699 }),
}));

async function freshModule() {
  vi.resetModules();
  // Clear localStorage to avoid cross-test pollution
  localStorage.clear();
  // Ensure matchMedia is available (jsdom doesn't provide it by default after resetModules)
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }
  return await import('../../src/map/reference-layers.js');
}

function makeLayer(id: string, layerType = 'sections', featureCount = 3) {
  return {
    id,
    name: `Layer ${id}`,
    layerType,
    visible: true,
    geojson: {
      type: 'FeatureCollection' as const,
      features: Array.from({ length: featureCount }, (_, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [200000 + i, 600000 + i] },
        properties: { name: `Feature ${i}`, SECTION_NUM: i + 1 },
      })),
    },
    style: {},
  };
}

describe('Reference Layers', () => {
  describe('setReferenceLayers / getReferenceLayers', () => {
    it('should store and return layers', async () => {
      const mod = await freshModule();
      const layerData = [makeLayer('l1'), makeLayer('l2')];
      mod.setReferenceLayers(layerData);
      const result = mod.getReferenceLayers();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('l1');
      expect(result[1].id).toBe('l2');
    });

    it('should return feature count per layer', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([makeLayer('l1', 'sections', 5)]);
      const result = mod.getReferenceLayers();
      expect(result[0].featureCount).toBe(5);
    });

    it('should handle empty array', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([]);
      expect(mod.getReferenceLayers()).toEqual([]);
    });

    it('should handle null/undefined', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers(null as any);
      expect(mod.getReferenceLayers()).toEqual([]);
    });

    it('should initialize layer visibility from server-side flag', async () => {
      const mod = await freshModule();
      const layers = [
        { ...makeLayer('visible1'), visible: true },
        { ...makeLayer('hidden1'), visible: false },
      ];
      mod.setReferenceLayers(layers);
      expect(mod.isLayerVisible('visible1')).toBe(true);
      expect(mod.isLayerVisible('hidden1')).toBe(false);
    });
  });

  describe('isLayerVisible / setLayerVisibility', () => {
    it('should return true by default for new layers', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([makeLayer('l1')]);
      expect(mod.isLayerVisible('l1')).toBe(true);
    });

    it('should set explicit visibility', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([makeLayer('l1')]);
      mod.setLayerVisibility('l1', false);
      expect(mod.isLayerVisible('l1')).toBe(false);
      mod.setLayerVisibility('l1', true);
      expect(mod.isLayerVisible('l1')).toBe(true);
    });

    it('should toggle when visible is undefined', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([makeLayer('l1')]);
      expect(mod.isLayerVisible('l1')).toBe(true);
      mod.setLayerVisibility('l1', undefined);
      expect(mod.isLayerVisible('l1')).toBe(false);
      mod.setLayerVisibility('l1', undefined);
      expect(mod.isLayerVisible('l1')).toBe(true);
    });

    it('should return false for all layers when globally disabled', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([makeLayer('l1')]);
      mod.setRefLayersEnabled(false);
      expect(mod.isLayerVisible('l1')).toBe(false);
      // Re-enable
      mod.setRefLayersEnabled(true);
      expect(mod.isLayerVisible('l1')).toBe(true);
    });
  });

  describe('setRefLayersEnabled / isRefLayersEnabled', () => {
    it('should default to enabled', async () => {
      const mod = await freshModule();
      expect(mod.isRefLayersEnabled()).toBe(true);
    });

    it('should toggle global enable state', async () => {
      const mod = await freshModule();
      mod.setRefLayersEnabled(false);
      expect(mod.isRefLayersEnabled()).toBe(false);
      mod.setRefLayersEnabled(true);
      expect(mod.isRefLayersEnabled()).toBe(true);
    });
  });

  describe('upsertReferenceLayer', () => {
    it('should add a new layer', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([]);
      mod.upsertReferenceLayer(makeLayer('new1'));
      const result = mod.getReferenceLayers();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('new1');
    });

    it('should replace an existing layer by id', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([makeLayer('l1', 'sections', 3)]);
      mod.upsertReferenceLayer(makeLayer('l1', 'streets', 7));
      const result = mod.getReferenceLayers();
      expect(result).toHaveLength(1);
      expect(result[0].layerType).toBe('streets');
      expect(result[0].featureCount).toBe(7);
    });

    it('should initialize visibility for new layer', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([]);
      mod.upsertReferenceLayer({ ...makeLayer('l1'), visible: false });
      expect(mod.isLayerVisible('l1')).toBe(false);
    });
  });

  describe('clearReferenceLayers', () => {
    it('should remove all layers', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([makeLayer('l1'), makeLayer('l2')]);
      mod.clearReferenceLayers();
      expect(mod.getReferenceLayers()).toEqual([]);
    });

    it('should clear visibility state', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([makeLayer('l1')]);
      mod.setLayerVisibility('l1', false);
      mod.clearReferenceLayers();
      // After clearing, re-adding same layer should have default visibility
      mod.upsertReferenceLayer(makeLayer('l1'));
      expect(mod.isLayerVisible('l1')).toBe(true);
    });
  });

  describe('getRawLayers', () => {
    it('should return internal layers array with full geojson', async () => {
      const mod = await freshModule();
      const layer = makeLayer('l1');
      mod.setReferenceLayers([layer]);
      const raw = mod.getRawLayers();
      expect(raw).toHaveLength(1);
      expect(raw[0].geojson).toBeDefined();
      expect(raw[0].geojson.features).toHaveLength(3);
    });
  });

  describe('addRawPointsLayer', () => {
    it('should create a layer from coordsMap', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([]);
      const coordsMap = new Map([
        ['P1', { x: 200000, y: 600000, z: 50 }],
        ['P2', { x: 200100, y: 600100, z: 55 }],
      ]);
      const layerId = mod.addRawPointsLayer('survey.csv', coordsMap);
      expect(layerId).toMatch(/^__raw_points_/);
      expect(layerId).toMatch(/__$/);
    });

    it('should strip file extension for display name', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([]);
      const coordsMap = new Map([['P1', { x: 200000, y: 600000, z: 50 }]]);
      mod.addRawPointsLayer('my_data.csv', coordsMap);
      const result = mod.getReferenceLayers();
      expect(result[0].name).toBe('my_data');
    });

    it('should create correct GeoJSON features', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([]);
      const coordsMap = new Map([
        ['P1', { x: 200000, y: 600000, z: 50 }],
      ]);
      mod.addRawPointsLayer('test.csv', coordsMap);
      const raw = mod.getRawLayers();
      const features = raw[0].geojson.features;
      expect(features).toHaveLength(1);
      expect(features[0].geometry.type).toBe('Point');
      expect(features[0].geometry.coordinates).toEqual([200000, 600000]);
      expect(features[0].properties.name).toBe('P1');
      expect(features[0].properties.z).toBe(50);
      expect(features[0].properties.sourceFile).toBe('test.csv');
    });

    it('should default z to 0 when not provided', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([]);
      const coordsMap = new Map([
        ['P1', { x: 200000, y: 600000 } as any],
      ]);
      mod.addRawPointsLayer('test.csv', coordsMap);
      const raw = mod.getRawLayers();
      expect(raw[0].geojson.features[0].properties.z).toBe(0);
    });

    it('should set layerType to raw_points', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([]);
      const coordsMap = new Map([['P1', { x: 200000, y: 600000, z: 0 }]]);
      mod.addRawPointsLayer('test.csv', coordsMap);
      const raw = mod.getRawLayers();
      expect(raw[0].layerType).toBe('raw_points');
    });
  });

  describe('Section visibility', () => {
    it('should return OUTSIDE_SECTIONS when no sections layer', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([]);
      const sections = mod.getSectionFeatures();
      expect(sections).toHaveLength(1);
      expect(sections[0].id).toBe('outside_sections_data');
      expect(sections[0].number).toBe(-1);
    });

    it('should return features from sections layer plus outside entry', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([makeLayer('sec1', 'sections', 2)]);
      const sections = mod.getSectionFeatures();
      // 2 features + 1 outside_sections entry
      expect(sections).toHaveLength(3);
      expect(sections[sections.length - 1].id).toBe('outside_sections_data');
    });

    it('should track section visibility', async () => {
      const mod = await freshModule();
      expect(mod.isSectionVisible('sec_a')).toBe(true); // default
      mod.setSectionVisibility('sec_a', false);
      expect(mod.isSectionVisible('sec_a')).toBe(false);
      mod.setSectionVisibility('sec_a', true);
      expect(mod.isSectionVisible('sec_a')).toBe(true);
    });
  });

  describe('localStorage persistence', () => {
    it('should save and load section visibility', async () => {
      const mod = await freshModule();
      mod.setSectionVisibility('sec1', false);
      mod.setSectionVisibility('sec2', true);
      mod.saveSectionSettings();

      // Get fresh module WITHOUT clearing localStorage
      vi.resetModules();
      if (!window.matchMedia) {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
          matches: false, media: query, onchange: null,
          addListener: vi.fn(), removeListener: vi.fn(),
          addEventListener: vi.fn(), removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }));
      }
      const mod2 = await import('../../src/map/reference-layers.js');
      // loadSectionSettings is called on module init
      expect(mod2.isSectionVisible('sec1')).toBe(false);
      expect(mod2.isSectionVisible('sec2')).toBe(true);
    });

    it('should save and load ref layer settings', async () => {
      const mod = await freshModule();
      mod.setReferenceLayers([makeLayer('l1')]);
      mod.setLayerVisibility('l1', false);
      mod.setRefLayersEnabled(false);
      mod.saveRefLayerSettings();

      // Get fresh module WITHOUT clearing localStorage
      vi.resetModules();
      if (!window.matchMedia) {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
          matches: false, media: query, onchange: null,
          addListener: vi.fn(), removeListener: vi.fn(),
          addEventListener: vi.fn(), removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }));
      }
      const mod2 = await import('../../src/map/reference-layers.js');
      expect(mod2.isRefLayersEnabled()).toBe(false);
    });
  });

  describe('OUTSIDE_SECTIONS constant', () => {
    it('should have correct shape', async () => {
      const mod = await freshModule();
      expect(mod.OUTSIDE_SECTIONS).toEqual({ id: 'outside_sections_data', number: -1 });
    });
  });
});
