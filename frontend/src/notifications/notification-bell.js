/**
 * Notification bell module — polls for unread issue notifications
 * and renders them in the header dropdown.
 */

const POLL_INTERVAL_MS = 60_000; // Poll every 60 seconds

let bellEl = null;
let badgeEl = null;
let dropdownEl = null;
let pollTimer = null;
let isOpen = false;

/**
 * Initialize the notification bell.
 * Should be called after auth is confirmed (user is logged in).
 */
export function initNotificationBell() {
  bellEl = document.getElementById('notificationBell');
  badgeEl = document.getElementById('notificationBadge');
  dropdownEl = document.getElementById('notificationDropdown');

  if (!bellEl || !badgeEl || !dropdownEl) return;

  bellEl.style.display = '';

  bellEl.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (isOpen && !bellEl.contains(e.target)) {
      closeDropdown();
    }
  });

  // Initial fetch
  fetchCount();

  // Start polling
  pollTimer = setInterval(fetchCount, POLL_INTERVAL_MS);
}

/**
 * Stop polling (e.g., on logout).
 */
export function destroyNotificationBell() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (bellEl) bellEl.style.display = 'none';
}

async function fetchCount() {
  try {
    const resp = await fetch('/api/notifications?count=true');
    if (!resp.ok) return;
    const data = await resp.json();
    updateBadge(data.count || 0);
  } catch {
    // Silently ignore network errors
  }
}

function updateBadge(count) {
  if (!badgeEl) return;
  if (count > 0) {
    badgeEl.textContent = count > 99 ? '99+' : String(count);
    badgeEl.style.display = '';
  } else {
    badgeEl.style.display = 'none';
  }
}

function toggleDropdown() {
  if (isOpen) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function closeDropdown() {
  isOpen = false;
  if (dropdownEl) dropdownEl.classList.remove('open');
}

async function openDropdown() {
  isOpen = true;
  if (!dropdownEl) return;
  dropdownEl.classList.add('open');
  dropdownEl.innerHTML = '<div class="notification-empty">...</div>';

  try {
    const resp = await fetch('/api/notifications');
    if (!resp.ok) throw new Error('Failed');
    const data = await resp.json();
    const notifications = data.notifications || [];

    renderNotifications(notifications);
  } catch {
    dropdownEl.innerHTML = `<div class="notification-empty">${window.t?.('issue.loadError') || 'Error'}</div>`;
  }
}

function renderNotifications(notifications) {
  if (!dropdownEl) return;
  const t = window.t || ((k) => k);

  if (notifications.length === 0) {
    dropdownEl.innerHTML = `<div class="notification-empty">${t('issue.noNotifications')}</div>`;
    return;
  }

  const headerHtml = `
    <div class="notification-dropdown-header">
      <span>${t('issue.notifications')}</span>
      <button id="markAllReadBtn">${t('issue.markAllRead')}</button>
    </div>
  `;

  const itemsHtml = notifications.map(n => {
    const date = new Date(n.created_at);
    const lang = document.documentElement.lang === 'he' ? 'he-IL' : 'en-US';
    const timeStr = date.toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' });
    const typeLabel = n.type === 'issue_closed' ? t('issue.issueClosed')
      : n.type === 'issue_reopened' ? t('issue.issueReopened')
        : n.type === 'mention' ? t('issue.mentioned')
          : t('issue.newComment');
    const sketchName = n.sketch_name || '';
    const preview = n.comment_content ? n.comment_content.slice(0, 60) : '';

    return `
      <div class="notification-item" data-sketch-id="${n.sketch_id}" data-node-id="${n.node_id}">
        <div class="notification-item-header">${escapeHtmlLocal(n.commenter_username || '')} ${escapeHtmlLocal(typeLabel)}</div>
        ${preview ? `<div class="notification-item-body">${escapeHtmlLocal(preview)}</div>` : ''}
        <div class="notification-item-time">${escapeHtmlLocal(sketchName)} · ${timeStr}</div>
      </div>
    `;
  }).join('');

  dropdownEl.innerHTML = headerHtml + itemsHtml;

  // Mark all read button
  const markAllBtn = dropdownEl.querySelector('#markAllReadBtn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ all: true }),
        });
        updateBadge(0);
        closeDropdown();
      } catch {
        // ignore
      }
    });
  }
}

function escapeHtmlLocal(str) {
  if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
