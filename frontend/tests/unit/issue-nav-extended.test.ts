/**
 * Extended tests for Issue Navigation State
 *
 * Tests navigateToCurrentIssue, goToNextIssue, goToPrevIssue, and listener
 * error handling — features not covered by the base test file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock issue-highlight since navigateToCurrentIssue calls startIssueHighlight
vi.mock('../../src/project/issue-highlight.js', () => ({
  startIssueHighlight: vi.fn(),
}));

async function freshModule() {
  vi.resetModules();
  return await import('../../src/project/issue-nav-state.js');
}

function makeNode(id: string, overrides: Record<string, unknown> = {}) {
  return { id, x: 100, y: 200, ...overrides };
}

describe('Issue Navigation State — Extended', () => {
  let setViewStateMock: ReturnType<typeof vi.fn>;
  let scheduleDrawMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setViewStateMock = vi.fn();
    scheduleDrawMock = vi.fn();
    (window as any).__getStretch = () => ({ x: 0.6, y: 1 });
    (window as any).__setViewState = setViewStateMock;
    (window as any).__scheduleDraw = scheduleDrawMock;

    // Create a mock canvas element
    const canvas = document.createElement('canvas');
    canvas.id = 'graphCanvas';
    canvas.style.width = '800px';
    canvas.style.height = '600px';
    document.body.appendChild(canvas);
    // Mock getBoundingClientRect
    canvas.getBoundingClientRect = () => ({
      width: 800, height: 600,
      top: 0, left: 0, bottom: 600, right: 800,
      x: 0, y: 0, toJSON: () => {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const canvas = document.getElementById('graphCanvas');
    if (canvas) canvas.remove();
  });

  describe('navigateToCurrentIssue', () => {
    it('should call __setViewState with computed transform', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1'), makeNode('2')], []);
      mod.navigateToCurrentIssue();
      expect(setViewStateMock).toHaveBeenCalledTimes(1);
      // targetScale=0.21, stretchX=0.6, stretchY=1
      // tx = 400 - 0.21 * 0.6 * worldX, ty = 300 - 0.21 * 1 * worldY
      const [scale, tx, ty] = setViewStateMock.mock.calls[0];
      expect(scale).toBe(0.21);
      expect(typeof tx).toBe('number');
      expect(typeof ty).toBe('number');
    });

    it('should call __scheduleDraw', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1')], []);
      mod.navigateToCurrentIssue();
      expect(scheduleDrawMock).toHaveBeenCalled();
    });

    it('should do nothing when no current issue', async () => {
      const mod = await freshModule();
      // No issues set up, node has coords + tl
      mod.setIssueContext('sk1', [makeNode('1', { surveyX: 1, surveyY: 2, tl: '1.5' })], []);
      mod.navigateToCurrentIssue();
      expect(setViewStateMock).not.toHaveBeenCalled();
    });

    it('should do nothing when canvas element missing', async () => {
      const canvas = document.getElementById('graphCanvas');
      canvas?.remove();
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1')], []);
      mod.navigateToCurrentIssue();
      expect(setViewStateMock).not.toHaveBeenCalled();
    });
  });

  describe('goToNextIssue', () => {
    it('should advance and navigate', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1'), makeNode('2'), makeNode('3')], []);
      const issue = mod.goToNextIssue();
      expect(issue).not.toBeNull();
      expect(mod.getNavState().currentIndex).toBe(1);
      expect(setViewStateMock).toHaveBeenCalled();
    });

    it('should return null when no issues', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1', { surveyX: 1, surveyY: 2, tl: '1.5' })], []);
      const issue = mod.goToNextIssue();
      expect(issue).toBeNull();
      expect(setViewStateMock).not.toHaveBeenCalled();
    });
  });

  describe('goToPrevIssue', () => {
    it('should go back and navigate', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1'), makeNode('2'), makeNode('3')], []);
      mod.nextIssue(); // index 1
      const issue = mod.goToPrevIssue();
      expect(issue).not.toBeNull();
      expect(mod.getNavState().currentIndex).toBe(0);
      expect(setViewStateMock).toHaveBeenCalled();
    });

    it('should return null when no issues', async () => {
      const mod = await freshModule();
      mod.setIssueContext('sk1', [makeNode('1', { surveyX: 1, surveyY: 2, tl: '1.5' })], []);
      const issue = mod.goToPrevIssue();
      expect(issue).toBeNull();
    });
  });

  describe('listener error handling', () => {
    it('should not throw when listener throws', async () => {
      const mod = await freshModule();
      const badListener = vi.fn(() => { throw new Error('boom'); });
      const goodListener = vi.fn();
      mod.onNavStateChange(badListener);
      mod.onNavStateChange(goodListener);

      // Should not throw
      expect(() => mod.setIssueContext('sk1', [makeNode('1')], [])).not.toThrow();
      // Both should be called
      expect(badListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('window.__issueNav exposure', () => {
    it('should expose all functions on window', async () => {
      const mod = await freshModule();
      const issueNav = (window as any).__issueNav;
      expect(issueNav).toBeDefined();
      expect(typeof issueNav.setIssueContext).toBe('function');
      expect(typeof issueNav.refreshIssues).toBe('function');
      expect(typeof issueNav.nextIssue).toBe('function');
      expect(typeof issueNav.prevIssue).toBe('function');
      expect(typeof issueNav.getNavState).toBe('function');
      expect(typeof issueNav.navigateToCurrentIssue).toBe('function');
      expect(typeof issueNav.goToNextIssue).toBe('function');
      expect(typeof issueNav.goToPrevIssue).toBe('function');
      expect(typeof issueNav.clearNavState).toBe('function');
      expect(typeof issueNav.onNavStateChange).toBe('function');
    });
  });
});
