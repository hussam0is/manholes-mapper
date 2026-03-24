/**
 * custom-select.js
 *
 * Replaces native <select> elements inside #sidebar with a custom styled
 * bottom-sheet picker on mobile/Android to avoid rendering artifacts
 * (Issue #37: garbled/overlapping icons in native select pickers).
 *
 * On desktop (pointer: fine), native selects are kept as-is.
 */

const isMobile = () =>
  window.matchMedia('(pointer: coarse)').matches ||
  /Android|iPhone|iPad/i.test(navigator.userAgent);

let activeOverlay = null;

function closeActiveOverlay() {
  if (activeOverlay) {
    activeOverlay.classList.add('custom-select-overlay--closing');
    setTimeout(() => {
      activeOverlay?.remove();
      activeOverlay = null;
    }, 200);
  }
}

/**
 * Show a custom bottom-sheet picker for a <select> element.
 */
function showCustomPicker(selectEl) {
  closeActiveOverlay();

  const overlay = document.createElement('div');
  overlay.className = 'custom-select-overlay';
  activeOverlay = overlay;

  const sheet = document.createElement('div');
  sheet.className = 'custom-select-sheet';

  // Title from the label
  const label = selectEl.closest('.field')?.querySelector('label')?.textContent || '';
  if (label) {
    const title = document.createElement('div');
    title.className = 'custom-select-sheet__title';
    title.textContent = label;
    sheet.appendChild(title);
  }

  // Options list
  const list = document.createElement('div');
  list.className = 'custom-select-sheet__list';

  Array.from(selectEl.options).forEach((opt, i) => {
    const item = document.createElement('button');
    item.className = 'custom-select-sheet__item';
    if (selectEl.selectedIndex === i) {
      item.classList.add('custom-select-sheet__item--selected');
    }
    item.textContent = opt.textContent;
    item.addEventListener('click', () => {
      selectEl.selectedIndex = i;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      closeActiveOverlay();
    });
    list.appendChild(item);
  });

  sheet.appendChild(list);
  overlay.appendChild(sheet);

  // Close on backdrop tap
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeActiveOverlay();
  });

  document.body.appendChild(overlay);

  // Trigger enter animation
  requestAnimationFrame(() => overlay.classList.add('custom-select-overlay--open'));

  // Scroll selected item into view
  const selected = list.querySelector('.custom-select-sheet__item--selected');
  if (selected) {
    requestAnimationFrame(() => selected.scrollIntoView({ block: 'center', behavior: 'instant' }));
  }
}

/**
 * Intercept mousedown/touchstart on <select> elements inside #sidebar
 * on mobile devices, replacing the native picker with a custom bottom sheet.
 */
export function initCustomSelect() {
  if (!isMobile()) return;

  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Use event delegation on the sidebar for all select elements
  sidebar.addEventListener('mousedown', (e) => {
    const select = e.target.closest('select');
    if (!select) return;
    e.preventDefault();
    showCustomPicker(select);
  });

  sidebar.addEventListener('touchend', (e) => {
    const select = e.target.closest('select');
    if (!select) return;
    e.preventDefault();
    showCustomPicker(select);
  }, { passive: false });
}
