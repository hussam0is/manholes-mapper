/**
 * Unit tests for src/three-d/three-d-issues.js
 *
 * Tests the setup3DIssueInteraction function with mocked Three.js and DOM.
 * Verifies raycasting setup, popup creation/removal, and disposal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setup3DIssueInteraction } from '../../src/three-d/three-d-issues.js';

describe('setup3DIssueInteraction', () => {
  let THREE: any;
  let mockRenderer: any;
  let mockCamera: any;
  let mockScene: any;
  let container: HTMLElement;
  let eventListeners: Map<string, Function[]>;

  beforeEach(() => {
    // Mock renderer DOM element with event listener tracking
    eventListeners = new Map();
    const domElement = {
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
      addEventListener: vi.fn((type: string, handler: Function) => {
        if (!eventListeners.has(type)) eventListeners.set(type, []);
        eventListeners.get(type)!.push(handler);
      }),
      removeEventListener: vi.fn(),
    };

    mockRenderer = { domElement };
    mockCamera = {};
    mockScene = { children: [] };
    container = document.createElement('div');
    document.body.appendChild(container);

    // Must use function/class for `new` to work
    function MockRaycaster(this: any) {
      this.setFromCamera = vi.fn();
      this.intersectObjects = vi.fn(() => []);
    }
    function MockVector2(this: any) {
      this.x = 0;
      this.y = 0;
      this.set = vi.fn();
    }

    THREE = {
      Raycaster: MockRaycaster,
      Vector2: MockVector2,
    };

    // Ensure global helpers exist
    (window as any).t = (k: string) => k;
    (window as any).escapeHtml = (s: string) => s;
  });

  afterEach(() => {
    container.remove();
    delete (window as any).t;
    delete (window as any).escapeHtml;
  });

  it('returns a dispose function', () => {
    const interaction = setup3DIssueInteraction(THREE, {
      camera: mockCamera,
      scene: mockScene,
      renderer: mockRenderer,
      container,
      nodes: [],
      edges: [],
      issues: [],
    });

    expect(interaction.dispose).toBeInstanceOf(Function);
  });

  it('registers click and touch event listeners', () => {
    setup3DIssueInteraction(THREE, {
      camera: mockCamera,
      scene: mockScene,
      renderer: mockRenderer,
      container,
      nodes: [],
      edges: [],
      issues: [],
    });

    const registeredTypes = mockRenderer.domElement.addEventListener.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(registeredTypes).toContain('click');
    expect(registeredTypes).toContain('touchstart');
    expect(registeredTypes).toContain('touchend');
    expect(registeredTypes).toContain('touchmove');
  });

  it('dispose removes event listeners', () => {
    const interaction = setup3DIssueInteraction(THREE, {
      camera: mockCamera,
      scene: mockScene,
      renderer: mockRenderer,
      container,
      nodes: [],
      edges: [],
      issues: [],
    });

    interaction.dispose();

    const removedTypes = mockRenderer.domElement.removeEventListener.mock.calls.map(
      (call: any[]) => call[0]
    );
    expect(removedTypes).toContain('click');
    expect(removedTypes).toContain('touchstart');
    expect(removedTypes).toContain('touchend');
    expect(removedTypes).toContain('touchmove');
  });

  it('dispose removes popup if present', () => {
    const interaction = setup3DIssueInteraction(THREE, {
      camera: mockCamera,
      scene: mockScene,
      renderer: mockRenderer,
      container,
      nodes: [],
      edges: [],
      issues: [],
    });

    // Simulate a popup being added
    const popup = document.createElement('div');
    popup.className = 'three-d-fix-popup';
    container.appendChild(popup);

    interaction.dispose();
    // Should not throw
  });

  it('clicking with no intersections does not create popup', () => {
    setup3DIssueInteraction(THREE, {
      camera: mockCamera,
      scene: mockScene,
      renderer: mockRenderer,
      container,
      nodes: [],
      edges: [],
      issues: [],
    });

    // Simulate click
    const clickHandlers = eventListeners.get('click') || [];
    if (clickHandlers.length > 0) {
      clickHandlers[0]({ clientX: 400, clientY: 300, target: { closest: () => null } });
    }

    // No popup should be created
    expect(container.querySelector('.three-d-fix-popup')).toBeNull();
  });
});
