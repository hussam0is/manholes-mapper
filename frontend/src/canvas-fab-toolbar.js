// Canvas FAB Speed Dial — collapses bottom-right action buttons into a single toggle
export function initCanvasFabToolbar() {
  const toolbar = document.getElementById('canvasFabToolbar');
  const toggle = document.getElementById('canvasFabToggle');
  if (!toolbar || !toggle) return;

  function open() {
    toolbar.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function close() {
    toolbar.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (toolbar.classList.contains('open')) close();
    else open();
  });

  // Close when tapping outside
  document.addEventListener('click', (e) => {
    if (toolbar.classList.contains('open') && !toolbar.contains(e.target)) {
      close();
    }
  });

  // Close after clicking an action (recenter, density, etc.)
  const actions = toolbar.querySelector('.canvas-fab-toolbar__actions');
  if (actions) {
    actions.addEventListener('click', (e) => {
      if (e.target.closest('.canvas-fab-toolbar__item')) {
        close();
      }
    });
  }

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toolbar.classList.contains('open')) {
      close();
      toggle.focus();
    }
  });
}
