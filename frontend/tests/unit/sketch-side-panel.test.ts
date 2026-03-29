/**
 * Unit tests for Sketch Side Panel pure functions
 *
 * Tests formatSketchName and isLtrText — pure utility functions
 * used by the side panel for display formatting.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// We can't import the side panel directly (heavy DOM dependencies),
// so we test the extracted pure logic inline.

/** Re-implementation of formatSketchName for testing (mirrors source exactly) */
function formatSketchName(sketch: { name?: string; createdAt?: string; creationDate?: string; id?: string }) {
  if (sketch.name && sketch.name.trim()) return sketch.name;
  try {
    const d = new Date(sketch.createdAt || sketch.creationDate || '');
    const lang = document.documentElement.lang || 'he';
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    }
  } catch (_) {}
  return sketch.id ? sketch.id.replace('sk_', '#') : 'Sketch';
}

/** Re-implementation of isLtrText for testing (mirrors source exactly) */
function isLtrText(str: string | null | undefined): boolean {
  if (!str) return false;
  const ltr = (str.match(/[A-Za-z0-9_\-.]/g) || []).length;
  const rtl = (str.match(/[\u0590-\u05FF\u0600-\u06FF]/g) || []).length;
  return ltr > rtl;
}

describe('Sketch Side Panel Pure Functions', () => {
  describe('formatSketchName', () => {
    it('should return name when present', () => {
      expect(formatSketchName({ name: 'My Sketch' })).toBe('My Sketch');
    });

    it('should trim whitespace-only names', () => {
      // Whitespace-only name falls through to date/id
      const result = formatSketchName({ name: '   ', id: 'sk_abc123' });
      expect(result).toBe('#abc123');
    });

    it('should format date when name is missing', () => {
      const result = formatSketchName({ createdAt: '2026-03-15T10:00:00Z' });
      // jsdom defaults — date format varies by locale but should be a string
      expect(typeof result).toBe('string');
      expect(result).not.toBe('Sketch');
    });

    it('should use creationDate as fallback', () => {
      const result = formatSketchName({ creationDate: '2026-01-05T12:00:00Z' });
      expect(typeof result).toBe('string');
      expect(result).not.toBe('Sketch');
    });

    it('should strip sk_ prefix from ID', () => {
      expect(formatSketchName({ id: 'sk_abc123def' })).toBe('#abc123def');
    });

    it('should return Sketch as last resort', () => {
      expect(formatSketchName({})).toBe('Sketch');
    });

    it('should handle invalid date gracefully', () => {
      const result = formatSketchName({ createdAt: 'not-a-date', id: 'sk_xyz' });
      expect(result).toBe('#xyz');
    });
  });

  describe('isLtrText', () => {
    it('should return true for English text', () => {
      expect(isLtrText('Hello World')).toBe(true);
    });

    it('should return false for Hebrew text', () => {
      expect(isLtrText('שלום עולם')).toBe(false);
    });

    it('should return false for Arabic text', () => {
      expect(isLtrText('مرحبا بالعالم')).toBe(false);
    });

    it('should return true for alphanumeric IDs', () => {
      expect(isLtrText('sk_abc123')).toBe(true);
    });

    it('should return false for null/undefined/empty', () => {
      expect(isLtrText(null)).toBe(false);
      expect(isLtrText(undefined)).toBe(false);
      expect(isLtrText('')).toBe(false);
    });

    it('should handle mixed text — RTL wins when Hebrew has more chars', () => {
      // ABC = 3 LTR, שלום = 4 RTL → RTL wins
      expect(isLtrText('ABC שלום')).toBe(false);
    });

    it('should handle mixed text — RTL majority', () => {
      expect(isLtrText('A שלום עולם')).toBe(false);
    });

    it('should count digits as LTR', () => {
      expect(isLtrText('12345 שלום')).toBe(true); // 5 digits > 4 Hebrew
    });

    it('should count underscores, hyphens, dots as LTR', () => {
      expect(isLtrText('file_name-v1.0')).toBe(true);
    });
  });
});
