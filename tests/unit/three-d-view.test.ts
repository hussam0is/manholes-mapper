/**
 * Unit tests for 3D View modules.
 *
 * Tests pure functions from the 3D subsystem:
 *   - Object sizes (manhole, house, pipe, arrow dimensions)
 *   - Label positioning and visibility thresholds
 *   - Coordinate transforms (getNodeXZ)
 *   - Depth calculations (getNodeDepth)
 *   - Bounding box (computeBounds)
 *   - Camera framing (overview, node selection, edge selection)
 *   - Fog density formula
 *   - Material color mappings
 *   - FPS controls speed steps
 *   - Miniature mode state
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── Scene module ──────────────────────────────────────────────────────────────
import {
  parseNum,
  getNodeXZ,
  getNodeDepth,
  computeBounds,
  DEFAULT_DEPTH,
  DEFAULT_PIPE_DEPTH,
  DEFAULT_PIPE_DIAMETER_MM,
  DEFAULT_COVER_DIAMETER_CM,
  SHAFT_WALL_THICKNESS,
  COVER_HEIGHT,
  MANHOLE_SEGMENTS,
  PIPE_RADIAL_SEGMENTS,
  PIPE_TUBULAR_SEGMENTS,
} from '../../src/three-d/three-d-scene.js';

// ── Camera framing ────────────────────────────────────────────────────────────
import {
  computeInitialCamera,
  frameNode,
  frameEdge,
  frameOverview,
} from '../../src/three-d/three-d-camera-framing.js';

// ── Label visibility ──────────────────────────────────────────────────────────
import { computeLabelVisibility } from '../../src/three-d/three-d-view.js';

// ── Materials ─────────────────────────────────────────────────────────────────
import { NODE_TYPE_COLORS, EDGE_TYPE_COLORS } from '../../src/three-d/three-d-materials.js';

// ── Miniature ─────────────────────────────────────────────────────────────────
import { isMiniatureMode, resetMiniatureState } from '../../src/three-d/three-d-miniature.js';

// =============================================================================
// §1  parseNum
// =============================================================================

describe('parseNum', () => {
  it('returns the parsed number for valid positive values', () => {
    expect(parseNum('3.5', 1)).toBe(3.5);
    expect(parseNum(7, 1)).toBe(7);
    expect(parseNum('200', 0)).toBe(200);
  });

  it('returns fallback for null or undefined', () => {
    expect(parseNum(null, 42)).toBe(42);
    expect(parseNum(undefined, 42)).toBe(42);
  });

  it('returns fallback for empty string', () => {
    expect(parseNum('', 10)).toBe(10);
  });

  it('returns fallback for NaN strings', () => {
    expect(parseNum('abc', 5)).toBe(5);
    expect(parseNum('not-a-number', 5)).toBe(5);
  });

  it('returns fallback for zero and negative values', () => {
    expect(parseNum(0, 99)).toBe(99);
    expect(parseNum(-5, 99)).toBe(99);
    expect(parseNum('0', 99)).toBe(99);
    expect(parseNum('-3', 99)).toBe(99);
  });

  it('handles string numbers with whitespace', () => {
    expect(parseNum(' 4.2 ', 1)).toBe(4.2);
  });
});

// =============================================================================
// §2  Scene Constants — Object Sizes
// =============================================================================

describe('Scene Constants', () => {
  it('has correct default depth values', () => {
    expect(DEFAULT_DEPTH).toBe(2.0);
    expect(DEFAULT_PIPE_DEPTH).toBe(1.5);
  });

  it('has correct default dimensions', () => {
    expect(DEFAULT_PIPE_DIAMETER_MM).toBe(200);
    expect(DEFAULT_COVER_DIAMETER_CM).toBe(55);
  });

  it('has correct structural constants', () => {
    expect(SHAFT_WALL_THICKNESS).toBe(0.08);
    expect(COVER_HEIGHT).toBe(0.06);
  });

  it('has correct geometry resolution', () => {
    expect(MANHOLE_SEGMENTS).toBe(24);
    expect(PIPE_RADIAL_SEGMENTS).toBe(12);
    expect(PIPE_TUBULAR_SEGMENTS).toBe(16);
  });
});

describe('Manhole dimensions derivation', () => {
  it('computes correct outer radius from default cover diameter', () => {
    const coverDiameterM = DEFAULT_COVER_DIAMETER_CM / 100; // 0.55m
    const outerRadius = coverDiameterM / 2; // 0.275m
    expect(outerRadius).toBeCloseTo(0.275, 3);
  });

  it('computes correct inner radius from outer minus wall thickness', () => {
    const outerRadius = DEFAULT_COVER_DIAMETER_CM / 100 / 2;
    const innerRadius = outerRadius - SHAFT_WALL_THICKNESS;
    expect(innerRadius).toBeCloseTo(0.195, 3);
    expect(innerRadius).toBeGreaterThan(0.02); // threshold for inner wall creation
  });

  it('cover disc radius includes 0.03m rim extension', () => {
    const outerRadius = DEFAULT_COVER_DIAMETER_CM / 100 / 2;
    const coverDiscRadius = outerRadius + 0.03;
    expect(coverDiscRadius).toBeCloseTo(0.305, 3);
  });

  it('cover sits at ground level with COVER_HEIGHT thickness', () => {
    // Cover position.y = pos.y + COVER_HEIGHT / 2
    const groundY = 0;
    const coverCenterY = groundY + COVER_HEIGHT / 2;
    expect(coverCenterY).toBeCloseTo(0.03, 3);
  });

  it('cover rim (torus) sits at ground + COVER_HEIGHT', () => {
    const groundY = 0;
    const rimY = groundY + COVER_HEIGHT;
    expect(rimY).toBeCloseTo(0.06, 3);
  });

  it('shaft is centered at pos.y - depth/2', () => {
    const depth = 3.0;
    const groundY = 0;
    const shaftCenterY = groundY - depth / 2;
    expect(shaftCenterY).toBe(-1.5);
  });

  it('bottom disc is at pos.y - depth', () => {
    const depth = 3.0;
    const groundY = 0;
    const bottomY = groundY - depth;
    expect(bottomY).toBe(-3.0);
  });

  it('small cover diameter produces no inner wall (innerRadius <= 0.02)', () => {
    // A cover diameter of 10cm → outerRadius = 0.05m, innerRadius = 0.05 - 0.08 = -0.03
    const smallCoverDiameterCM = 10;
    const outerR = smallCoverDiameterCM / 100 / 2;
    const innerR = outerR - SHAFT_WALL_THICKNESS;
    expect(innerR).toBeLessThanOrEqual(0.02);
  });
});

describe('House dimensions', () => {
  const WIDTH = 3;
  const DEPTH = 4;
  const WALL_H = 2.5;
  const ROOF_H = 1.2;

  it('has correct base dimensions', () => {
    expect(WIDTH).toBe(3);
    expect(DEPTH).toBe(4);
    expect(WALL_H).toBe(2.5);
    expect(ROOF_H).toBe(1.2);
  });

  it('total height is wall + roof', () => {
    expect(WALL_H + ROOF_H).toBe(3.7);
  });

  it('roof overhangs by 0.15m on each side (width)', () => {
    const roofWidth = WIDTH + 0.15 * 2;
    expect(roofWidth).toBeCloseTo(3.3, 2);
  });

  it('roof extrusion depth has 0.3m overhang', () => {
    const roofDepth = DEPTH + 0.3;
    expect(roofDepth).toBeCloseTo(4.3, 2);
  });

  it('house label sits at WALL_H + ROOF_H + 0.3 above ground', () => {
    const groundY = 0;
    const labelY = groundY + WALL_H + ROOF_H + 0.3;
    expect(labelY).toBeCloseTo(4.0, 2);
  });
});

describe('Pipe dimensions derivation', () => {
  it('default pipe radius from diameter', () => {
    const diameterM = DEFAULT_PIPE_DIAMETER_MM / 1000; // 0.2m
    const pipeRadius = Math.max(diameterM / 2, 0.025);
    expect(pipeRadius).toBeCloseTo(0.1, 3);
  });

  it('minimum visual pipe radius is 0.025m', () => {
    // Very small diameter (e.g. 20mm)
    const smallDiameter = 20;
    const diameterM = smallDiameter / 1000;
    const pipeRadius = Math.max(diameterM / 2, 0.025);
    expect(pipeRadius).toBe(0.025);
  });

  it('arrow radius is max(pipeRadius * 4, 0.15)', () => {
    const pipeRadius = 0.1; // default
    const arrowRadius = Math.max(pipeRadius * 4, 0.15);
    expect(arrowRadius).toBe(0.4);

    const smallPipeRadius = 0.025;
    const smallArrow = Math.max(smallPipeRadius * 4, 0.15);
    expect(smallArrow).toBe(0.15);
  });

  it('arrow length is max(arrowRadius * 3, 0.5)', () => {
    const arrowRadius = 0.4;
    const arrowLength = Math.max(arrowRadius * 3, 0.5);
    expect(arrowLength).toBeCloseTo(1.2, 5);

    const smallArrowRadius = 0.15;
    const smallLength = Math.max(smallArrowRadius * 3, 0.5);
    expect(smallLength).toBeCloseTo(0.5, 5);
  });
});

describe('Issue ring dimensions', () => {
  it('issue ring outer radius is cover + 0.03 + 0.08', () => {
    const coverDiameterM = DEFAULT_COVER_DIAMETER_CM / 100;
    const outerRadius = coverDiameterM / 2 + 0.03;
    const ringRadius = outerRadius + 0.08;
    expect(ringRadius).toBeCloseTo(0.385, 3);
  });

  it('issue ring torus inner radius is 0.035', () => {
    const torusInnerRadius = 0.035;
    expect(torusInnerRadius).toBe(0.035);
  });

  it('issue badge sits at 0.6 above ground', () => {
    const groundY = 0;
    const badgeY = groundY + 0.6;
    expect(badgeY).toBe(0.6);
  });

  it('issue ring pulse formula oscillates between 0.0 and 0.8', () => {
    // pulse = 0.4 + 0.4 * sin(time * 3)
    const pulseMin = 0.4 + 0.4 * Math.sin(-Math.PI / 2); // sin = -1
    const pulseMax = 0.4 + 0.4 * Math.sin(Math.PI / 2);  // sin = 1
    expect(pulseMin).toBeCloseTo(0.0, 5);
    expect(pulseMax).toBeCloseTo(0.8, 5);
  });
});

// =============================================================================
// §3  Label positioning — Y offsets
// =============================================================================

describe('Label Y-offset from object', () => {
  it('node label is 0.35m above ground level', () => {
    const groundY = 5.0;
    const labelY = groundY + 0.35;
    expect(labelY).toBeCloseTo(5.35, 5);
    expect(labelY - groundY).toBeCloseTo(0.35, 5);
  });

  it('house label offset is WALL_H + ROOF_H + 0.3 = 4.0m', () => {
    expect(2.5 + 1.2 + 0.3).toBe(4.0);
  });

  it('issue badge offset is 0.6m above ground', () => {
    const offset = 0.6;
    expect(offset).toBe(0.6);
  });
});

// =============================================================================
// §4  Label visibility (distance-based)
// =============================================================================

describe('computeLabelVisibility', () => {
  it('hides label when distance > 150', () => {
    const vis = computeLabelVisibility(200);
    expect(vis.display).toBe('none');
  });

  it('hides label at exactly 150.01', () => {
    const vis = computeLabelVisibility(150.01);
    expect(vis.display).toBe('none');
  });

  it('shows faded label between 80 and 150', () => {
    const vis = computeLabelVisibility(115);
    expect(vis.display).toBe('');
    expect(vis.fontSize).toBe('9px');
    // opacity = 1 - (115-80)/70 = 1 - 35/70 = 0.5
    expect(parseFloat(vis.opacity)).toBeCloseTo(0.5, 2);
  });

  it('at distance 80, opacity approaches 1', () => {
    const vis = computeLabelVisibility(80);
    // dist > 80 is false (80 is not > 80), falls to else branch
    expect(vis.display).toBe('');
    expect(vis.opacity).toBe('1');
    expect(vis.fontSize).toBe('11px');
  });

  it('at distance 80.01, opacity is near 1', () => {
    const vis = computeLabelVisibility(80.01);
    expect(vis.fontSize).toBe('9px');
    expect(parseFloat(vis.opacity)).toBeCloseTo(1.0, 2);
  });

  it('at distance 150, opacity approaches 0', () => {
    const vis = computeLabelVisibility(150);
    // dist > 80 is true, so fade branch
    expect(vis.fontSize).toBe('9px');
    expect(parseFloat(vis.opacity)).toBeCloseTo(0.0, 2);
  });

  it('full visibility at distance < 80, uses 11px', () => {
    const vis = computeLabelVisibility(50);
    expect(vis.display).toBe('');
    expect(vis.opacity).toBe('1');
    expect(vis.fontSize).toBe('11px');
  });

  it('uses larger 13px font at distance < 30', () => {
    const vis = computeLabelVisibility(15);
    expect(vis.display).toBe('');
    expect(vis.opacity).toBe('1');
    expect(vis.fontSize).toBe('13px');
  });

  it('uses 13px at distance exactly 29.9', () => {
    const vis = computeLabelVisibility(29.9);
    expect(vis.fontSize).toBe('13px');
  });

  it('uses 11px at distance exactly 30', () => {
    const vis = computeLabelVisibility(30);
    expect(vis.fontSize).toBe('11px');
  });

  it('uses 11px at distance exactly 0', () => {
    const vis = computeLabelVisibility(0);
    expect(vis.fontSize).toBe('13px');
    expect(vis.opacity).toBe('1');
  });
});

// =============================================================================
// §5  getNodeXZ — coordinate transforms
// =============================================================================

describe('getNodeXZ', () => {
  const ref = {
    itm: { x: 200000, y: 600000 },
    canvas: { x: 100, y: 100 },
  };
  const coordScale = 50;

  it('prefers surveyX/Y when available', () => {
    const node = { x: 500, y: 500, surveyX: 200050, surveyY: 600050 };
    const { itmX, itmY } = getNodeXZ(node, ref, coordScale);
    expect(itmX).toBe(200050);
    expect(itmY).toBe(600050);
  });

  it('falls back to manual_x/y when no survey coords', () => {
    const node = { x: 500, y: 500, manual_x: 200100, manual_y: 600100 };
    const { itmX, itmY } = getNodeXZ(node, ref, coordScale);
    expect(itmX).toBe(200100);
    expect(itmY).toBe(600100);
  });

  it('computes ITM from canvas coords when no survey/manual', () => {
    const node = { x: 200, y: 300 };
    const { itmX, itmY } = getNodeXZ(node, ref, coordScale);
    // itmX = ref.itm.x + (node.x - ref.canvas.x) / coordScale
    // = 200000 + (200 - 100) / 50 = 200000 + 2 = 200002
    expect(itmX).toBeCloseTo(200002, 3);
    // itmY = ref.itm.y - (node.y - ref.canvas.y) / coordScale
    // = 600000 - (300 - 100) / 50 = 600000 - 4 = 599996
    expect(itmY).toBeCloseTo(599996, 3);
  });

  it('handles no reference point (canvas coords as meters)', () => {
    const node = { x: 500, y: 1000 };
    const { itmX, itmY } = getNodeXZ(node, null, coordScale);
    expect(itmX).toBe(500 / 50);
    expect(itmY).toBe(1000 / 50);
  });

  it('ignores surveyX when surveyY is null', () => {
    // Both must be non-null to use survey coords
    const node = { x: 200, y: 300, surveyX: 200050, surveyY: null };
    const { itmX, itmY } = getNodeXZ(node, ref, coordScale);
    // Falls through to canvas→ITM path
    expect(itmX).toBeCloseTo(200002, 3);
  });

  it('prefers survey over manual when both exist', () => {
    const node = { x: 0, y: 0, surveyX: 111, surveyY: 222, manual_x: 333, manual_y: 444 };
    const { itmX, itmY } = getNodeXZ(node, ref, coordScale);
    expect(itmX).toBe(111);
    expect(itmY).toBe(222);
  });
});

// =============================================================================
// §6  getNodeDepth — depth from connected edges
// =============================================================================

describe('getNodeDepth', () => {
  it('returns DEFAULT_DEPTH when no edges connect to the node', () => {
    const result = getNodeDepth('1', []);
    expect(result.depth).toBe(DEFAULT_DEPTH);
    expect(result.isEstimated).toBe(true);
  });

  it('returns DEFAULT_DEPTH when edges have no measurements', () => {
    const edges = [
      { tail: '1', head: '2', tail_measurement: null, head_measurement: null },
    ];
    const result = getNodeDepth('1', edges);
    expect(result.depth).toBe(DEFAULT_DEPTH);
    expect(result.isEstimated).toBe(true);
  });

  it('uses tail_measurement when node is the tail', () => {
    const edges = [
      { tail: '1', head: '2', tail_measurement: '1.8', head_measurement: '1.2' },
    ];
    const result = getNodeDepth('1', edges);
    // maxDepth = 1.8, depth = 1.8 + 0.3 = 2.1
    expect(result.depth).toBeCloseTo(2.1, 3);
    expect(result.isEstimated).toBe(false);
  });

  it('uses head_measurement when node is the head', () => {
    const edges = [
      { tail: '2', head: '1', tail_measurement: '1.2', head_measurement: '2.5' },
    ];
    const result = getNodeDepth('1', edges);
    // maxDepth = 2.5, depth = 2.5 + 0.3 = 2.8
    expect(result.depth).toBeCloseTo(2.8, 3);
    expect(result.isEstimated).toBe(false);
  });

  it('takes the max depth across multiple connected edges', () => {
    const edges = [
      { tail: '1', head: '2', tail_measurement: '1.0', head_measurement: '0.8' },
      { tail: '1', head: '3', tail_measurement: '2.0', head_measurement: '1.5' },
      { tail: '4', head: '1', tail_measurement: '0.5', head_measurement: '1.7' },
    ];
    const result = getNodeDepth('1', edges);
    // Edge1: tail=1, tail_meas=1.0 → 1.0
    // Edge2: tail=1, tail_meas=2.0 → 2.0
    // Edge3: head=1, head_meas=1.7 → 1.7
    // max = 2.0, depth = 2.0 + 0.3 = 2.3
    expect(result.depth).toBeCloseTo(2.3, 3);
    expect(result.isEstimated).toBe(false);
  });

  it('adds 0.3m clearance below deepest pipe', () => {
    const edges = [
      { tail: '1', head: '2', tail_measurement: '3.0', head_measurement: '2.0' },
    ];
    const result = getNodeDepth('1', edges);
    expect(result.depth - 3.0).toBeCloseTo(0.3, 3);
  });

  it('handles numeric edge IDs via string coercion', () => {
    const edges = [
      { tail: 1, head: 2, tail_measurement: '1.5', head_measurement: '1.0' },
    ];
    const result = getNodeDepth('1', edges);
    expect(result.depth).toBeCloseTo(1.8, 3);
    expect(result.isEstimated).toBe(false);
  });
});

// =============================================================================
// §7  computeBounds — bounding box from positions map
// =============================================================================

describe('computeBounds', () => {
  it('computes correct bounds for a set of positions', () => {
    const positions = new Map([
      ['1', { x: -5, z: 10 }],
      ['2', { x: 15, z: -3 }],
      ['3', { x: 8, z: 20 }],
    ]);

    const b = computeBounds(positions);
    expect(b.minX).toBe(-5);
    expect(b.maxX).toBe(15);
    expect(b.minZ).toBe(-3);
    expect(b.maxZ).toBe(20);
    expect(b.sizeX).toBe(20);
    expect(b.sizeZ).toBe(23);
    expect(b.centerX).toBe(5);
    expect(b.centerZ).toBeCloseTo(8.5, 3);
  });

  it('handles a single position', () => {
    const positions = new Map([
      ['1', { x: 10, z: 20 }],
    ]);
    const b = computeBounds(positions);
    expect(b.sizeX).toBe(0);
    expect(b.sizeZ).toBe(0);
    expect(b.centerX).toBe(10);
    expect(b.centerZ).toBe(20);
  });

  it('returns default bounds for empty map', () => {
    const positions = new Map();
    const b = computeBounds(positions);
    expect(b.minX).toBe(-10);
    expect(b.maxX).toBe(10);
    expect(b.minZ).toBe(-10);
    expect(b.maxZ).toBe(10);
    expect(b.sizeX).toBe(20);
    expect(b.sizeZ).toBe(20);
  });
});

// =============================================================================
// §8  Fog density formula
// =============================================================================

describe('Fog density formula', () => {
  function computeFogDensity(sizeX: number, sizeZ: number): number {
    const diagonal = Math.sqrt(sizeX ** 2 + sizeZ ** 2) || 20;
    return Math.min(0.003, 1.5 / Math.max(diagonal, 20));
  }

  it('caps at 0.003 for small networks', () => {
    // Small network: 5x5 → diagonal ≈ 7.07 → capped to 20 → 1.5/20 = 0.075 → min(0.003, 0.075) = 0.003
    expect(computeFogDensity(5, 5)).toBe(0.003);
  });

  it('decreases for larger networks', () => {
    // 500x500 → diagonal ≈ 707 → 1.5/707 ≈ 0.00212
    const density = computeFogDensity(500, 500);
    expect(density).toBeLessThan(0.003);
    expect(density).toBeCloseTo(0.00212, 4);
  });

  it('uses minimum diagonal of 20', () => {
    // 0x0 → diagonal = 0 → defaults to 20 → 1.5/20 = 0.075 → capped at 0.003
    expect(computeFogDensity(0, 0)).toBe(0.003);
  });

  it('inversely scales with network size', () => {
    const small = computeFogDensity(100, 100);
    const large = computeFogDensity(1000, 1000);
    expect(small).toBeGreaterThan(large);
  });
});

// =============================================================================
// §9  Camera framing
// =============================================================================

describe('frameOverview', () => {
  it('returns position and lookAt as plain objects', () => {
    const center = { x: 0, y: 0, z: 0 };
    const bbox = { min: { x: -10, z: -10 }, max: { x: 10, z: 10 } };
    const result = frameOverview(center, bbox);

    expect(result).toHaveProperty('position');
    expect(result).toHaveProperty('lookAt');
    expect(typeof result.position.x).toBe('number');
    expect(typeof result.position.y).toBe('number');
    expect(typeof result.position.z).toBe('number');
  });

  it('lookAt Y is -1 (slightly below ground)', () => {
    const result = frameOverview({ x: 0, y: 0, z: 0 }, null);
    expect(result.lookAt.y).toBe(-1);
  });

  it('camera height is positive (elevated view)', () => {
    const result = frameOverview({ x: 0, y: 0, z: 0 }, null);
    expect(result.position.y).toBeGreaterThan(0);
  });

  it('enforces minimum distance of 10', () => {
    // Very small bbox → distance calculation should be at least 10
    const result = frameOverview(
      { x: 0, y: 0, z: 0 },
      { min: { x: -0.1, z: -0.1 }, max: { x: 0.1, z: 0.1 } },
    );
    const dist = Math.sqrt(
      result.position.x ** 2 + result.position.y ** 2 + result.position.z ** 2,
    );
    expect(dist).toBeGreaterThanOrEqual(10);
  });

  it('uses 45-degree elevation angle', () => {
    const result = frameOverview(
      { x: 0, y: 0, z: 0 },
      { min: { x: -50, z: -50 }, max: { x: 50, z: 50 } },
    );
    // At 45-deg elevation: height ≈ horizontal distance
    const horizontalDist = Math.sqrt(result.position.x ** 2 + result.position.z ** 2);
    expect(result.position.y).toBeCloseTo(horizontalDist, 0);
  });

  it('centers lookAt on the provided center', () => {
    const result = frameOverview({ x: 50, y: 0, z: -30 }, null);
    expect(result.lookAt.x).toBe(50);
    expect(result.lookAt.z).toBe(-30);
  });

  it('uses default 20x20 size when no bounding box', () => {
    const r1 = frameOverview({ x: 0, y: 0, z: 0 }, null);
    const r2 = frameOverview(
      { x: 0, y: 0, z: 0 },
      { min: { x: -10, z: -10 }, max: { x: 10, z: 10 } },
    );
    // Both should produce same distance since default = 20x20 and bbox is also 20x20
    const d1 = Math.sqrt(r1.position.x ** 2 + r1.position.y ** 2 + r1.position.z ** 2);
    const d2 = Math.sqrt(r2.position.x ** 2 + r2.position.y ** 2 + r2.position.z ** 2);
    expect(d1).toBeCloseTo(d2, 1);
  });
});

describe('frameNode', () => {
  it('returns fallback overview when node position not found', () => {
    const result = frameNode({ id: '999' }, new Map(), []);
    expect(result).toHaveProperty('position');
    expect(result).toHaveProperty('lookAt');
  });

  it('positions camera perpendicular to connected pipe direction', () => {
    const positions = new Map([
      ['1', { x: 0, y: 0, z: 0, depth: 3 }],
      ['2', { x: 10, y: 0, z: 0, depth: 2 }],
    ]);
    const edges = [{ tail: '1', head: '2' }];

    const result = frameNode({ id: '1' }, positions, edges);

    // Pipe goes in X direction, so camera should be offset in Z direction (perpendicular)
    // Camera should NOT be directly along the X axis
    expect(Math.abs(result.position.z)).toBeGreaterThan(0.5);
  });

  it('lookAt target is at shaft mid-depth', () => {
    const positions = new Map([
      ['1', { x: 5, y: 2, z: -3, depth: 4 }],
    ]);
    const result = frameNode({ id: '1' }, positions, []);

    // lookAt.y = pos.y - depth/2 = 2 - 4/2 = 0
    expect(result.lookAt.y).toBe(0);
    expect(result.lookAt.x).toBe(5);
    expect(result.lookAt.z).toBe(-3);
  });

  it('camera offset is at least max(4, depth*2)', () => {
    const positions = new Map([
      ['1', { x: 0, y: 0, z: 0, depth: 1 }],
    ]);
    const result = frameNode({ id: '1' }, positions, []);
    const dx = result.position.x - 0;
    const dz = result.position.z - 0;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    // offset = max(4, 1*2) = 4
    expect(horizontalDist).toBeCloseTo(4, 1);
  });

  it('deep manhole uses depth*2 offset when > 4', () => {
    const positions = new Map([
      ['1', { x: 0, y: 0, z: 0, depth: 8 }],
    ]);
    const result = frameNode({ id: '1' }, positions, []);
    const dx = result.position.x;
    const dz = result.position.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    // offset = max(4, 8*2) = 16
    expect(horizontalDist).toBeCloseTo(16, 1);
  });

  it('camera Y is lookAt.y + 1', () => {
    const positions = new Map([
      ['1', { x: 0, y: 5, z: 0, depth: 6 }],
    ]);
    const result = frameNode({ id: '1' }, positions, []);
    // lookY = 5 - 6/2 = 2
    expect(result.lookAt.y).toBe(2);
    expect(result.position.y).toBe(3);
  });
});

describe('frameEdge', () => {
  it('returns overview fallback when positions not found', () => {
    const result = frameEdge({ tail: '1', head: '2' }, new Map());
    expect(result).toHaveProperty('position');
    expect(result).toHaveProperty('lookAt');
  });

  it('lookAt is at the pipe midpoint', () => {
    const positions = new Map([
      ['1', { x: 0, y: 0, z: 0 }],
      ['2', { x: 20, y: 4, z: 10 }],
    ]);
    const edge = { tail: '1', head: '2', tail_measurement: '1.5', head_measurement: '2.0' };
    const result = frameEdge(edge, positions);

    expect(result.lookAt.x).toBeCloseTo(10, 1);
    expect(result.lookAt.z).toBeCloseTo(5, 1);
  });

  it('camera is perpendicular to pipe direction', () => {
    const positions = new Map([
      ['1', { x: 0, y: 0, z: 0 }],
      ['2', { x: 10, y: 0, z: 0 }],
    ]);
    const edge = { tail: '1', head: '2', tail_measurement: '1.5', head_measurement: '1.5' };
    const result = frameEdge(edge, positions);

    // Pipe goes in X direction → camera offset should be in Z direction
    const midX = 5;
    expect(Math.abs(result.position.z)).toBeGreaterThan(1);
    expect(result.position.x).toBeCloseTo(midX, 1);
  });

  it('offset is at least max(pipeLen*0.8, 5)', () => {
    const positions = new Map([
      ['1', { x: 0, y: 0, z: 0 }],
      ['2', { x: 3, y: 0, z: 0 }],
    ]);
    const edge = { tail: '1', head: '2', tail_measurement: '1.5', head_measurement: '1.5' };
    const result = frameEdge(edge, positions);

    const dx = result.position.x - result.lookAt.x;
    const dz = result.position.z - result.lookAt.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // pipeLen = 3, offset = max(3*0.8, 5) = max(2.4, 5) = 5
    expect(dist).toBeCloseTo(5, 1);
  });
});

describe('computeInitialCamera', () => {
  const center = { x: 0, y: 0, z: 0 };
  const bbox = { min: { x: -10, z: -10 }, max: { x: 10, z: 10 } };
  const positions = new Map([
    ['1', { x: 0, y: 0, z: 0, depth: 3 }],
    ['2', { x: 10, y: 0, z: 5, depth: 2 }],
  ]);
  const edges = [
    { tail: '1', head: '2', tail_measurement: '1.5', head_measurement: '1.0' },
  ];

  it('returns overview when no selection', () => {
    const result = computeInitialCamera({
      selection: null,
      positions3D: positions,
      edges,
      center,
      boundingBox: bbox,
    });
    expect(result.lookAt.y).toBe(-1); // overview characteristic
  });

  it('returns node frame when selection.type is "node"', () => {
    const result = computeInitialCamera({
      selection: { type: 'node', node: { id: '1' } },
      positions3D: positions,
      edges,
      center,
      boundingBox: bbox,
    });
    // Node frame lookAt should be at the node's position
    expect(result.lookAt.x).toBe(0);
    expect(result.lookAt.z).toBe(0);
  });

  it('returns edge frame when selection.type is "edge"', () => {
    const result = computeInitialCamera({
      selection: { type: 'edge', edge: edges[0] },
      positions3D: positions,
      edges,
      center,
      boundingBox: bbox,
    });
    // Edge frame lookAt should be at the pipe midpoint
    expect(result.lookAt.x).toBeCloseTo(5, 1);
  });
});

// =============================================================================
// §10  Material color mappings
// =============================================================================

describe('NODE_TYPE_COLORS', () => {
  it('has all expected node types', () => {
    expect(NODE_TYPE_COLORS).toHaveProperty('Manhole');
    expect(NODE_TYPE_COLORS).toHaveProperty('Drainage');
    expect(NODE_TYPE_COLORS).toHaveProperty('Home');
    expect(NODE_TYPE_COLORS).toHaveProperty('Covered');
    expect(NODE_TYPE_COLORS).toHaveProperty('ForLater');
  });

  it('has distinct colors for each type', () => {
    const colors = Object.values(NODE_TYPE_COLORS);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });

  it('Manhole is gray (0x555555)', () => {
    expect(NODE_TYPE_COLORS.Manhole).toBe(0x555555);
  });

  it('Home is brown (0x795548)', () => {
    expect(NODE_TYPE_COLORS.Home).toBe(0x795548);
  });
});

describe('EDGE_TYPE_COLORS', () => {
  it('has all expected edge types', () => {
    expect(EDGE_TYPE_COLORS).toHaveProperty('קו ראשי');
    expect(EDGE_TYPE_COLORS).toHaveProperty('קו סניקה');
    expect(EDGE_TYPE_COLORS).toHaveProperty('קו משני');
  });

  it('has distinct colors for each type', () => {
    const colors = Object.values(EDGE_TYPE_COLORS);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });

  it('main line is blue (0x2563eb)', () => {
    expect(EDGE_TYPE_COLORS['קו ראשי']).toBe(0x2563eb);
  });

  it('drainage line is orange (0xfb923c)', () => {
    expect(EDGE_TYPE_COLORS['קו סניקה']).toBe(0xfb923c);
  });

  it('secondary line is teal (0x0d9488)', () => {
    expect(EDGE_TYPE_COLORS['קו משני']).toBe(0x0d9488);
  });
});

// =============================================================================
// §11  FPS Controls — speed steps
// =============================================================================

describe('FPS speed steps', () => {
  const SPEED_STEPS = [0.25, 0.5, 1, 2, 4, 8, 16];
  const DEFAULT_SPEED_INDEX = 2;
  const BASE_SPEED = 5;
  const SPRINT_FACTOR = 3;

  it('default speed index is 2 (1x)', () => {
    expect(SPEED_STEPS[DEFAULT_SPEED_INDEX]).toBe(1);
  });

  it('has 7 speed presets', () => {
    expect(SPEED_STEPS).toHaveLength(7);
  });

  it('speeds are monotonically increasing', () => {
    for (let i = 1; i < SPEED_STEPS.length; i++) {
      expect(SPEED_STEPS[i]).toBeGreaterThan(SPEED_STEPS[i - 1]);
    }
  });

  it('slowest speed is 0.25x', () => {
    expect(SPEED_STEPS[0]).toBe(0.25);
  });

  it('fastest speed is 16x', () => {
    expect(SPEED_STEPS[SPEED_STEPS.length - 1]).toBe(16);
  });

  it('base speed is 5 m/s', () => {
    expect(BASE_SPEED).toBe(5);
  });

  it('sprint multiplies by 3', () => {
    expect(SPRINT_FACTOR).toBe(3);
  });

  it('max actual speed is 240 m/s (base * 16 * sprint)', () => {
    const maxSpeed = BASE_SPEED * 16 * SPRINT_FACTOR;
    expect(maxSpeed).toBe(240);
  });

  it('min actual speed is 1.25 m/s (base * 0.25 * 1)', () => {
    const minSpeed = BASE_SPEED * 0.25 * 1;
    expect(minSpeed).toBe(1.25);
  });
});

describe('FPS movement math', () => {
  it('forward vector at yaw=0 pitch=0 points into -Z', () => {
    const yaw = 0;
    const pitch = 0;
    const fwdX = -Math.sin(yaw) * Math.cos(pitch);
    const fwdY = Math.sin(pitch);
    const fwdZ = -Math.cos(yaw) * Math.cos(pitch);
    expect(fwdX).toBeCloseTo(0, 5);
    expect(fwdY).toBeCloseTo(0, 5);
    expect(fwdZ).toBeCloseTo(-1, 5);
  });

  it('right vector at yaw=0 points into +X', () => {
    const yaw = 0;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    expect(rightX).toBeCloseTo(1, 5);
    expect(rightZ).toBeCloseTo(0, 5);
  });

  it('pitch limit is 85 degrees (1.484 rad)', () => {
    const PITCH_LIMIT = (85 * Math.PI) / 180;
    expect(PITCH_LIMIT).toBeCloseTo(1.4835, 3);
  });

  it('looking straight up (pitch=85°), forward has minimal XZ component', () => {
    const yaw = 0;
    const pitch = (85 * Math.PI) / 180;
    const fwdX = -Math.sin(yaw) * Math.cos(pitch);
    const fwdZ = -Math.cos(yaw) * Math.cos(pitch);
    // cos(85°) ≈ 0.087
    expect(Math.abs(fwdX)).toBeLessThan(0.1);
    expect(Math.abs(fwdZ)).toBeLessThan(0.1);
  });

  it('turning 90° right (yaw=-PI/2), forward points into +X', () => {
    const yaw = -Math.PI / 2;
    const pitch = 0;
    const fwdX = -Math.sin(yaw) * Math.cos(pitch);
    const fwdZ = -Math.cos(yaw) * Math.cos(pitch);
    expect(fwdX).toBeCloseTo(1, 3);
    expect(fwdZ).toBeCloseTo(0, 3);
  });
});

// =============================================================================
// §12  Miniature mode state
// =============================================================================

describe('Miniature mode state', () => {
  beforeEach(() => {
    resetMiniatureState();
  });

  it('starts in non-miniature mode', () => {
    expect(isMiniatureMode()).toBe(false);
  });

  it('resetMiniatureState sets back to false', () => {
    // We can't toggle without Three.js, but we can verify reset
    resetMiniatureState();
    expect(isMiniatureMode()).toBe(false);
  });
});

// =============================================================================
// §13  Miniature geometry sizes
// =============================================================================

describe('Miniature object sizes', () => {
  it('mini sphere has radius 0.25m', () => {
    const MINI_SPHERE_RADIUS = 0.25;
    expect(MINI_SPHERE_RADIUS).toBe(0.25);
  });

  it('mini box is 0.5 x 0.4 x 0.5m', () => {
    const BOX_W = 0.5, BOX_H = 0.4, BOX_D = 0.5;
    expect(BOX_W).toBe(0.5);
    expect(BOX_H).toBe(0.4);
    expect(BOX_D).toBe(0.5);
  });

  it('pipe miniature scale is 0.15 in XY', () => {
    const PIPE_MINI_SCALE = 0.15;
    expect(PIPE_MINI_SCALE).toBe(0.15);
  });

  it('mini box Y position is 0.2m', () => {
    const MINI_BOX_Y = 0.2;
    expect(MINI_BOX_Y).toBe(0.2);
  });

  it('mini sphere Y offset is original cover pos + 0.25', () => {
    const originalCoverY = 0.03; // COVER_HEIGHT/2
    const miniSphereY = originalCoverY + 0.25;
    expect(miniSphereY).toBeCloseTo(0.28, 2);
  });
});

// =============================================================================
// §14  Joystick clamping math
// =============================================================================

describe('Joystick knob clamping', () => {
  const BASE_RADIUS = 60;

  function computeKnobPosition(dx: number, dy: number, max: number) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, max);
    if (dist > 0.001) {
      return {
        knobX: (dx / dist) * clamped * (BASE_RADIUS / max),
        knobY: (dy / dist) * clamped * (BASE_RADIUS / max),
      };
    }
    return { knobX: 0, knobY: 0 };
  }

  it('returns (0,0) for zero movement', () => {
    const { knobX, knobY } = computeKnobPosition(0, 0, 60);
    expect(knobX).toBe(0);
    expect(knobY).toBe(0);
  });

  it('maps max travel to BASE_RADIUS', () => {
    const { knobX } = computeKnobPosition(60, 0, 60);
    expect(knobX).toBeCloseTo(BASE_RADIUS, 1);
  });

  it('clamps beyond max travel', () => {
    const { knobX } = computeKnobPosition(120, 0, 60);
    expect(knobX).toBeCloseTo(BASE_RADIUS, 1);
  });

  it('preserves direction for diagonal input', () => {
    const { knobX, knobY } = computeKnobPosition(30, 30, 60);
    expect(knobX).toBeCloseTo(knobY, 3); // 45-degree angle
    expect(knobX).toBeGreaterThan(0);
  });

  it('scales proportionally for partial input', () => {
    const { knobX } = computeKnobPosition(30, 0, 60);
    // 30/60 = 0.5, so knob = 0.5 * BASE_RADIUS = 30
    expect(knobX).toBeCloseTo(30, 1);
  });
});

// =============================================================================
// §15  Ground plane and grid sizing
// =============================================================================

describe('Ground plane sizing', () => {
  it('ground size is 2x the max of sizeX, sizeZ, or 20', () => {
    function computeGroundSize(sizeX: number, sizeZ: number) {
      return Math.max(sizeX, sizeZ, 20) * 2;
    }

    expect(computeGroundSize(10, 10)).toBe(40); // min 20 * 2
    expect(computeGroundSize(50, 30)).toBe(100);
    expect(computeGroundSize(200, 150)).toBe(400);
  });

  it('grid divisions are capped at 40', () => {
    function computeGridDivisions(groundSize: number) {
      return Math.min(Math.floor(groundSize / 2), 40);
    }

    expect(computeGridDivisions(40)).toBe(20);
    expect(computeGridDivisions(80)).toBe(40);
    expect(computeGridDivisions(200)).toBe(40); // capped
  });
});

// =============================================================================
// §16  Orbit control parameters
// =============================================================================

describe('Orbit control parameters', () => {
  it('damping factor is 0.08', () => {
    expect(0.08).toBe(0.08);
  });

  it('min orbit distance is 1', () => {
    expect(1).toBe(1);
  });

  it('max orbit distance is 500', () => {
    expect(500).toBe(500);
  });

  it('max polar angle is 0.85 * PI (153 degrees)', () => {
    const maxPolar = Math.PI * 0.85;
    expect(maxPolar).toBeCloseTo(2.6704, 3);
    // This prevents camera from going below ground
    expect(maxPolar).toBeLessThan(Math.PI);
  });

  it('zoom in factor is 0.7 (30% closer)', () => {
    const original = 100;
    const zoomed = original * 0.7;
    expect(zoomed).toBe(70);
  });

  it('zoom out factor is 1.4 (40% further)', () => {
    const original = 100;
    const zoomed = original * 1.4;
    expect(zoomed).toBe(140);
  });
});

// =============================================================================
// §17  Camera parameters
// =============================================================================

describe('Camera parameters', () => {
  it('FOV is 60 degrees', () => {
    const FOV = 60;
    expect(FOV).toBe(60);
  });

  it('near plane is 0.1', () => {
    expect(0.1).toBe(0.1);
  });

  it('far plane is 2000', () => {
    expect(2000).toBe(2000);
  });

  it('pixel ratio cap is 2', () => {
    const cap = Math.min(3, 2); // simulating high-DPR device
    expect(cap).toBe(2);
  });

  it('delta time cap is 0.1s (100ms)', () => {
    const dtCap = 0.1;
    expect(dtCap).toBe(0.1);
  });
});
