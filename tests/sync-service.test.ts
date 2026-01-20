import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  syncFromCloud, 
  syncSketchToCloud, 
  debouncedSyncToCloud,
  processSyncQueue,
  getSyncState
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
    nodes: [],
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
      const newSketch = { name: 'New Local Sketch', nodes: [], edges: [] };
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
      const existingSketch = { id: uuid, name: 'Existing Sketch' };
      
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
      const sketch = { id: 's1', name: 'Offline Edit' };
      
      await syncSketchToCloud(sketch);

      expect(db.enqueueSyncOperation).toHaveBeenCalledWith(expect.objectContaining({
        type: 'UPDATE',
        sketchId: 's1'
      }));
      expect(getSyncState().pendingChanges).toBe(1);
    });
  });

  describe('debouncedSyncToCloud', () => {
    it('should debounce calls', async () => {
      vi.useFakeTimers();
      const uuid = '12345678-1234-1234-1234-123456789012';
      const sketch = { id: uuid, name: 'Rapid Edit' };
      
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
        { type: 'UPDATE', data: { id: uuid1, name: 'Queued Update' } },
        { type: 'DELETE', sketchId: uuid2 }
      ];
      (db.drainSyncQueue as any).mockResolvedValue(queuedOps);
      
      await processSyncQueue();

      expect(global.fetch).toHaveBeenCalledWith(`/api/sketches/${uuid1}`, expect.objectContaining({ method: 'PUT' }));
      expect(global.fetch).toHaveBeenCalledWith(`/api/sketches/${uuid2}`, expect.objectContaining({ method: 'DELETE' }));
      expect(db.drainSyncQueue).toHaveBeenCalled();
    });

    it('should re-queue failed operations', async () => {
      const uuid1 = '12345678-1234-1234-1234-123456789011';
      const queuedOps = [{ type: 'UPDATE', data: { id: uuid1, name: 'Failed' } }];
      (db.drainSyncQueue as any).mockResolvedValue(queuedOps);
      (global.fetch as any).mockRejectedValue(new Error('API Down'));

      await processSyncQueue();

      expect(db.enqueueSyncOperation).toHaveBeenCalledWith(queuedOps[0]);
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
      const localOnlySketch = { name: 'Local Only', nodes: [] }; // No UUID ID
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
});
