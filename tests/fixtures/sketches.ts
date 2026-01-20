/**
 * Test fixtures for sketch data
 */

export const validSketch = {
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

export const minimalSketch = {
  name: 'Minimal Sketch',
  nodes: [],
  edges: [],
};

export const danglingEdgeSketch = {
  name: 'Dangling Edge Sketch',
  nodes: [{ id: 'n1', x: 100, y: 200, type: 'manhole' }],
  edges: [
    { id: 'e1', tail: 'n1', head: null }, // Outbound dangling
    { id: 'e2', tail: null, head: 'n1' }, // Inbound dangling
  ],
};

export const invalidNodeSketch = {
  name: 'Invalid Node Sketch',
  nodes: [
    { id: 'n1', x: 'invalid', y: 200 }, // x is string
  ],
  edges: [],
};

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
