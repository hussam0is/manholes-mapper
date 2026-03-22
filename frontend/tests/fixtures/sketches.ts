/**
 * Test fixtures for sketch data
 * 
 * Provides reusable test data for unit, integration, and E2E tests.
 */

interface SketchNode {
  id: string;
  x: number | string;
  y: number | string;
  type?: string;
  note?: string;
  [key: string]: unknown;
}

interface SketchEdge {
  id: string;
  tail: string | null;
  head: string | null;
  type?: string;
  [key: string]: unknown;
}

interface Sketch {
  name: string;
  creationDate?: string;
  nodes: SketchNode[];
  edges: SketchEdge[];
  adminConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

// Valid sketch with full data
export const validSketch: Sketch = {
  name: 'Test Sketch',
  creationDate: new Date().toISOString(),
  nodes: [
    { id: 'n1', x: 100, y: 200, type: 'manhole' },
    { id: 'n2', x: 300, y: 400, type: 'manhole' },
  ],
  edges: [
    { id: 'e1', tail: 'n1', head: 'n2' },
  ],
  adminConfig: { theme: 'light' },
};

// Minimal valid sketch
export const minimalSketch: Sketch = {
  name: 'Minimal Sketch',
  nodes: [],
  edges: [],
};

// Sketch with dangling edges (valid - represents incomplete connections)
export const danglingEdgeSketch: Sketch = {
  name: 'Dangling Edge Sketch',
  nodes: [{ id: 'n1', x: 100, y: 200, type: 'manhole' }],
  edges: [
    { id: 'e1', tail: 'n1', head: null }, // Outbound dangling
    { id: 'e2', tail: null, head: 'n1' }, // Inbound dangling
  ],
};

// Invalid sketch - node with non-numeric coordinates
export const invalidNodeSketch: Sketch = {
  name: 'Invalid Node Sketch',
  nodes: [
    { id: 'n1', x: 'invalid', y: 200 }, // x is string
  ],
  edges: [],
};

// Generate oversized sketch for limit testing
export const oversizedSketch = (nodeCount: number) => {
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ id: `n${i}`, x: i, y: i, type: 'manhole' });
  }
  return {
    name: 'Oversized Sketch',
    nodes,
    edges: [],
  };
};

// Sketch with complex node types
export const complexSketch: Sketch = {
  name: 'Complex Sketch',
  creationDate: new Date().toISOString(),
  nodes: [
    { id: 'n1', x: 0, y: 0, type: 'manhole', note: 'Entry point' },
    { id: 'n2', x: 100, y: 0, type: 'home', note: 'Connection point' },
    { id: 'n3', x: 200, y: 0, type: 'drainage', note: 'Drain' },
    { id: 'n4', x: 100, y: 100, type: 'manhole' },
  ],
  edges: [
    { id: 'e1', tail: 'n1', head: 'n2', type: 'pipe' },
    { id: 'e2', tail: 'n2', head: 'n3', type: 'pipe' },
    { id: 'e3', tail: 'n2', head: 'n4', type: 'pipe' },
  ],
  adminConfig: {
    theme: 'dark',
    nodeTypes: ['manhole', 'home', 'drainage'],
    edgeTypes: ['pipe', 'cable'],
  },
};

// Mock user data for tests
export const mockUser = {
  id: 'test-user-id-12345',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
};

export const mockAdminUser = {
  id: 'admin-user-id-67890',
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'admin',
};

export const mockSuperAdminUser = {
  id: 'super-admin-id-99999',
  email: 'superadmin@example.com',
  name: 'Super Admin',
  role: 'super_admin',
};

// Mock organization data
export const mockOrganization = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Organization',
  createdAt: new Date().toISOString(),
};

// Mock project data
export const mockProject = {
  id: '7f33d02b-871c-4394-884b-017e88c79219',
  name: 'Test Project',
  organizationId: '550e8400-e29b-41d4-a716-446655440000',
  createdAt: new Date().toISOString(),
};

// Helper to create mock response object for API tests
export const createMockResponse = () => {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res;
};

// Import vi for mocking (will be available in test context)
import { vi } from 'vitest';
