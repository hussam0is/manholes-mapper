import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  syncFromCloud, 
  syncSketchToCloud, 
  debouncedSyncToCloud,
  processSyncQueue,
  getSyncState,
  deduplicateSketches,
  cleanupDuplicateSketches
} from '../src/auth/sync-service.js';
import * as db from '../src/db.js';
import * as authGuard from '../src/auth/auth-guard.js';

// Mock dependencies
vi.mock('../src/db.js', () => ({
  openDb: vi.fn(),
  saveSketch: vi.fn(),
  getAllSketches: vi.fn(),
  deleteSketch: vi.fn(),
  saveCurrentSketch: vi.fn(),
  enqueueSyncOperation: vi.fn(),
  drainSyncQueue: vi.fn(),
  removeSyncQueueItem: vi.fn(),
}));

vi.mock('../src/auth/auth-guard.js', () => ({
  getToken: vi.fn(),
  getUserId: vi.fn(),
  getAuthState: vi.fn(),
}));

// Mock global fetch
global.fetch = vi.fn();


// Mock navigator.onLine
const mockOnLine = (value: boolean) => {
  Object.defineProperty(navigator, 'onLine', {
    value,
    configurable: true,
  });
};

describe('Sync Service Unit Tests', () => {
  const mockToken = 'mock-token';
  const mockUserId = 'user-123';
  const mockSketch = {
    id: 'sketch-123',
    name: 'Test Sketch',
    nodes: [{ id: 1, x: 100, y: 100 }],
    edges: [],
    cloudSynced: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnLine(true);
    (authGuard.getToken as any).mockResolvedValue(mockToken);
    (authGuard.getUserId as any).mockReturnValue(mockUserId);
    (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
    
    // Reset fetch mock to return a successful JSON response by default
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ sketches: [] }),
    });

    // removeSyncQueueItem should resolve successfully by default
    (db.removeSyncQueueItem as any).mockResolvedValue(undefined);
  });

  describe('syncFromCloud', () => {
    it('should fetch sketches and save to IndexedDB', async () => {
      const cloudSketches = [{ id: 'cloud-1', name: 'Cloud Sketch' }];
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ sketches: cloudSketches }),
      });
      (db.getAllSketches as any).mockResolvedValue([]);

      await syncFromCloud();

      expect(global.fetch).toHaveBeenCalledWith('/api/sketches', expect.any(Object));
      expect(db.saveSketch).toHaveBeenCalledWith(cloudSketches[0]);
    });

    it('should remove local sketches that were deleted in cloud', async () => {
      const cloudSketches: any[] = [];
      const localSketches = [{ id: 'old-1', cloudSynced: true }];
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ sketches: cloudSketches }),
      });
      (db.getAllSketches as any).mockResolvedValue(localSketches);

      await syncFromCloud();

      expect(db.deleteSketch).toHaveBeenCalledWith('old-1');
    });

    it('should not sync if offline', async () => {
      mockOnLine(false);
      await syncFromCloud();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('syncSketchToCloud', () => {
    it('should POST new sketch without UUID', async () => {
      const newSketch = { name: 'New Local Sketch', nodes: [{ id: 1, x: 0, y: 0 }], edges: [] };
      const createdSketch = { id: 'new-uuid', ...newSketch };
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ sketch: createdSketch }),
      });

      await syncSketchToCloud(newSketch);

      expect(global.fetch).toHaveBeenCalledWith('/api/sketches', expect.objectContaining({
        method: 'POST',
      }));
      expect(db.saveSketch).toHaveBeenCalledWith(expect.objectContaining({
        id: 'new-uuid',
        cloudSynced: true
      }));
    });

    it('should PUT existing sketch with UUID', async () => {
      const uuid = '12345678-1234-1234-1234-123456789012';
      const existingSketch = { id: uuid, name: 'Existing Sketch', nodes: [{ id: 1, x: 0, y: 0 }], edges: [] };
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ sketch: existingSketch }),
      });

      await syncSketchToCloud(existingSketch);

      expect(global.fetch).toHaveBeenCalledWith(`/api/sketches/${uuid}`, expect.objectContaining({
        method: 'PUT',
      }));
    });

    it('should queue update if offline', async () => {
      mockOnLine(false);
      const uuid = '12345678-1234-1234-1234-123456789099';
      const sketch = { id: uuid, name: 'Offline Edit', nodes: [{ id: 1, x: 0, y: 0 }], edges: [] };

      await syncSketchToCloud(sketch);

      expect(db.enqueueSyncOperation).toHaveBeenCalledWith(expect.objectContaining({
        type: 'UPDATE',
        sketchId: uuid
      }));
      expect(getSyncState().pendingChanges).toBe(1);
    });

    it('should skip sync for legacy non-UUID sketch IDs', async () => {
      const sketch = { id: 'sk_abc123', name: 'Legacy Sketch', nodes: [{ id: 1, x: 0, y: 0 }], edges: [] };

      await syncSketchToCloud(sketch);

      // Should NOT call fetch or enqueue — silently skipped
      expect(global.fetch).not.toHaveBeenCalled();
      expect(db.enqueueSyncOperation).not.toHaveBeenCalled();
    });

    it('should skip sync for legacy IDs even when offline', async () => {
      mockOnLine(false);
      const sketch = { id: 'sk_abc123', name: 'Legacy Offline', nodes: [{ id: 1, x: 0, y: 0 }], edges: [] };

      await syncSketchToCloud(sketch);

      // Should NOT enqueue legacy IDs
      expect(db.enqueueSyncOperation).not.toHaveBeenCalled();
    });
  });

  describe('debouncedSyncToCloud', () => {
    it('should debounce calls', async () => {
      vi.useFakeTimers();
      const uuid = '12345678-1234-1234-1234-123456789012';
      const sketch = { id: uuid, name: 'Rapid Edit', nodes: [{ id: 1, x: 0, y: 0 }], edges: [] };
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ sketch }),
      });

      debouncedSyncToCloud(sketch);
      debouncedSyncToCloud(sketch);
      debouncedSyncToCloud(sketch);

      expect(global.fetch).not.toHaveBeenCalled();
      
      vi.runAllTimers();
      
      // Wait for async operations after timers
      await Promise.resolve(); 
      
      expect(global.fetch).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('Offline Queue & processSyncQueue', () => {
    it('should process queued operations when online', async () => {
      const uuid1 = '12345678-1234-1234-1234-123456789011';
      const uuid2 = '12345678-1234-1234-1234-123456789012';
      const queuedOps = [
        { type: 'UPDATE', data: { id: uuid1, name: 'Queued Update' }, _queueKey: 1 },
        { type: 'DELETE', sketchId: uuid2, _queueKey: 2 }
      ];
      (db.drainSyncQueue as any).mockResolvedValue(queuedOps);

      await processSyncQueue();

      expect(global.fetch).toHaveBeenCalledWith(`/api/sketches/${uuid1}`, expect.objectContaining({ method: 'PUT' }));
      expect(global.fetch).toHaveBeenCalledWith(`/api/sketches/${uuid2}`, expect.objectContaining({ method: 'DELETE' }));
      expect(db.drainSyncQueue).toHaveBeenCalled();
      // Each successfully processed item should be removed individually
      expect(db.removeSyncQueueItem).toHaveBeenCalledWith(1);
      expect(db.removeSyncQueueItem).toHaveBeenCalledWith(2);
    });

    it('should leave failed operations in the queue for retry', async () => {
      const uuid1 = '12345678-1234-1234-1234-123456789011';
      const queuedOps = [{ type: 'UPDATE', data: { id: uuid1, name: 'Failed' }, _queueKey: 1 }];
      (db.drainSyncQueue as any).mockResolvedValue(queuedOps);
      (global.fetch as any).mockRejectedValue(new Error('API Down'));

      await processSyncQueue();

      // Failed ops should NOT be re-enqueued — they remain in the queue
      expect(db.enqueueSyncOperation).not.toHaveBeenCalled();
      // And should NOT be removed from the queue
      expect(db.removeSyncQueueItem).not.toHaveBeenCalledWith(1);
    });

    it('should filter out legacy IDs from queued operations and remove them from queue', async () => {
      const uuid1 = '12345678-1234-1234-1234-123456789011';
      const queuedOps = [
        { type: 'UPDATE', data: { id: 'sk_legacy', name: 'Legacy Queued' }, _queueKey: 1 },
        { type: 'DELETE', sketchId: 'sk_old', _queueKey: 2 },
        { type: 'UPDATE', data: { id: uuid1, name: 'Valid Queued' }, _queueKey: 3 },
      ];
      (db.drainSyncQueue as any).mockResolvedValue(queuedOps);

      await processSyncQueue();

      // Only the valid UUID operation should be processed via fetch
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(`/api/sketches/${uuid1}`, expect.objectContaining({ method: 'PUT' }));
      // Legacy items should be removed from the queue so they don't accumulate
      expect(db.removeSyncQueueItem).toHaveBeenCalledWith(1);
      expect(db.removeSyncQueueItem).toHaveBeenCalledWith(2);
      // Valid item should also be removed after successful processing
      expect(db.removeSyncQueueItem).toHaveBeenCalledWith(3);
    });
  });

  describe('Conflict Resolution scenarios', () => {
    it('syncFromCloud should prioritize cloud data (current implementation)', async () => {
      const cloudSketch = { id: 's1', name: 'Cloud Version', updatedAt: '2023-01-02T00:00:00Z' };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ sketches: [cloudSketch] }),
      });
      
      await syncFromCloud();

      // Current logic simply saves whatever comes from cloud to local IDB
      expect(db.saveSketch).toHaveBeenCalledWith(cloudSketch);
    });

    it('syncSketchToCloud should handle sketch created locally then synced', async () => {
      const localOnlySketch = { name: 'Local Only', nodes: [{ id: 1, x: 0, y: 0 }] }; // No UUID ID
      const cloudResponse = { id: 'new-uuid-from-cloud', name: 'Local Only' };
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ sketch: cloudResponse }),
      });

      await syncSketchToCloud(localOnlySketch);

      expect(db.saveSketch).toHaveBeenCalledWith(expect.objectContaining({
        id: 'new-uuid-from-cloud',
        cloudSynced: true
      }));
    });
  });

  describe('Sketch Deduplication', () => {
    it('should detect and remove duplicates with same content', () => {
      const uuid = '12345678-1234-1234-1234-123456789012';
      const sketches = [
        { id: uuid, name: 'Test', creationDate: '2023-01-01', nodes: [{ id: 1 }], edges: [], cloudSynced: true },
        { id: 'sk_abc123', name: 'Test', creationDate: '2023-01-01', nodes: [{ id: 1 }], edges: [], cloudSynced: false }
      ];
      
      const result = deduplicateSketches(sketches);
      
      expect(result.removedCount).toBe(1);
      expect(result.deduplicated.length).toBe(1);
      expect(result.deduplicated[0].id).toBe(uuid); // Cloud ID should be kept
      expect(result.removedIds).toContain('sk_abc123');
    });

    it('should keep all sketches if no duplicates', () => {
      const sketches = [
        { id: 'sk_1', name: 'Sketch 1', creationDate: '2023-01-01', nodes: [], edges: [] },
        { id: 'sk_2', name: 'Sketch 2', creationDate: '2023-01-02', nodes: [], edges: [] }
      ];
      
      const result = deduplicateSketches(sketches);
      
      expect(result.removedCount).toBe(0);
      expect(result.deduplicated.length).toBe(2);
    });

    it('should prefer cloud UUID over local sk_ ID', () => {
      const uuid = '12345678-1234-1234-1234-123456789012';
      const sketches = [
        { id: 'sk_local', name: 'Same', creationDate: '2023-01-01', nodes: [], edges: [], updatedAt: '2023-06-01' },
        { id: uuid, name: 'Same', creationDate: '2023-01-01', nodes: [], edges: [], updatedAt: '2023-05-01' }
      ];
      
      const result = deduplicateSketches(sketches);
      
      expect(result.deduplicated[0].id).toBe(uuid);
      expect(result.removedIds).toContain('sk_local');
    });

    it('should prefer newer sketch when both have same ID type', () => {
      const sketches = [
        { id: 'sk_old', name: 'Same', creationDate: '2023-01-01', nodes: [], edges: [], updatedAt: '2023-01-01' },
        { id: 'sk_new', name: 'Same', creationDate: '2023-01-01', nodes: [], edges: [], updatedAt: '2023-06-01' }
      ];
      
      const result = deduplicateSketches(sketches);
      
      expect(result.deduplicated[0].id).toBe('sk_new');
      expect(result.removedIds).toContain('sk_old');
    });

    it('should handle empty array', () => {
      const result = deduplicateSketches([]);
      expect(result.removedCount).toBe(0);
      expect(result.deduplicated).toEqual([]);
    });

    it('should handle multiple groups of duplicates', () => {
      const uuid1 = '12345678-1234-1234-1234-123456789011';
      const uuid2 = '12345678-1234-1234-1234-123456789022';
      const sketches = [
        // Group 1 - same fingerprint
        { id: uuid1, name: 'A', creationDate: '2023-01-01', nodes: [{ id: 1 }], edges: [] },
        { id: 'sk_a1', name: 'A', creationDate: '2023-01-01', nodes: [{ id: 1 }], edges: [] },
        { id: 'sk_a2', name: 'A', creationDate: '2023-01-01', nodes: [{ id: 1 }], edges: [] },
        // Group 2 - different fingerprint
        { id: uuid2, name: 'B', creationDate: '2023-02-01', nodes: [{ id: 2 }], edges: [] },
        { id: 'sk_b1', name: 'B', creationDate: '2023-02-01', nodes: [{ id: 2 }], edges: [] },
      ];
      
      const result = deduplicateSketches(sketches);
      
      expect(result.deduplicated.length).toBe(2);
      expect(result.removedCount).toBe(3);
      expect(result.deduplicated.map(s => s.id).sort()).toEqual([uuid1, uuid2].sort());
    });
  });
});
