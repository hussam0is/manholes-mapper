/**
 * Unit tests for AdminFeatures (admin-features.js)
 *
 * Tests feature flag management UI: target type toggling,
 * target select population, feature panel rendering, save flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminFeatures } from '../../src/admin/admin-features.js';

function mockT(key: string) {
  return key;
}

function createAdminFeatures(overrides: Record<string, any> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return {
    instance: new AdminFeatures({
      container,
      t: mockT,
      showToast: vi.fn(),
      currentUser: { role: 'super_admin' },
      ...overrides,
    }),
    container,
    showToast: overrides.showToast || vi.fn(),
  };
}

describe('AdminFeatures', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    // Default: fetch returns empty arrays
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/users')) {
        return new Response(JSON.stringify([
          { id: 'u1', name: 'Alice', email: 'alice@test.com' },
          { id: 'u2', name: 'Bob', email: 'bob@test.com' },
        ]), { status: 200 });
      }
      if (urlStr.includes('/api/organizations')) {
        return new Response(JSON.stringify([
          { id: 'org1', name: 'Acme Corp' },
          { id: 'org2', name: 'Widgets Inc' },
        ]), { status: 200 });
      }
      if (urlStr.includes('/api/features/')) {
        if ((url as any)?.method === 'PUT' || arguments[1]?.method === 'PUT') {
          return new Response('{}', { status: 200 });
        }
        return new Response(JSON.stringify({ features: { export_csv: true, export_sketch: false } }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
  });

  it('renders target type toggle with org and user buttons', async () => {
    const { instance, container } = createAdminFeatures();
    await instance.render();

    const orgBtn = container.querySelector('[data-type="org"]');
    const userBtn = container.querySelector('[data-type="user"]');
    expect(orgBtn).not.toBeNull();
    expect(userBtn).not.toBeNull();
    expect(orgBtn?.classList.contains('active')).toBe(true);
  });

  it('hides type toggle for non-super_admin', async () => {
    const { instance, container } = createAdminFeatures({ currentUser: { role: 'admin' } });
    await instance.render();

    const typeGroup = container.querySelector('#apFeaturesTypeGroup') as HTMLElement;
    expect(typeGroup?.style.display).toBe('none');
  });

  it('populates target select with organizations on render', async () => {
    const { instance, container } = createAdminFeatures();
    await instance.render();

    // Wait for _loadTargets
    await vi.waitFor(() => {
      const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
      return sel && sel.options.length > 1;
    });

    const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
    expect(sel.options.length).toBe(3); // placeholder + 2 orgs
    expect(sel.options[1].value).toBe('org1');
    expect(sel.options[1].textContent).toBe('Acme Corp');
  });

  it('switches to user targets on user button click', async () => {
    const { instance, container } = createAdminFeatures();
    await instance.render();

    await vi.waitFor(() => {
      const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
      return sel && sel.options.length > 1;
    });

    const userBtn = container.querySelector('[data-type="user"]') as HTMLElement;
    userBtn.click();

    expect(userBtn.classList.contains('active')).toBe(true);

    const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
    expect(sel.options.length).toBe(3); // placeholder + 2 users
    expect(sel.options[1].value).toBe('u1');
  });

  it('features panel is hidden until target selected', async () => {
    const { instance, container } = createAdminFeatures();
    await instance.render();

    const panel = container.querySelector('#apFeaturesPanel') as HTMLElement;
    expect(panel?.style.display).toBe('none');
  });

  it('loads and renders features when target selected', async () => {
    const { instance, container } = createAdminFeatures();
    await instance.render();

    await vi.waitFor(() => {
      const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
      return sel && sel.options.length > 1;
    });

    const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
    sel.value = 'org1';
    sel.dispatchEvent(new Event('change'));

    await vi.waitFor(() => {
      const panel = container.querySelector('#apFeaturesPanel') as HTMLElement;
      return panel?.querySelector('[data-feature-key]') !== null;
    });

    const panel = container.querySelector('#apFeaturesPanel') as HTMLElement;
    const featureToggles = panel.querySelectorAll('[data-feature-key]');
    expect(featureToggles.length).toBe(6); // All FEATURE_KEYS

    // Check that loaded values are set
    const csvToggle = panel.querySelector('[data-feature-key="export_csv"]') as HTMLInputElement;
    expect(csvToggle.checked).toBe(true);

    const sketchToggle = panel.querySelector('[data-feature-key="export_sketch"]') as HTMLInputElement;
    expect(sketchToggle.checked).toBe(false);
  });

  it('saves features on save button click', async () => {
    const showToast = vi.fn();
    const { instance, container } = createAdminFeatures({ showToast });
    await instance.render();

    await vi.waitFor(() => {
      const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
      return sel && sel.options.length > 1;
    });

    // Select target
    const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
    sel.value = 'org1';
    sel.dispatchEvent(new Event('change'));

    await vi.waitFor(() => {
      return container.querySelector('#apFeaturesSaveBtn') !== null;
    });

    // Toggle a feature
    const csvToggle = container.querySelector('[data-feature-key="export_csv"]') as HTMLInputElement;
    csvToggle.checked = false;

    // Click save
    const saveBtn = container.querySelector('#apFeaturesSaveBtn') as HTMLElement;
    saveBtn.click();

    await vi.waitFor(() => showToast.mock.calls.length > 0);
    expect(showToast).toHaveBeenCalledWith('adminPanel.features.saved');

    // Verify the PUT request was made
    const putCall = (fetch as any).mock.calls.find(
      (c: any[]) => c[0]?.includes?.('/api/features/') && c[1]?.method === 'PUT'
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse(putCall[1].body);
    expect(body.features.export_csv).toBe(false);
  });

  it('shows error toast on save failure', async () => {
    const showToast = vi.fn();
    // Make PUT fail
    (fetch as any).mockImplementation(async (url: any, opts: any) => {
      if (opts?.method === 'PUT') return new Response('error', { status: 500 });
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/users')) return new Response('[]', { status: 200 });
      if (urlStr.includes('/api/organizations')) return new Response('[]', { status: 200 });
      if (urlStr.includes('/api/features/')) return new Response(JSON.stringify({ features: {} }), { status: 200 });
      return new Response('{}', { status: 200 });
    });

    const { instance, container } = createAdminFeatures({ showToast });
    await instance.render();

    await vi.waitFor(() => {
      const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
      return sel && sel.options.length >= 1;
    });

    // We need orgs in the select; let's simulate with direct internal state
    instance._orgs = [{ id: 'org1', name: 'Test' }];
    instance._populateTargetSelect();

    const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
    sel.value = 'org1';
    sel.dispatchEvent(new Event('change'));

    await vi.waitFor(() => container.querySelector('#apFeaturesSaveBtn') !== null);

    const saveBtn = container.querySelector('#apFeaturesSaveBtn') as HTMLElement;
    saveBtn.click();

    await vi.waitFor(() => showToast.mock.calls.length > 0);
    expect(showToast).toHaveBeenCalledWith('adminPanel.features.saveError');
  });

  it('handles fetch errors gracefully during target load', async () => {
    (fetch as any).mockRejectedValue(new Error('Network error'));

    const { instance, container } = createAdminFeatures();
    await instance.render();

    // Should still render without crashing
    expect(container.querySelector('#apFeaturesTargetSel')).not.toBeNull();
  });

  it('escapes HTML in target names', async () => {
    (fetch as any).mockImplementation(async (url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/organizations')) {
        return new Response(JSON.stringify([{ id: 'x', name: '<img src=x onerror=alert(1)>' }]), { status: 200 });
      }
      if (urlStr.includes('/api/users')) return new Response('[]', { status: 200 });
      return new Response('{}', { status: 200 });
    });

    const { instance, container } = createAdminFeatures();
    await instance.render();

    await vi.waitFor(() => {
      const sel = container.querySelector('#apFeaturesTargetSel') as HTMLSelectElement;
      return sel && sel.options.length > 1;
    });

    expect(container.innerHTML).not.toContain('<img');
  });
});
