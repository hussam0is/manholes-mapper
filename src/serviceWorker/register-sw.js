// Service worker registration and offline guards
// This module intentionally tolerates absence of i18n `t` and relies on window.showToast when available.

(function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Only register the service worker when served over HTTPS or from localhost.  Service
  // workers are not allowed on plain HTTP on most devices.  This check prevents
  // confusing errors during development.
  const isSecure = window.location.protocol === 'https:' || /^localhost$|^127\.0\.0\.1$/.test(window.location.hostname);
  if (!isSecure) return;
  navigator.serviceWorker
    .register('./service-worker.js')
    .then((reg) => {
      try { reg.update(); } catch (_) {}
      const intervalMs = 15 * 60 * 1000;
      setInterval(() => { try { reg.update(); } catch (_) {} }, intervalMs);

      /**
       * Show an "Update available" banner instead of silently reloading.
       * The user can choose to update now or dismiss.
       */
      function showUpdateBanner(waitingSW) {
        // Remove any existing banner first
        const existing = document.getElementById('sw-update-banner');
        if (existing) existing.remove();

        const isHebrew = (document.documentElement.lang || '').startsWith('he');
        const banner = document.createElement('div');
        banner.id = 'sw-update-banner';
        banner.setAttribute('role', 'alert');
        banner.setAttribute('dir', isHebrew ? 'rtl' : 'ltr');
        banner.innerHTML = [
          '<style>',
          '#sw-update-banner{',
          '  position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;',
          '  display:flex;align-items:center;gap:12px;',
          '  padding:12px 20px;border-radius:14px;',
          '  background:#1e293b;color:#f1f5f9;',
          '  box-shadow:0 8px 32px rgba(0,0,0,.25);',
          '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
          '  font-size:0.9rem;max-width:90vw;',
          '  animation:sw-slide-up .35s ease-out;',
          '}',
          '@keyframes sw-slide-up{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}',
          '#sw-update-banner button{',
          '  border:none;border-radius:8px;padding:6px 14px;font-size:0.85rem;font-weight:600;cursor:pointer;',
          '}',
          '#sw-update-banner .sw-update-btn{background:#3b82f6;color:#fff;}',
          '#sw-update-banner .sw-dismiss-btn{background:transparent;color:#94a3b8;}',
          '@media(prefers-color-scheme:dark){#sw-update-banner{background:#0f172a;border:1px solid #1e293b;}}',
          '</style>',
          '<span class="material-icons" style="font-size:1.3rem;color:#3b82f6">system_update</span>',
          '<span>' + (isHebrew ? 'גרסה חדשה זמינה' : 'A new version is available') + '</span>',
          '<button class="sw-update-btn">' + (isHebrew ? 'עדכן עכשיו' : 'Update') + '</button>',
          '<button class="sw-dismiss-btn">' + (isHebrew ? 'אחר כך' : 'Later') + '</button>'
        ].join('\n');

        document.body.appendChild(banner);

        banner.querySelector('.sw-update-btn').addEventListener('click', () => {
          banner.remove();
          if (waitingSW) {
            waitingSW.postMessage({ type: 'SKIP_WAITING' });
          }
        });

        banner.querySelector('.sw-dismiss-btn').addEventListener('click', () => {
          banner.remove();
        });
      }

      function handleWaitingSW(sw) {
        if (!sw) return;
        // If there's already an active controller, this is an update — show the banner
        if (navigator.serviceWorker.controller) {
          showUpdateBanner(sw);
        } else {
          // First install — activate immediately
          try { sw.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
        }
      }

      if (reg.waiting) handleWaitingSW(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed') {
            handleWaitingSW(sw);
          }
        });
      });
    })
    .catch((err) => {
      console.error('[SW] Service worker registration failed:', err.message);
    });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    // Show a brief "App updated" toast before reloading so the user
    // understands why the page is refreshing.
    if (typeof window.showToast === 'function') {
      const msg = typeof window.t === 'function'
        ? window.t('toasts.appUpdated')
        : 'App updated';
      window.showToast(msg, 1500);
      setTimeout(() => window.location.reload(), 800);
    } else {
      window.location.reload();
    }
  });
})();

(function setupOfflineRefreshGuards() {
  function isOffline() { return !navigator.onLine; }

  window.addEventListener('online', () => {
    if (typeof window.showToast === 'function' && typeof window.t === 'function') {
      window.showToast(window.t('toasts.online'));
    } else if (typeof window.showToast === 'function') {
      window.showToast('Connection restored');
    }
  });
  window.addEventListener('offline', () => {
    if (typeof window.showToast === 'function' && typeof window.t === 'function') {
      window.showToast(window.t('toasts.offline'));
    } else if (typeof window.showToast === 'function') {
      window.showToast('You are offline');
    }
  });

  window.addEventListener('keydown', (e) => {
    if (!isOffline()) return;
    const key = (e.key || '').toLowerCase();
    if (key === 'f5' || ((e.ctrlKey || e.metaKey) && key === 'r')) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.showToast === 'function' && typeof window.t === 'function') {
        window.showToast(window.t('toasts.refreshBlockedOffline'), 2200);
      }
    }
  }, { capture: true });

  window.addEventListener('beforeunload', (e) => {
    if (!isOffline()) return;
    e.preventDefault();
    e.returnValue = '';
    if (typeof window.showToast === 'function' && typeof window.t === 'function') {
      window.showToast(window.t('toasts.refreshBlockedOffline'), 2000);
    }
  });

  let touchStartY = 0;
  let touchStartScrollContainer = null;
  function findScrollableAncestor(el) {
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const canScroll = (node.scrollHeight > node.clientHeight) && (style.overflowY === 'auto' || style.overflowY === 'scroll');
      if (canScroll) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  window.addEventListener('touchstart', (e) => {
    if (!isOffline()) return;
    if (e.touches && e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      const target = /** @type {Element} */ (e.target);
      touchStartScrollContainer = findScrollableAncestor(target);
    }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!isOffline()) return;
    if (!touchStartScrollContainer) return;
    const isPageScroll = touchStartScrollContainer === (document.scrollingElement || document.documentElement);
    if (!isPageScroll) return;
    const y = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
    const scroller = document.scrollingElement || document.documentElement;
    const atTop = (scroller ? scroller.scrollTop : window.scrollY) <= 0;
    if (atTop && y > touchStartY + 10) {
      e.preventDefault();
    }
  }, { passive: false });
})();
