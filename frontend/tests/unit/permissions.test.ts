/**
 * Unit tests for auth permissions module
 *
 * Tests role checking, feature access, permission caching,
 * and listener notification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the auth-guard module before importing permissions
vi.mock('../../src/auth/auth-guard.js', () => ({
  getToken: vi.fn(),
  getUserId: vi.fn(),
  getAuthState: vi.fn(),
}));

// Mock global fetch
global.fetch = vi.fn();

import {
  isSuperAdmin,
  isAdmin,
  canAccessFeature,
  getFeatures,
  getUserRole,
  clearPermissions,
  fetchUserRole,
  onPermissionChange,
  FEATURE_KEYS,
} from '../../src/auth/permissions.js';

import * as authGuard from '../../src/auth/auth-guard.js';

describe('Permissions Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPermissions(); // Reset cached state
  });

  describe('FEATURE_KEYS', () => {
    it('should contain expected feature keys', () => {
      expect(FEATURE_KEYS).toContain('export_csv');
      expect(FEATURE_KEYS).toContain('export_sketch');
      expect(FEATURE_KEYS).toContain('admin_settings');
      expect(FEATURE_KEYS).toContain('finish_workday');
      expect(FEATURE_KEYS).toContain('node_types');
      expect(FEATURE_KEYS).toContain('edge_types');
    });

    it('should have exactly 6 feature keys', () => {
      expect(FEATURE_KEYS).toHaveLength(6);
    });
  });

  describe('isSuperAdmin()', () => {
    it('should return false when cache is empty', () => {
      expect(isSuperAdmin()).toBe(false);
    });
  });

  describe('isAdmin()', () => {
    it('should return false when cache is empty', () => {
      expect(isAdmin()).toBe(false);
    });
  });

  describe('getUserRole()', () => {
    it('should return null when cache is empty', () => {
      expect(getUserRole()).toBeNull();
    });
  });

  describe('getFeatures()', () => {
    it('should return empty object when cache is empty', () => {
      expect(getFeatures()).toEqual({});
    });
  });

  describe('canAccessFeature()', () => {
    it('should default to true when features not loaded', () => {
      expect(canAccessFeature('export_csv')).toBe(true);
      expect(canAccessFeature('admin_settings')).toBe(true);
    });
  });

  describe('fetchUserRole()', () => {
    it('should return null when not signed in', async () => {
      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: false, isLoaded: true });

      const result = await fetchUserRole();
      expect(result).toBeNull();
    });

    it('should return null when token is unavailable', async () => {
      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
      (authGuard.getToken as any).mockResolvedValue(null);

      const result = await fetchUserRole();
      expect(result).toBeNull();
    });

    it('should fetch and cache user role data', async () => {
      const mockRoleData = {
        role: 'admin',
        isAdmin: true,
        isSuperAdmin: false,
        features: { export_csv: true, admin_settings: false },
      };

      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
      (authGuard.getToken as any).mockResolvedValue('mock-token');
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockRoleData,
      });

      const result = await fetchUserRole();

      expect(result).toEqual(mockRoleData);
      expect(getUserRole()).toEqual(mockRoleData);
      expect(isAdmin()).toBe(true);
      expect(isSuperAdmin()).toBe(false);
    });

    it('should return cached data on subsequent calls', async () => {
      const mockRoleData = { role: 'user', isAdmin: false, isSuperAdmin: false, features: {} };

      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
      (authGuard.getToken as any).mockResolvedValue('mock-token');
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockRoleData,
      });

      await fetchUserRole();
      await fetchUserRole();

      // fetch should only be called once due to caching
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should force refresh when requested', async () => {
      const mockRoleData = { role: 'user', isAdmin: false, isSuperAdmin: false, features: {} };

      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
      (authGuard.getToken as any).mockResolvedValue('mock-token');
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockRoleData,
      });

      await fetchUserRole();
      await fetchUserRole(true); // force refresh

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should return null on API error', async () => {
      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
      (authGuard.getToken as any).mockResolvedValue('mock-token');
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await fetchUserRole(true);
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
      (authGuard.getToken as any).mockResolvedValue('mock-token');
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await fetchUserRole(true);
      expect(result).toBeNull();
    });
  });

  describe('canAccessFeature() with cached data', () => {
    beforeEach(async () => {
      const mockRoleData = {
        role: 'user',
        isAdmin: false,
        isSuperAdmin: false,
        features: {
          export_csv: true,
          admin_settings: false,
          export_sketch: true,
        },
      };

      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
      (authGuard.getToken as any).mockResolvedValue('mock-token');
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockRoleData,
      });

      await fetchUserRole(true);
    });

    it('should return true for enabled features', () => {
      expect(canAccessFeature('export_csv')).toBe(true);
      expect(canAccessFeature('export_sketch')).toBe(true);
    });

    it('should return false for explicitly disabled features', () => {
      expect(canAccessFeature('admin_settings')).toBe(false);
    });

    it('should return true for features not in the list (default enabled)', () => {
      expect(canAccessFeature('finish_workday')).toBe(true);
    });
  });

  describe('clearPermissions()', () => {
    it('should clear all cached data', async () => {
      const mockRoleData = { role: 'admin', isAdmin: true, isSuperAdmin: false, features: {} };

      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
      (authGuard.getToken as any).mockResolvedValue('mock-token');
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockRoleData,
      });

      await fetchUserRole(true);
      expect(isAdmin()).toBe(true);

      clearPermissions();

      expect(getUserRole()).toBeNull();
      expect(isAdmin()).toBe(false);
      expect(isSuperAdmin()).toBe(false);
    });
  });

  describe('onPermissionChange()', () => {
    it('should notify listeners when permissions are fetched', async () => {
      const callback = vi.fn();
      const unsubscribe = onPermissionChange(callback);

      const mockRoleData = { role: 'user', isAdmin: false, isSuperAdmin: false, features: {} };

      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
      (authGuard.getToken as any).mockResolvedValue('mock-token');
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockRoleData,
      });

      await fetchUserRole(true);

      // Called once for existing cache (null), then once on fetch
      expect(callback).toHaveBeenCalledWith(mockRoleData);

      unsubscribe();
    });

    it('should not notify after unsubscribe', async () => {
      const callback = vi.fn();
      const unsubscribe = onPermissionChange(callback);
      unsubscribe();

      // Clear to avoid the initial callback in onPermissionChange
      callback.mockClear();

      const mockRoleData = { role: 'user', isAdmin: false, isSuperAdmin: false, features: {} };

      (authGuard.getAuthState as any).mockReturnValue({ isSignedIn: true, isLoaded: true });
      (authGuard.getToken as any).mockResolvedValue('mock-token');
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockRoleData,
      });

      await fetchUserRole(true);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify listeners when permissions are cleared', () => {
      const callback = vi.fn();
      onPermissionChange(callback);
      callback.mockClear();

      clearPermissions();

      expect(callback).toHaveBeenCalledWith(null);
    });
  });
});
