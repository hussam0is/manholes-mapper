/**
 * Capacitor API Proxy
 *
 * When running as a native Capacitor app, the WebView loads from https://localhost
 * which has no API backend. This module intercepts fetch() calls to /api/* and
 * redirects them to the production server.
 *
 * Must be imported early (before any API calls) in the app entry point.
 */

import { Capacitor } from '@capacitor/core';

const PRODUCTION_API = 'https://manholes-mapper.vercel.app';

export function isCapacitorNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getApiBaseUrl() {
  return isCapacitorNative() ? PRODUCTION_API : '';
}

if (isCapacitorNative()) {
  // Mark platform on <html> for CSS perf optimizations (e.g. disable backdrop-filter)
  try {
    const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
    document.documentElement.classList.add(`platform-${platform}`);
  } catch { /* ignore */ }

  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    let isApiCall = false;

    // Handle string URLs
    if (typeof input === 'string') {
      if (input.startsWith('/api/')) {
        input = PRODUCTION_API + input;
        isApiCall = true;
      } else if (input.startsWith('https://localhost/api/')) {
        input = input.replace('https://localhost', PRODUCTION_API);
        isApiCall = true;
      }
    }
    // Handle Request objects
    else if (input instanceof Request) {
      const url = input.url;
      if (url.includes('localhost/api/')) {
        const newUrl = url.replace(/https?:\/\/localhost/, PRODUCTION_API);
        input = new Request(newUrl, input);
        isApiCall = true;
      }
    }

    // Cross-origin API calls need credentials to send/receive cookies
    if (isApiCall) {
      init = { ...init, credentials: 'include' };
    }

    return originalFetch(input, init);
  };

  console.log('[CapacitorProxy] API calls will be routed to', PRODUCTION_API);
}
