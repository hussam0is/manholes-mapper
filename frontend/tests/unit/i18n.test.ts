/**
 * Unit tests for i18n module
 *
 * Tests translation lookup, RTL detection, and translator factory.
 */
import { describe, it, expect } from 'vitest';
import { i18n, isRTL, createTranslator } from '../../src/i18n.js';

describe('i18n dictionary', () => {
  it('should have Hebrew and English locales', () => {
    expect(i18n.he).toBeDefined();
    expect(i18n.en).toBeDefined();
  });

  it('should have matching top-level keys in both locales', () => {
    const heKeys = Object.keys(i18n.he).sort();
    const enKeys = Object.keys(i18n.en).sort();
    expect(heKeys).toEqual(enKeys);
  });

  it('should have matching nested keys for auth section', () => {
    const heAuth = Object.keys(i18n.he.auth).sort();
    const enAuth = Object.keys(i18n.en.auth).sort();
    expect(heAuth).toEqual(enAuth);
  });

  it('should have matching nested keys for toasts section', () => {
    const heToasts = Object.keys(i18n.he.toasts).sort();
    const enToasts = Object.keys(i18n.en.toasts).sort();
    expect(heToasts).toEqual(enToasts);
  });

  it('should have matching nested keys for labels section', () => {
    const heLabels = Object.keys(i18n.he.labels).sort();
    const enLabels = Object.keys(i18n.en.labels).sort();
    expect(heLabels).toEqual(enLabels);
  });

  it('should have matching nested keys for menuGroup section', () => {
    const heMenu = Object.keys(i18n.he.menuGroup).sort();
    const enMenu = Object.keys(i18n.en.menuGroup).sort();
    expect(heMenu).toEqual(enMenu);
  });

  it('should have correct English app title', () => {
    expect(i18n.en.appTitle).toBe('Manhole Mapper');
  });

  it('should have correct Hebrew app title', () => {
    expect(i18n.he.appTitle).toBe('ממפה שוחות');
  });

  describe('function translations', () => {
    it('should format English list counts', () => {
      expect(i18n.en.listCounts(5, 3)).toBe('Nodes: 5, Edges: 3');
    });

    it('should format Hebrew list counts', () => {
      expect(i18n.he.listCounts(5, 3)).toBe('שוחות: 5, קווים: 3');
    });

    it('should format English toast zoom', () => {
      expect(i18n.en.toasts.zoom(150)).toBe('Zoom: 150%');
    });

    it('should format Hebrew toast zoom', () => {
      expect(i18n.he.toasts.zoom(150)).toBe('זום: 150%');
    });

    it('should format English node found', () => {
      expect(i18n.en.toasts.nodeFound(42)).toBe('Node 42 found');
    });

    it('should format Hebrew node found', () => {
      expect(i18n.he.toasts.nodeFound(42)).toBe('שוחה 42 נמצאה');
    });

    it('should format English coordinates imported', () => {
      expect(i18n.en.coordinates.imported(10)).toBe('Loaded 10 coordinates');
    });

    it('should format Hebrew coordinates imported', () => {
      expect(i18n.he.coordinates.imported(10)).toBe('נטענו 10 קואורדינטות');
    });

    it('should format English coordinates status', () => {
      expect(i18n.en.coordinates.status(8, 10)).toBe('8/10 nodes with coordinates');
    });

    it('should format English stretch changed', () => {
      expect(i18n.en.stretch.changed('x', 1.5)).toBe('Horizontal stretch: 1.5');
      expect(i18n.en.stretch.changed('y', 2.0)).toBe('Vertical stretch: 2.0');
    });

    it('should format English last synced', () => {
      expect(i18n.en.auth.lastSynced('10:30')).toBe('Last synced: 10:30');
    });

    it('should format English dangling edges found', () => {
      expect(i18n.en.toasts.danglingEdgesFound(3)).toBe('Found 3 dangling edges');
    });

    it('should format English list title', () => {
      expect(i18n.en.listTitle('SK001', '2024-01-15')).toBe('Sketch SK001 • 2024-01-15');
    });

    it('should format English admin optionsTitle', () => {
      expect(i18n.en.admin.optionsTitle('Cover Material')).toBe('Options – Cover Material');
    });
  });
});

describe('projects homepage keys', () => {
  it('should have matching keys in projects.homepage section', () => {
    const heKeys = Object.keys(i18n.he.projects.homepage).sort();
    const enKeys = Object.keys(i18n.en.projects.homepage).sort();
    expect(heKeys).toEqual(enKeys);
  });

  it('should have matching keys in projects.canvas section', () => {
    const heKeys = Object.keys(i18n.he.projects.canvas).sort();
    const enKeys = Object.keys(i18n.en.projects.canvas).sort();
    expect(heKeys).toEqual(enKeys);
  });

  it('should have non-empty Hebrew subtitle', () => {
    expect(i18n.he.projects.homepage.subtitle).toBeTruthy();
    expect(typeof i18n.he.projects.homepage.subtitle).toBe('string');
  });

  it('should have non-empty English subtitle', () => {
    expect(i18n.en.projects.homepage.subtitle).toBeTruthy();
    expect(typeof i18n.en.projects.homepage.subtitle).toBe('string');
  });

  it('should have non-empty Hebrew backToProjects', () => {
    expect(i18n.he.projects.canvas.backToProjects).toBeTruthy();
    expect(typeof i18n.he.projects.canvas.backToProjects).toBe('string');
  });

  it('should have non-empty English backToProjects', () => {
    expect(i18n.en.projects.canvas.backToProjects).toBeTruthy();
    expect(typeof i18n.en.projects.canvas.backToProjects).toBe('string');
  });
});

describe('isRTL', () => {
  it('should return true for Hebrew', () => {
    expect(isRTL('he')).toBe(true);
  });

  it('should return false for English', () => {
    expect(isRTL('en')).toBe(false);
  });

  it('should return false for unknown language', () => {
    expect(isRTL('fr')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isRTL('')).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isRTL(null as any)).toBe(false);
    expect(isRTL(undefined as any)).toBe(false);
  });
});

describe('createTranslator', () => {
  it('should translate simple English keys', () => {
    const t = createTranslator(i18n, () => 'en');
    expect(t('appTitle')).toBe('Manhole Mapper');
    expect(t('save')).toBe('Save');
    expect(t('cancel')).toBe('Cancel');
  });

  it('should translate simple Hebrew keys', () => {
    const t = createTranslator(i18n, () => 'he');
    expect(t('appTitle')).toBe('ממפה שוחות');
    expect(t('save')).toBe('שמירה');
  });

  it('should translate nested keys using dot notation', () => {
    const t = createTranslator(i18n, () => 'en');
    expect(t('auth.loginTitle')).toBe('Sign In');
    expect(t('toasts.saved')).toBe('Saved');
    expect(t('labels.nodeId')).toBe('Node ID');
  });

  it('should translate deeply nested keys', () => {
    const t = createTranslator(i18n, () => 'en');
    expect(t('admin.placeholders.code')).toBe('Code');
    expect(t('admin.fieldTypes.text')).toBe('Text');
    expect(t('admin.validation.labelRequired')).toBe('Label is required');
  });

  it('should call function translations with arguments', () => {
    const t = createTranslator(i18n, () => 'en');
    expect(t('listCounts', 5, 3)).toBe('Nodes: 5, Edges: 3');
    expect(t('toasts.zoom', 200)).toBe('Zoom: 200%');
    expect(t('toasts.nodeFound', 99)).toBe('Node 99 found');
    expect(t('coordinates.imported', 15)).toBe('Loaded 15 coordinates');
  });

  it('should return path as fallback for non-existent keys', () => {
    const t = createTranslator(i18n, () => 'en');
    expect(t('nonExistent')).toBe('nonExistent');
    expect(t('deeply.nested.missing')).toBe('deeply.nested.missing');
  });

  it('should switch language dynamically', () => {
    let lang = 'en';
    const t = createTranslator(i18n, () => lang);

    expect(t('appTitle')).toBe('Manhole Mapper');
    lang = 'he';
    expect(t('appTitle')).toBe('ממפה שוחות');
  });
});
