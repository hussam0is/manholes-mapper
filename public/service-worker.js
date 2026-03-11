/*
 * Graph Sketcher Service Worker
 *
 * This service worker implements a more robust caching strategy to support
 * offline‑first behaviour. We version both the application shell and
 * runtime caches so that updates are properly propagated. Navigation
 * requests (HTML) use a network‑first strategy with a fallback to an
 * offline page. Static assets are served from cache first. All other
 * same‑origin GET requests use stale‑while‑revalidate.
 */

// Bump the application version whenever the caching strategy changes.  This
// ensures that old caches are cleaned up and the new service worker
// installs a fresh set of resources.  Previously the stale‑while‑revalidate
// handler for runtime requests would simply return an unresolved promise if
// the network was unavailable and there was no cached response, causing
// offline pages to break.  Increasing the version here forces browsers
// to pick up the updated logic.
const APP_VERSION = 'v114';
const PRECACHE = 'graph-sketch-shell-' + APP_VERSION;
const RUNTIME = 'graph-sketch-runtime-' + APP_VERSION;

// Derive the base path from the service worker scope so the app works when
// hosted at a sub‑path (e.g., /apps/graph/). Ensures cached URLs match requests.
const SCOPE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '/');
const withBase = (path) => {
  if (!path) return SCOPE_PATH;
  return SCOPE_PATH + path.replace(/^\//, '');
};

// Maximum number of entries allowed in the runtime cache.  When exceeded
// the oldest entries (first in the Cache API key list) are evicted.
const MAX_RUNTIME_CACHE_ITEMS = 100;

const OFFLINE_URL = withBase('offline.html');
// Note: We precache a small set of core assets that are guaranteed to exist at build time.
// The build output will fingerprint most JS and CSS assets into the /assets/ directory. Those
// files are handled dynamically via the runtime caching logic below; they don't need to be
// listed here explicitly. Keeping this list lean reduces churn across builds and avoids
// broken cache entries when filenames change.
const PRECACHE_ASSETS = [
  withBase('index.html'),
  OFFLINE_URL,
  withBase('manifest.json'),
  withBase('styles.css'),
  withBase('fonts/material-icons.woff2'),
  withBase('app_icon.png'),
  withBase('health/index.html')
];

/**
 * Trim a cache to at most `maxItems` entries by evicting the oldest keys
 * (those returned first by `cache.keys()`).  Returns a promise so callers
 * can pass it to `event.waitUntil()`.
 */
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const excess = keys.length - maxItems;
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  }
}

self.addEventListener('install', (event) => {
  // Precache the application shell and offline page
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Delete any old caches that don't match our current names
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== PRECACHE && key !== RUNTIME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Allow the page to ask the waiting worker to activate immediately
self.addEventListener('message', (event) => {
  const data = event && event.data;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Cache Google Fonts (icons and font files) for offline use.
  // We use cache‑first since these assets are versioned and immutable.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          const responseClone = response.clone();
          event.waitUntil(
            caches.open(RUNTIME).then((cache) => cache.put(request, responseClone)).then(() => trimCache(RUNTIME, MAX_RUNTIME_CACHE_ITEMS))
          );
          return response;
        } catch (_) {
          // Provide a safe empty fallback so respondWith never resolves undefined.
          const isStyle = request.destination === 'style' || /fonts\.googleapis\.com/.test(url.hostname);
          const headers = isStyle ? { 'content-type': 'text/css' } : { 'content-type': 'application/octet-stream' };
          return new Response('', { status: 200, headers });
        }
      })()
    );
    return;
  }

  // Only handle same‑origin requests below.  External resources (e.g. API calls
  // to third‑party domains) fall through untouched.  Note that Google Font
  // requests are handled separately above.
  if (url.origin !== self.location.origin) return;

  // Skip API requests - let the browser handle them directly so we get
  // proper error messages and avoid returning HTML fallbacks for JSON requests.
  if (url.pathname.startsWith(withBase('api/'))) return;

  // Use a network‑first strategy for navigation requests (e.g. HTML documents).
  // If the network is unavailable the cached page is served.  If the
  // navigation route hasn’t been cached yet (e.g. first visit while offline)
  // we fall back to the app shell and finally the offline fallback page.
  // Some browsers (certain Samsung/Android builds) can fail to set mode='navigate'.
  // Detect navigations via Accept header as a fallback.
  const acceptHeader = request.headers.get('accept') || '';
  const isNavigation = request.mode === 'navigate' || (request.method === 'GET' && acceptHeader.includes('text/html'));
  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Update runtime cache with the fresh response.  Cloning is
          // necessary because the response can only be consumed once.
          const copy = response.clone();
          event.waitUntil(
            caches.open(RUNTIME).then((cache) => cache.put(request, copy)).then(() => trimCache(RUNTIME, MAX_RUNTIME_CACHE_ITEMS))
          );
          return response;
        } catch (_) {
          // Attempt to return the exact page from cache
          const cached = await caches.match(request);
          if (cached) return cached;
          // Handle health route explicitly to support offline checks
          const path = url.pathname.replace(/\/$/, '');
          if (path.endsWith('/health')) {
            const health = await caches.match(withBase('health/index.html'));
            if (health) return health;
          }
          // Fallback to the pre‑cached app shell (index.html) or offline page
          const shell = await caches.match(withBase('index.html'));
          return shell || (await caches.match(OFFLINE_URL));
        }
      })()
    );
    return;
  }

  // Serve pre‑cached assets with a cache‑first strategy.  If the asset
  // isn’t cached we fetch it from the network, cache it and return it.
  // Should the fetch fail (e.g. offline) we fall back to the offline page.
  if (PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          const responseClone = response.clone();
          caches.open(PRECACHE).then((cache) => cache.put(request, responseClone));
          return response;
        } catch (_) {
          return caches.match(OFFLINE_URL);
        }
      })()
    );
    return;
  }

  // Cache-first strategy for built JS/CSS bundles under the /assets directory.  Vite fingerprints
  // these files (e.g. /assets/index-HASH.js) at build time.  Offline support breaks if we
  // always do a network request for them because the file names change each release and are
  // not listed in PRECACHE_ASSETS.  By caching them on first access and serving from the
  // runtime cache thereafter we ensure the app still works when offline.
  if (url.pathname.startsWith(withBase('assets/')) && request.method === 'GET') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          const responseClone = response.clone();
          event.waitUntil(
            caches.open(RUNTIME).then((cache) => cache.put(request, responseClone)).then(() => trimCache(RUNTIME, MAX_RUNTIME_CACHE_ITEMS))
          );
          return response;
        } catch (_) {
          // When offline and the file isn’t cached yet, fall back to the offline page rather than
          // returning a 504 for JS/CSS requests.  This prevents unhandled promise rejections in the app.
          return caches.match(OFFLINE_URL);
        }
      })()
    );
    return;
  }

  // Stale‑while‑revalidate for other same‑origin GET requests.  Return the
  // cached response immediately when available (for speed) and update the
  // cache in the background (for freshness).  When there is no cached
  // response we await the network fetch and return the fresh result.  If
  // both cache and network are unavailable we fall back to the offline page.
  if (request.method === 'GET') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);

        // Background fetch: update the cache regardless of whether we had a
        // cache hit.  We intentionally do NOT await this when returning the
        // cached response — that is the "while‑revalidate" part.
        const fetchAndCache = fetch(request)
          .then((response) => {
            const responseClone = response.clone();
            caches.open(RUNTIME).then((cache) =>
              cache.put(request, responseClone).then(() => trimCache(RUNTIME, MAX_RUNTIME_CACHE_ITEMS))
            );
            return response;
          })
          .catch(() => null);

        if (cached) {
          // Cache hit — return immediately, network updates in the background
          return cached;
        }

        // No cache hit — must wait for the network response
        const response = await fetchAndCache;
        if (response) return response;

        // Both cache and network failed — serve offline page
        return caches.match(OFFLINE_URL);
      })()
    );
    return;
  }

});