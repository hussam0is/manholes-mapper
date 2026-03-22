/**
 * Unit tests for GNSS State Management
 *
 * Tests the GNSSStateManager class including connection state,
 * position updates, point capture, and event listeners.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GNSSStateManager, ConnectionState, ConnectionType } from '../../src/gnss/gnss-state.js';

describe('ConnectionState constants', () => {
  it('should define all connection states', () => {
    expect(ConnectionState.DISCONNECTED).toBe('disconnected');
    expect(ConnectionState.CONNECTING).toBe('connecting');
    expect(ConnectionState.CONNECTED).toBe('connected');
    expect(ConnectionState.ERROR).toBe('error');
  });
});

describe('ConnectionType constants', () => {
  it('should define all connection types', () => {
    expect(ConnectionType.BLUETOOTH).toBe('bluetooth');
    expect(ConnectionType.WIFI).toBe('wifi');
    expect(ConnectionType.MOCK).toBe('mock');
  });
});

describe('GNSSStateManager', () => {
  let state: GNSSStateManager;

  beforeEach(() => {
    state = new GNSSStateManager();
  });

  describe('initial state', () => {
    it('should start disconnected', () => {
      expect(state.connectionState).toBe(ConnectionState.DISCONNECTED);
    });

    it('should have null connection type', () => {
      expect(state.connectionType).toBeNull();
    });

    it('should have invalid position', () => {
      expect(state.position.isValid).toBe(false);
      expect(state.position.lat).toBeNull();
      expect(state.position.lon).toBeNull();
      expect(state.position.alt).toBeNull();
    });

    it('should have no captured points', () => {
      expect(state.capturedPoints).toEqual([]);
      expect(state.lastCapturedNodeId).toBeNull();
    });

    it('should have live measure disabled', () => {
      expect(state.liveMeasureEnabled).toBe(false);
    });
  });

  describe('reset()', () => {
    it('should reset all state to defaults', () => {
      state.setConnectionState(ConnectionState.CONNECTED, {
        type: ConnectionType.BLUETOOTH,
        deviceName: 'GPS Device',
      });
      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });
      state.setLiveMeasureEnabled(true);

      state.reset();

      expect(state.connectionState).toBe(ConnectionState.DISCONNECTED);
      expect(state.connectionType).toBeNull();
      expect(state.deviceName).toBeNull();
      expect(state.position.isValid).toBe(false);
      expect(state.liveMeasureEnabled).toBe(false);
      expect(state.capturedPoints).toEqual([]);
    });
  });

  describe('setConnectionState()', () => {
    it('should update connection state', () => {
      state.setConnectionState(ConnectionState.CONNECTING);
      expect(state.connectionState).toBe(ConnectionState.CONNECTING);
    });

    it('should set device name and address', () => {
      state.setConnectionState(ConnectionState.CONNECTED, {
        deviceName: 'Trimble R2',
        deviceAddress: '00:11:22:33:44:55',
        type: ConnectionType.BLUETOOTH,
      });

      expect(state.deviceName).toBe('Trimble R2');
      expect(state.deviceAddress).toBe('00:11:22:33:44:55');
      expect(state.connectionType).toBe(ConnectionType.BLUETOOTH);
    });

    it('should set error on error state', () => {
      state.setConnectionState(ConnectionState.ERROR, {
        error: 'Connection timeout',
      });

      expect(state.connectionState).toBe(ConnectionState.ERROR);
      expect(state.connectionError).toBe('Connection timeout');
    });

    it('should clear device info on disconnect', () => {
      state.setConnectionState(ConnectionState.CONNECTED, {
        deviceName: 'Device',
        deviceAddress: 'AA:BB',
        type: ConnectionType.WIFI,
      });

      state.setConnectionState(ConnectionState.DISCONNECTED);

      expect(state.connectionType).toBeNull();
      expect(state.deviceName).toBeNull();
      expect(state.deviceAddress).toBeNull();
      expect(state.position.isValid).toBe(false);
    });

    it('should notify connection listeners', () => {
      const callback = vi.fn();
      state.on('connection', callback);

      state.setConnectionState(ConnectionState.CONNECTED, {
        type: ConnectionType.MOCK,
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          state: ConnectionState.CONNECTED,
          type: ConnectionType.MOCK,
          isConnected: true,
        })
      );
    });
  });

  describe('updatePosition()', () => {
    it('should update position data', () => {
      state.updatePosition({
        lat: 32.0853,
        lon: 34.7818,
        alt: 15.5,
        fixQuality: 4,
        satellites: 12,
        isValid: true,
      });

      expect(state.position.lat).toBe(32.0853);
      expect(state.position.lon).toBe(34.7818);
      expect(state.position.alt).toBe(15.5);
      expect(state.position.fixQuality).toBe(4);
      expect(state.position.satellites).toBe(12);
      expect(state.position.isValid).toBe(true);
    });

    it('should notify position listeners', () => {
      const callback = vi.fn();
      state.on('position', callback);

      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ lat: 32.0, lon: 34.0 })
      );
    });
  });

  describe('isStale()', () => {
    it('should return true when no timestamp', () => {
      expect(state.isStale()).toBe(true);
    });

    it('should return false for recent timestamp', () => {
      state.updatePosition({ timestamp: Date.now(), isValid: true });
      expect(state.isStale()).toBe(false);
    });

    it('should return true for old timestamp', () => {
      state.updatePosition({ timestamp: Date.now() - 5000, isValid: true });
      expect(state.isStale()).toBe(true);
    });
  });

  describe('capturePoint()', () => {
    it('should return null if position is invalid', () => {
      const result = state.capturePoint('node1');
      expect(result).toBeNull();
    });

    it('should capture point when position is valid', () => {
      state.updatePosition({
        lat: 32.0853,
        lon: 34.7818,
        alt: 15.5,
        fixQuality: 4,
        fixLabel: 'RTK Fixed',
        hdop: 0.8,
        satellites: 14,
        isValid: true,
      });

      const result = state.capturePoint('node1');

      expect(result).not.toBeNull();
      expect(result!.nodeId).toBe('node1');
      expect(result!.lat).toBe(32.0853);
      expect(result!.lon).toBe(34.7818);
      expect(result!.alt).toBe(15.5);
      expect(result!.fixQuality).toBe(4);
      expect(result!.capturedAt).toBeDefined();
    });

    it('should convert numeric nodeId to string', () => {
      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });
      const result = state.capturePoint(42);
      expect(result!.nodeId).toBe('42');
    });

    it('should add captured point to list', () => {
      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });

      state.capturePoint('node1');
      state.capturePoint('node2');

      expect(state.capturedPoints).toHaveLength(2);
      expect(state.lastCapturedNodeId).toBe('node2');
    });

    it('should merge additional options', () => {
      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });

      const result = state.capturePoint('node1', { customField: 'test' });
      expect(result!.customField).toBe('test');
    });

    it('should notify capture listeners', () => {
      const callback = vi.fn();
      state.on('capture', callback);
      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });

      state.capturePoint('node1');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ nodeId: 'node1' })
      );
    });
  });

  describe('getCapturedPoint()', () => {
    it('should return null for non-existent node', () => {
      expect(state.getCapturedPoint('nonexistent')).toBeNull();
    });

    it('should return captured point for node', () => {
      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });
      state.capturePoint('node1');

      const result = state.getCapturedPoint('node1');
      expect(result).not.toBeNull();
      expect(result!.nodeId).toBe('node1');
    });

    it('should return most recent capture for a node', () => {
      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });
      state.capturePoint('node1');

      state.updatePosition({ lat: 33.0, lon: 35.0, isValid: true });
      state.capturePoint('node1');

      const result = state.getCapturedPoint('node1');
      expect(result!.lat).toBe(33.0);
    });

    it('should accept numeric or string node IDs', () => {
      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });
      state.capturePoint(5);

      expect(state.getCapturedPoint(5)).not.toBeNull();
      expect(state.getCapturedPoint('5')).not.toBeNull();
    });
  });

  describe('getAllCapturedPoints()', () => {
    it('should return a copy of captured points', () => {
      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });
      state.capturePoint('node1');

      const points = state.getAllCapturedPoints();
      expect(points).toHaveLength(1);

      // Modifying the returned array should not affect internal state
      points.push({ nodeId: 'fake' } as any);
      expect(state.capturedPoints).toHaveLength(1);
    });
  });

  describe('clearCapturedPoints()', () => {
    it('should remove all captured points', () => {
      state.updatePosition({ lat: 32.0, lon: 34.0, isValid: true });
      state.capturePoint('node1');
      state.capturePoint('node2');

      state.clearCapturedPoints();

      expect(state.capturedPoints).toHaveLength(0);
      expect(state.lastCapturedNodeId).toBeNull();
    });
  });

  describe('setLiveMeasureEnabled()', () => {
    it('should enable live measure mode', () => {
      state.setLiveMeasureEnabled(true);
      expect(state.liveMeasureEnabled).toBe(true);
      expect(state.isLiveMeasureEnabled()).toBe(true);
    });

    it('should invalidate position when disabled', () => {
      state.updatePosition({ isValid: true });
      state.setLiveMeasureEnabled(false);
      expect(state.position.isValid).toBe(false);
    });
  });

  describe('getConnectionInfo()', () => {
    it('should return connection summary', () => {
      state.setConnectionState(ConnectionState.CONNECTED, {
        type: ConnectionType.BLUETOOTH,
        deviceName: 'GPS',
        deviceAddress: 'AA:BB',
      });

      const info = state.getConnectionInfo();
      expect(info.state).toBe(ConnectionState.CONNECTED);
      expect(info.type).toBe(ConnectionType.BLUETOOTH);
      expect(info.deviceName).toBe('GPS');
      expect(info.isConnected).toBe(true);
    });

    it('should report not connected when disconnected', () => {
      const info = state.getConnectionInfo();
      expect(info.isConnected).toBe(false);
    });
  });

  describe('getPosition()', () => {
    it('should include isStale flag', () => {
      const pos = state.getPosition();
      expect(pos.isStale).toBe(true);
    });
  });

  describe('getStatus()', () => {
    it('should return full status summary', () => {
      const status = state.getStatus();
      expect(status.liveMeasureEnabled).toBe(false);
      expect(status.connection).toBeDefined();
      expect(status.position).toBeDefined();
      expect(status.capturedCount).toBe(0);
      expect(status.lastCapturedNodeId).toBeNull();
    });
  });

  describe('event listeners', () => {
    it('should add and remove listeners', () => {
      const callback = vi.fn();
      state.on('connection', callback);
      state.setConnectionState(ConnectionState.CONNECTING);
      expect(callback).toHaveBeenCalledTimes(1);

      state.off('connection', callback);
      state.setConnectionState(ConnectionState.CONNECTED);
      expect(callback).toHaveBeenCalledTimes(1); // not called again
    });

    it('should handle listener errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodCallback = vi.fn();

      state.on('connection', errorCallback);
      state.on('connection', goodCallback);

      // Should not throw
      state.setConnectionState(ConnectionState.CONNECTING);

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(goodCallback).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when removing non-existent listener', () => {
      const callback = vi.fn();
      state.off('connection', callback); // should not throw
    });

    it('should ignore events for non-existent event types', () => {
      const callback = vi.fn();
      state.on('invalid_event' as any, callback);
      // Should not throw
      state.notifyListeners('invalid_event' as any, {});
    });
  });
});
