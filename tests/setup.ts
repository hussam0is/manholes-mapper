/**
 * Vitest setup file
 * 
 * Loads environment variables from .env.local before tests run.
 * Provides browser API mocks for jsdom environment.
 */

import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Verify required environment variables are set
const requiredVars = ['POSTGRES_URL'];
const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.warn(
    `Warning: Missing environment variables for integration tests: ${missing.join(', ')}\n` +
    'Some tests may be skipped. Make sure .env.local is configured.'
  );
}

// ── Browser API mocks for jsdom ──────────────────────────────────────

// Mock matchMedia (not provided by jsdom)
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},    // deprecated
      removeListener: () => {}, // deprecated
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Mock OffscreenCanvas (not provided by jsdom)
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  (globalThis as any).OffscreenCanvas = class OffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        canvas: this,
        fillRect: () => {},
        clearRect: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(0) }),
        putImageData: () => {},
        createImageData: () => ({ data: new Uint8ClampedArray(0) }),
        setTransform: () => {},
        drawImage: () => {},
        save: () => {},
        fillText: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        fill: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        arc: () => {},
        rect: () => {},
        clip: () => {},
        measureText: () => ({ width: 0 }),
        transform: () => {},
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        font: '10px sans-serif',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        direction: 'ltr',
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        shadowBlur: 0,
        shadowColor: 'rgba(0,0,0,0)',
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        setLineDash: () => {},
        getLineDash: () => [],
      };
    }
    transferToImageBitmap() { return {}; }
  };
}

// Mock ResizeObserver (not provided by jsdom)
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
