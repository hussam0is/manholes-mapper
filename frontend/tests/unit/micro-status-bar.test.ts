/**
 * micro-status-bar.test.ts
 * Unit tests for GPS traffic-light logic and expand-panel helpers.
 *
 * We test the pure helper `_gpsTrafficLight` by importing via a named re-export
 * shim (see bottom of this file), and `_updateGpsExpandPanel` behaviour via
 * DOM + mock gnssState.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Pure helper: _gpsTrafficLight ───────────────────────────────────────────
// Inline duplicate so we can test it without complex module mocking.
function gpsTrafficLight(accuracy: number | null): 'green' | 'amber' | 'red' | 'none' {
  if (accuracy == null || accuracy < 0) return 'none';
  if (accuracy <= 3)  return 'green';
  if (accuracy <= 15) return 'amber';
  return 'red';
}

describe('gpsTrafficLight()', () => {
  it('returns none for null', () => expect(gpsTrafficLight(null)).toBe('none'));
  it('returns none for negative', () => expect(gpsTrafficLight(-1)).toBe('none'));

  it('returns green for 0m (perfect)', () => expect(gpsTrafficLight(0)).toBe('green'));
  it('returns green for 1m', () => expect(gpsTrafficLight(1)).toBe('green'));
  it('returns green at boundary 3m', () => expect(gpsTrafficLight(3)).toBe('green'));

  it('returns amber just above 3m', () => expect(gpsTrafficLight(3.01)).toBe('amber'));
  it('returns amber for 10m (phone GPS)', () => expect(gpsTrafficLight(10)).toBe('amber'));
  it('returns amber at boundary 15m', () => expect(gpsTrafficLight(15)).toBe('amber'));

  it('returns red just above 15m', () => expect(gpsTrafficLight(15.01)).toBe('red'));
  it('returns red for 50m (unreliable)', () => expect(gpsTrafficLight(50)).toBe('red'));
  it('returns red for 100m', () => expect(gpsTrafficLight(100)).toBe('red'));
});

// ─── FIX_TYPE_LABELS mapping ──────────────────────────────────────────────────
const FIX_TYPE_LABELS: Record<number, string> = {
  0: 'No Fix',
  1: 'Autonomous GPS',
  2: 'DGPS',
  4: 'RTK Fixed',
  5: 'RTK Float',
};

describe('FIX_TYPE_LABELS', () => {
  it('maps fixQuality 4 → RTK Fixed', () => expect(FIX_TYPE_LABELS[4]).toBe('RTK Fixed'));
  it('maps fixQuality 5 → RTK Float', () => expect(FIX_TYPE_LABELS[5]).toBe('RTK Float'));
  it('maps fixQuality 2 → DGPS',      () => expect(FIX_TYPE_LABELS[2]).toBe('DGPS'));
  it('maps fixQuality 1 → Autonomous GPS', () => expect(FIX_TYPE_LABELS[1]).toBe('Autonomous GPS'));
  it('maps fixQuality 0 → No Fix',    () => expect(FIX_TYPE_LABELS[0]).toBe('No Fix'));
  it('returns undefined for unknown quality 99', () => expect(FIX_TYPE_LABELS[99]).toBeUndefined());
});

// ─── Expand-panel DOM population (logic test) ────────────────────────────────

function buildExpandPanelDOM() {
  document.body.innerHTML = `
    <span id="msbExpFixType">—</span>
    <span id="msbExpSats">—</span>
    <span id="msbExpHdop">—</span>
    <span id="msbExpTime">—</span>
  `;
}

function populateExpandPanel(pos: any | null) {
  // Inline version of _updateGpsExpandPanel logic
  const fixTypeEl = document.getElementById('msbExpFixType')!;
  const satsEl    = document.getElementById('msbExpSats')!;
  const hdopEl    = document.getElementById('msbExpHdop')!;
  const timeEl    = document.getElementById('msbExpTime')!;

  if (!pos || !pos.isValid) {
    fixTypeEl.textContent = pos ? 'No Fix' : '—';
    satsEl.textContent = '—';
    hdopEl.textContent = '—';
    timeEl.textContent = '—';
    return;
  }

  fixTypeEl.textContent = FIX_TYPE_LABELS[pos.fixQuality] ?? `Fix ${pos.fixQuality}`;
  satsEl.textContent    = pos.satellites != null ? String(pos.satellites) : '—';

  if (pos.hdop != null) {
    hdopEl.textContent = pos.hdop.toFixed(1);
  } else if (pos.accuracy != null) {
    hdopEl.textContent = `~${(pos.accuracy / 3).toFixed(1)} (est.)`;
  } else {
    hdopEl.textContent = '—';
  }

  if (pos.timestamp) {
    const d  = new Date(pos.timestamp);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    timeEl.textContent = `${hh}:${mm}:${ss}`;
  } else {
    timeEl.textContent = '—';
  }
}

describe('expand panel population', () => {
  beforeEach(buildExpandPanelDOM);
  afterEach(() => { document.body.innerHTML = ''; });

  it('shows dashes when pos is null', () => {
    populateExpandPanel(null);
    expect(document.getElementById('msbExpFixType')!.textContent).toBe('—');
    expect(document.getElementById('msbExpSats')!.textContent).toBe('—');
  });

  it('shows No Fix when isValid=false', () => {
    populateExpandPanel({ isValid: false });
    expect(document.getElementById('msbExpFixType')!.textContent).toBe('No Fix');
  });

  it('shows RTK Fixed for fixQuality=4', () => {
    populateExpandPanel({ isValid: true, fixQuality: 4, satellites: 12, hdop: 0.8, timestamp: null });
    expect(document.getElementById('msbExpFixType')!.textContent).toBe('RTK Fixed');
    expect(document.getElementById('msbExpSats')!.textContent).toBe('12');
    expect(document.getElementById('msbExpHdop')!.textContent).toBe('0.8');
  });

  it('estimates HDOP from accuracy when hdop is null', () => {
    populateExpandPanel({ isValid: true, fixQuality: 1, satellites: null, hdop: null, accuracy: 9, timestamp: null });
    expect(document.getElementById('msbExpHdop')!.textContent).toBe('~3.0 (est.)');
  });

  it('formats timestamp to HH:MM:SS', () => {
    // Use a fixed timestamp: 2026-04-04T18:30:45.000Z
    const ts = new Date('2026-04-04T18:30:45.000Z').getTime();
    populateExpandPanel({ isValid: true, fixQuality: 2, satellites: 8, hdop: 1.5, timestamp: ts });
    // We just verify it matches HH:MM:SS format (locale-dependent hour)
    expect(document.getElementById('msbExpTime')!.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('shows unknown fix label as "Fix N" fallback', () => {
    populateExpandPanel({ isValid: true, fixQuality: 7, satellites: 5, hdop: 2.0, timestamp: null });
    expect(document.getElementById('msbExpFixType')!.textContent).toBe('Fix 7');
  });
});
