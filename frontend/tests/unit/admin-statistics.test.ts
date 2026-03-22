/**
 * Unit tests for AdminStatistics (admin-statistics.js)
 *
 * Tests the statistics dashboard: toolbar rendering, data loading,
 * filter logic, summary computation, and chart rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminStatistics } from '../../src/admin/admin-statistics.js';

function mockT(key: string, ...args: any[]) {
  if (args.length > 0) return `${key}:${args.join(',')}`;
  return key;
}

const mockStatsData = {
  summary: {
    totalSketches: 10,
    totalNodes: 200,
    totalEdges: 180,
    totalKm: 15.5,
    nodesWithCoords: 150,
    completionPct: 75,
    velocityChangePct: 12,
    weekVelocity: 25,
    weekKm: 3.2,
    prevWeekVelocity: 22,
    targetKm: 50,
    forecastDays: 30,
  },
  perUser: [
    {
      user: 'alice@test.com',
      sketchesCreated: 5,
      nodesCreated: 100,
      nodesMeasured: 80,
      avgAccuracy: 0.02,
      nodesPerDay: 8.5,
      activeDays: 12,
      lastActive: '2026-03-20T10:00:00Z',
    },
    {
      user: 'bob@test.com',
      sketchesCreated: 5,
      nodesCreated: 100,
      nodesMeasured: 70,
      avgAccuracy: 0.05,
      nodesPerDay: 6.0,
      activeDays: 15,
      lastActive: '2026-03-21T14:00:00Z',
    },
  ],
  perProject: [
    { name: 'Project A', sketches: 6, nodes: 120, edges: 100, km: 8.5, nodesWithCoords: 90 },
    { name: 'Project B', sketches: 4, nodes: 80, edges: 80, km: 7.0, nodesWithCoords: 60 },
  ],
  weekly: [
    { weekStart: '2026-03-02', count: 20, km: 1.5 },
    { weekStart: '2026-03-09', count: 30, km: 2.1 },
    { weekStart: '2026-03-16', count: 25, km: 1.8 },
  ],
  accuracyDistribution: { rtk: 100, float: 30, dgps: 10, gps: 5, unknown: 5 },
  issueBreakdown: { missingCoords: 10, missingMeasurements: 5, longEdges: 3, negativeGradients: 2 },
  activityHeatmap: [
    { date: '2026-03-20', user: 'alice@test.com', count: 10 },
    { date: '2026-03-20', user: 'bob@test.com', count: 8 },
    { date: '2026-03-21', user: 'alice@test.com', count: 12 },
    { date: '2026-03-19', user: 'bob@test.com', count: 5 },
  ],
  records: {
    peakDay: { date: '2026-03-15', count: 35 },
    peakWeek: { weekStart: '2026-03-09', count: 90 },
    thisMonth: { nodes: 80, activeDays: 15, avgPerDay: 5.3 },
    lastMonth: { nodes: 60, activeDays: 12, avgPerDay: 5.0 },
    monthOverMonthPct: 33,
  },
};

function setupFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/api/projects')) {
      return new Response(JSON.stringify({ projects: [
        { id: 'p1', name: 'Project A' },
        { id: 'p2', name: 'Project B' },
      ]}), { status: 200 });
    }
    if (urlStr.includes('/api/stats/workload')) {
      return new Response(JSON.stringify(mockStatsData), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
}

function createAdminStats(overrides: Record<string, any> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const showToast = vi.fn();
  return {
    instance: new AdminStatistics({
      container,
      t: mockT,
      showToast,
      currentUser: { role: 'super_admin' },
      ...overrides,
    }),
    container,
    showToast,
  };
}

describe('AdminStatistics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    setupFetch();
  });

  it('renders toolbar with filters', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    expect(container.querySelector('#statsProjectFilter')).not.toBeNull();
    expect(container.querySelector('#statsUserFilter')).not.toBeNull();
    expect(container.querySelector('#statsRangeFilter')).not.toBeNull();
    expect(container.querySelector('#statsPeriodToggle')).not.toBeNull();
    expect(container.querySelector('#statsRefreshBtn')).not.toBeNull();
  });

  it('populates project filter from API', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    const projSelect = container.querySelector('#statsProjectFilter') as HTMLSelectElement;
    // "All Projects" + 2 projects
    expect(projSelect.options.length).toBe(3);
    expect(projSelect.options[1].textContent).toBe('Project A');
  });

  it('renders summary cards with stats', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__cards') !== null);

    expect(container.innerHTML).toContain('200'); // totalNodes
    expect(container.innerHTML).toContain('15.5'); // totalKm
    expect(container.innerHTML).toContain('75%'); // completionPct
  });

  it('renders KPI row with velocity and forecast', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__kpi-row') !== null);

    expect(container.querySelector('.admin-stats__kpi-row')).not.toBeNull();
    expect(container.innerHTML).toContain('statistics.velocity');
    expect(container.innerHTML).toContain('statistics.completionForecast');
  });

  it('renders records section', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.innerHTML.includes('statistics.records'));

    expect(container.innerHTML).toContain('35'); // peak day count
    expect(container.innerHTML).toContain('statistics.peakDay');
    expect(container.innerHTML).toContain('statistics.peakWeek');
  });

  it('renders per-user table', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.stats-table') !== null);

    expect(container.innerHTML).toContain('alice@test.com');
    expect(container.innerHTML).toContain('bob@test.com');
  });

  it('renders per-project table', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelectorAll('.stats-table').length >= 2);

    expect(container.innerHTML).toContain('Project A');
    expect(container.innerHTML).toContain('Project B');
  });

  it('renders velocity chart when weekly data available', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__svg-chart') !== null);

    const svgChart = container.querySelector('.admin-stats__svg-chart svg');
    expect(svgChart).not.toBeNull();
    expect(svgChart?.querySelector('polyline')).not.toBeNull();
  });

  it('renders accuracy donut chart', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__donut-svg') !== null);

    const donutSvg = container.querySelector('.admin-stats__donut-svg');
    expect(donutSvg).not.toBeNull();
    expect(container.innerHTML).toContain('statistics.rtk');
  });

  it('renders issue breakdown bars', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__issue-row') !== null);

    const issueBars = container.querySelectorAll('.admin-stats__issue-row');
    expect(issueBars.length).toBe(4); // missingCoords, missingMeasurements, longEdges, negativeGradients
  });

  it('renders activity heatmap', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__heatmap') !== null);

    const heatmapCells = container.querySelectorAll('.admin-stats__heatmap-cell');
    expect(heatmapCells.length).toBeGreaterThan(0);
  });

  it('populates user filter from data', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => {
      const sel = container.querySelector('#statsUserFilter') as HTMLSelectElement;
      return sel && sel.options.length > 1;
    });

    const userSelect = container.querySelector('#statsUserFilter') as HTMLSelectElement;
    expect(userSelect.options.length).toBe(3); // "All Users" + 2 users
  });

  it('re-renders on user filter change without API call', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__cards') !== null);

    const fetchCountBefore = (fetch as any).mock.calls.length;

    const userSelect = container.querySelector('#statsUserFilter') as HTMLSelectElement;
    userSelect.value = 'alice@test.com';
    userSelect.dispatchEvent(new Event('change'));

    // No additional API call
    expect((fetch as any).mock.calls.length).toBe(fetchCountBefore);
  });

  it('highlights selected user in per-user table', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.stats-table') !== null);

    const userSelect = container.querySelector('#statsUserFilter') as HTMLSelectElement;
    userSelect.value = 'alice@test.com';
    userSelect.dispatchEvent(new Event('change'));

    const highlightedRow = container.querySelector('.admin-stats__row-highlight');
    expect(highlightedRow).not.toBeNull();
    expect(highlightedRow?.innerHTML).toContain('alice@test.com');
  });

  it('switches period toggle', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__cards') !== null);

    const weekBtn = container.querySelector('[data-period="week"]') as HTMLElement;
    weekBtn.click();

    expect(weekBtn.classList.contains('active')).toBe(true);
    const dayBtn = container.querySelector('[data-period="day"]') as HTMLElement;
    expect(dayBtn.classList.contains('active')).toBe(false);
  });

  it('re-renders on range filter change', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__cards') !== null);

    const rangeSelect = container.querySelector('#statsRangeFilter') as HTMLSelectElement;
    rangeSelect.value = '30';
    rangeSelect.dispatchEvent(new Event('change'));

    // Should still have summary cards (re-rendered)
    expect(container.querySelector('.admin-stats__cards')).not.toBeNull();
  });

  it('loads data for specific project on project filter change', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__cards') !== null);

    const projSelect = container.querySelector('#statsProjectFilter') as HTMLSelectElement;
    projSelect.value = 'p1';
    projSelect.dispatchEvent(new Event('change'));

    await vi.waitFor(() => {
      const workloadCalls = (fetch as any).mock.calls.filter(
        (c: any[]) => (typeof c[0] === 'string' ? c[0] : '').includes('projectId=p1')
      );
      return workloadCalls.length > 0;
    });
  });

  it('refreshes data on refresh button click', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__cards') !== null);

    const fetchCountBefore = (fetch as any).mock.calls.length;

    const refreshBtn = container.querySelector('#statsRefreshBtn') as HTMLElement;
    refreshBtn.click();

    await vi.waitFor(() => (fetch as any).mock.calls.length > fetchCountBefore);
  });

  it('shows error on data load failure', async () => {
    (fetch as any).mockImplementation(async (url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/projects')) return new Response('[]', { status: 200 });
      if (urlStr.includes('/api/stats/workload')) return new Response(JSON.stringify({ error: 'fail' }), { status: 500 });
      return new Response('{}', { status: 200 });
    });

    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.ap-empty--error') !== null);
    expect(container.querySelector('.ap-empty--error')).not.toBeNull();
  });

  it('renders velocity badge with up trend', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__cards') !== null);

    const badge = container.querySelector('.badge--up');
    expect(badge).not.toBeNull();
  });

  it('renders health ring with score', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__health-ring') !== null);

    const healthRing = container.querySelector('.admin-stats__health-ring svg');
    expect(healthRing).not.toBeNull();
  });

  it('renders km progress when targetKm is set', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.admin-stats__kpi-row') !== null);

    expect(container.innerHTML).toContain('15.5 / 50 km');
  });

  it('shows empty state when no data', async () => {
    (fetch as any).mockImplementation(async (url: any) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/api/projects')) return new Response('[]', { status: 200 });
      if (urlStr.includes('/api/stats/workload')) {
        return new Response(JSON.stringify({
          summary: { totalSketches: 0, totalNodes: 0, totalEdges: 0, totalKm: 0, nodesWithCoords: 0, completionPct: 0 },
          perUser: [],
          perProject: [],
          weekly: [],
          activityHeatmap: [],
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.querySelector('.ap-empty') !== null);
    expect(container.innerHTML).toContain('statistics.noData');
  });

  it('month-over-month badge renders correctly', async () => {
    const { instance, container } = createAdminStats();
    await instance.render();

    await vi.waitFor(() => container.innerHTML.includes('statistics.records'));

    // 33% up
    expect(container.innerHTML).toContain('33%');
  });
});

describe('AdminStatistics filter logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    setupFetch();
  });

  it('_getDateBounds returns correct range for 7 days', async () => {
    const { instance } = createAdminStats();
    instance._filterRange = '7';
    const bounds = instance._getDateBounds();
    const start = new Date(bounds.startDate);
    const end = new Date(bounds.endDate);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBe(6);
  });

  it('_getDateBounds returns correct range for thisMonth', async () => {
    const { instance } = createAdminStats();
    instance._filterRange = 'thisMonth';
    const bounds = instance._getDateBounds();
    expect(bounds.startDate).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('_computeFilteredSummary calculates correctly', async () => {
    const { instance } = createAdminStats();
    const heatmap = [
      { date: '2026-03-20', user: 'alice', count: 10 },
      { date: '2026-03-20', user: 'bob', count: 5 },
      { date: '2026-03-21', user: 'alice', count: 8 },
    ];

    const summary = instance._computeFilteredSummary(heatmap);
    expect(summary.totalNodes).toBe(23);
    expect(summary.activeDays).toBe(2);
    expect(summary.activeUsers).toBe(2);
    expect(summary.topUser).toEqual(['alice', 18]);
  });

  it('_aggregateByPeriod groups by day', async () => {
    const { instance } = createAdminStats();
    instance._filterPeriod = 'day';
    const heatmap = [
      { date: '2026-03-20', user: 'alice', count: 10 },
      { date: '2026-03-20', user: 'bob', count: 5 },
      { date: '2026-03-21', user: 'alice', count: 8 },
    ];

    const agg = instance._aggregateByPeriod(heatmap);
    expect(agg.length).toBe(2);
    expect(agg[0].count).toBe(15); // 10+5 on 03-20
    expect(agg[1].count).toBe(8); // 8 on 03-21
  });

  it('_aggregateByPeriod groups by month', async () => {
    const { instance } = createAdminStats();
    instance._filterPeriod = 'month';
    const heatmap = [
      { date: '2026-03-20', user: 'alice', count: 10 },
      { date: '2026-03-21', user: 'alice', count: 8 },
      { date: '2026-02-15', user: 'alice', count: 5 },
    ];

    const agg = instance._aggregateByPeriod(heatmap);
    expect(agg.length).toBe(2); // Feb and March
  });

  it('_computeHealthScore returns value between 0 and 100', async () => {
    const { instance } = createAdminStats();
    instance._data = { issueBreakdown: { missingCoords: 5 } };
    const score = instance._computeHealthScore({
      completionPct: 50,
      weekVelocity: 10,
      prevWeekVelocity: 8,
      totalNodes: 100,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
