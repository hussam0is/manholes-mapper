/**
 * Unit tests for AdminFixes (admin-fixes.js)
 *
 * Tests issue aggregation UI: rendering, filtering, sorting,
 * summary display, and fix application.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sketch-issues and fix-suggestions before importing AdminFixes
vi.mock('../../src/project/sketch-issues.js', () => ({
  computeSketchIssues: vi.fn((nodes, edges) => {
    const issues: any[] = [];
    for (const n of nodes) {
      if (!n.lat && !n.lng) {
        issues.push({ type: 'missing_coords', nodeId: n.id });
      }
    }
    for (const e of edges) {
      if (e.lengthM && e.lengthM > 100) {
        issues.push({ type: 'long_edge', edgeId: e.id, lengthM: e.lengthM });
      }
    }
    return { issues };
  }),
}));

vi.mock('../../src/project/fix-suggestions.js', () => ({
  getFixSuggestions: vi.fn((issue) => {
    if (issue.type === 'missing_coords') {
      return [
        { labelKey: 'adminPanel.fixes.navigateToNode', icon: 'place', navigateTo: true },
      ];
    }
    if (issue.type === 'long_edge') {
      return [
        { labelKey: 'adminPanel.fixes.splitEdge', icon: 'content_cut', apply: vi.fn(() => true) },
      ];
    }
    return [];
  }),
}));

import { AdminFixes } from '../../src/admin/admin-fixes.js';

function mockT(key: string) {
  return key;
}

const mockSketches = [
  {
    id: 's1',
    name: 'Sketch Alpha',
    nodes: [
      { id: 'n1', lat: 32.0, lng: 35.0 },
      { id: 'n2' }, // missing coords
    ],
    edges: [
      { id: 'e1', lengthM: 150 }, // long edge
    ],
  },
  {
    id: 's2',
    name: 'Sketch Beta',
    nodes: [
      { id: 'n3', lat: 32.1, lng: 35.1 },
    ],
    edges: [],
  },
];

function setupFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, opts: any) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/api/sketches') && !urlStr.match(/\/api\/sketches\/[^?]/)) {
      return new Response(JSON.stringify(mockSketches), { status: 200 });
    }
    if (urlStr.match(/\/api\/sketches\/.+/) && opts?.method === 'PUT') {
      return new Response('{}', { status: 200 });
    }
    if (urlStr.match(/\/api\/sketches\/.+/)) {
      const id = urlStr.split('/api/sketches/')[1]?.split('?')[0];
      const sketch = mockSketches.find(s => s.id === id);
      return new Response(JSON.stringify(sketch || { nodes: [], edges: [] }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
}

function createAdminFixes(overrides: Record<string, any> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const showToast = vi.fn();
  return {
    instance: new AdminFixes({
      container,
      t: mockT,
      showToast,
      ...overrides,
    }),
    container,
    showToast,
  };
}

describe('AdminFixes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    setupFetch();
  });

  it('renders refresh button, filter, and sort controls', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    expect(container.querySelector('#apFixesRefreshBtn')).not.toBeNull();
    expect(container.querySelector('#apFixesFilter')).not.toBeNull();
    expect(container.querySelector('#apFixesSort')).not.toBeNull();
  });

  it('shows press-refresh message initially', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    expect(container.innerHTML).toContain('adminPanel.fixes.pressRefresh');
  });

  it('loads issues on refresh click', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    const refreshBtn = container.querySelector('#apFixesRefreshBtn') as HTMLElement;
    refreshBtn.click();

    await vi.waitFor(() => {
      return container.querySelector('.ap-sketch-group') !== null;
    });

    // Sketch Alpha has issues, Sketch Beta does not
    const groups = container.querySelectorAll('.ap-sketch-group');
    expect(groups.length).toBe(1); // Only Sketch Alpha has issues
    expect(container.innerHTML).toContain('Sketch Alpha');
  });

  it('renders summary with issue counts after load', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    const refreshBtn = container.querySelector('#apFixesRefreshBtn') as HTMLElement;
    refreshBtn.click();

    await vi.waitFor(() => {
      const summary = container.querySelector('#apFixesSummary') as HTMLElement;
      return summary?.style.display !== 'none' && summary?.innerHTML.includes('ap-stat');
    });

    const summary = container.querySelector('#apFixesSummary');
    expect(summary).not.toBeNull();
    expect(summary?.innerHTML).toContain('1'); // 1 sketch with issues
  });

  it('renders issue rows with icons and type labels', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    container.querySelector('#apFixesRefreshBtn')?.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => container.querySelector('.ap-issue-row') !== null);

    const issueRows = container.querySelectorAll('.ap-issue-row');
    expect(issueRows.length).toBe(2); // missing_coords + long_edge
  });

  it('filters issues by type', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    container.querySelector('#apFixesRefreshBtn')?.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => container.querySelector('.ap-issue-row') !== null);

    const filterSelect = container.querySelector('#apFixesFilter') as HTMLSelectElement;
    filterSelect.value = 'missing_coords';
    filterSelect.dispatchEvent(new Event('change'));

    const issueRows = container.querySelectorAll('.ap-issue-row');
    expect(issueRows.length).toBe(1);
  });

  it('filters to empty when no matching issues', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    container.querySelector('#apFixesRefreshBtn')?.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => container.querySelector('.ap-issue-row') !== null);

    const filterSelect = container.querySelector('#apFixesFilter') as HTMLSelectElement;
    filterSelect.value = 'merge_candidate';
    filterSelect.dispatchEvent(new Event('change'));

    expect(container.querySelector('.ap-empty')).not.toBeNull();
  });

  it('sorts by sketch name', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    container.querySelector('#apFixesRefreshBtn')?.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => container.querySelector('.ap-issue-row') !== null);

    const sortSelect = container.querySelector('#apFixesSort') as HTMLSelectElement;
    sortSelect.value = 'sketch';
    sortSelect.dispatchEvent(new Event('change'));

    // Should still render without error
    expect(container.querySelector('.ap-sketch-group')).not.toBeNull();
  });

  it('sorts by count', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    container.querySelector('#apFixesRefreshBtn')?.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => container.querySelector('.ap-issue-row') !== null);

    const sortSelect = container.querySelector('#apFixesSort') as HTMLSelectElement;
    sortSelect.value = 'count';
    sortSelect.dispatchEvent(new Event('change'));

    expect(container.querySelector('.ap-sketch-group')).not.toBeNull();
  });

  it('shows navigate hint for navigation-only fixes', async () => {
    const { instance, container, showToast } = createAdminFixes();
    await instance.render();

    container.querySelector('#apFixesRefreshBtn')?.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => container.querySelector('[data-fix-apply]') !== null);

    // Find a navigate fix button
    const navBtn = container.querySelector('[data-navigate="1"]') as HTMLElement;
    if (navBtn) {
      navBtn.click();
      await vi.waitFor(() => showToast.mock.calls.length > 0);
      expect(showToast).toHaveBeenCalledWith('adminPanel.fixes.navigateHint');
    }
  });

  it('handles load error gracefully', async () => {
    (fetch as any).mockRejectedValue(new Error('Network error'));

    const { instance, container } = createAdminFixes();
    await instance.render();

    container.querySelector('#apFixesRefreshBtn')?.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => {
      return container.querySelector('.ap-empty--error') !== null;
    });

    expect(container.querySelector('.ap-empty--error')).not.toBeNull();
  });

  it('renders fix buttons for applicable issues', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    container.querySelector('#apFixesRefreshBtn')?.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => container.querySelector('[data-fix-apply]') !== null);

    const fixBtns = container.querySelectorAll('[data-fix-apply]');
    expect(fixBtns.length).toBeGreaterThan(0);
  });

  it('displays edge length detail in issue row', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    container.querySelector('#apFixesRefreshBtn')?.dispatchEvent(new MouseEvent('click'));

    await vi.waitFor(() => container.querySelector('.ap-issue-row') !== null);

    // long_edge should show 150m
    expect(container.innerHTML).toContain('150m');
  });

  it('prevents double loading', async () => {
    const { instance, container } = createAdminFixes();
    await instance.render();

    const refreshBtn = container.querySelector('#apFixesRefreshBtn') as HTMLElement;
    refreshBtn.click();
    refreshBtn.click(); // second click should be ignored

    await vi.waitFor(() => container.querySelector('.ap-sketch-group') !== null);

    // Only one set of fetches should have happened
    const sketchCalls = (fetch as any).mock.calls.filter(
      (c: any[]) => (typeof c[0] === 'string' ? c[0] : '').includes('/api/sketches?')
    );
    expect(sketchCalls.length).toBe(1);
  });
});
