import { describe, it, expect } from 'vitest';
import { exportNodesCsv, csvQuote } from '../../src/utils/csv.js';

const baseConfig = {
  nodes: {
    include: {
      id: true,
      survey_x: true,
      survey_y: true,
      measure_precision: true,
      fix_type: true,
      measured_at: true,
    },
    options: {},
  },
};

function rowsOf(csv: string): string[][] {
  return csv.split('\n').map((line) =>
    line.split('","').map((c) => c.replace(/^"|"$/g, ''))
  );
}

describe('exportNodesCsv measurement metadata', () => {
  it('includes Measured_Date header when measured_at is enabled', () => {
    const csv = exportNodesCsv([], baseConfig, undefined);
    expect(rowsOf(csv)[0]).toContain('Measured_Date');
  });

  it('omits Measured_Date header when measured_at is disabled', () => {
    const cfg = JSON.parse(JSON.stringify(baseConfig));
    cfg.nodes.include.measured_at = false;
    const csv = exportNodesCsv([], cfg, undefined);
    expect(rowsOf(csv)[0]).not.toContain('Measured_Date');
  });

  it('formats measuredAt as local YYYY-MM-DD HH:mm', () => {
    const ts = new Date(2026, 6, 13, 9, 5).getTime(); // 2026-07-13 09:05 local
    const nodes = [{ id: 'A1', surveyX: 200000, surveyY: 600000, gnssFixQuality: 4, measure_precision: 0.02, measuredAt: ts }];
    const rows = rowsOf(exportNodesCsv(nodes, baseConfig, undefined));
    const col = rows[0].indexOf('Measured_Date');
    expect(rows[1][col]).toBe('2026-07-13 09:05');
  });

  it('leaves Measured_Date empty when node has no measuredAt', () => {
    const nodes = [{ id: 'A1', surveyX: 200000, surveyY: 600000, gnssFixQuality: 4 }];
    const rows = rowsOf(exportNodesCsv(nodes, baseConfig, undefined));
    const col = rows[0].indexOf('Measured_Date');
    expect(rows[1][col]).toBe('');
  });

  it('leaves Measured_Date empty for invalid timestamps', () => {
    const nodes = [{ id: 'A1', surveyX: 1, surveyY: 2, measuredAt: 'not-a-date' }];
    const rows = rowsOf(exportNodesCsv(nodes, baseConfig, undefined));
    const col = rows[0].indexOf('Measured_Date');
    expect(rows[1][col]).toBe('');
  });
});

describe('exportNodesCsv fix type', () => {
  function fixTypeOf(node: Record<string, unknown>, opts?: { coordinatesMap?: Map<string, unknown> }) {
    const rows = rowsOf(exportNodesCsv([node], baseConfig, undefined, opts));
    return rows[1][rows[0].indexOf('Fix_Type')];
  }

  it('quality 4 exports as Fixed', () => {
    expect(fixTypeOf({ id: '1', surveyX: 1, surveyY: 2, gnssFixQuality: 4 })).toBe('Fixed');
  });

  it('quality 5 exports as Device Float', () => {
    expect(fixTypeOf({ id: '1', surveyX: 1, surveyY: 2, gnssFixQuality: 5 })).toBe('Device Float');
  });

  it('quality 6 with survey coords exports as Manual Float', () => {
    expect(fixTypeOf({ id: '1', surveyX: 1, surveyY: 2, gnssFixQuality: 6 })).toBe('Manual Float');
  });

  it('imported coordinates (in coordinatesMap, no explicit quality) export as Fixed', () => {
    const map = new Map([['1', { x: 1, y: 2 }]]);
    expect(fixTypeOf({ id: '1', surveyX: 1, surveyY: 2 }, { coordinatesMap: map })).toBe('Fixed');
  });

  it('survey coords without quality and not in map export as Manual Float', () => {
    expect(fixTypeOf({ id: '1', surveyX: 1, surveyY: 2 }, { coordinatesMap: new Map() })).toBe('Manual Float');
  });

  it('nodes without survey coordinates export an empty fix type', () => {
    expect(fixTypeOf({ id: '1' })).toBe('');
  });
});

describe('csvQuote formula injection guard', () => {
  it('still prefixes formula-triggering values', () => {
    expect(csvQuote('=SUM(A1)')).toBe('"\'=SUM(A1)"');
  });
});
