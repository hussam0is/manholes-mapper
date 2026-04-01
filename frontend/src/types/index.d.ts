/**
 * Shared TypeScript type declarations for Manholes Mapper frontend.
 */

/** User role data returned from /api/auth/role */
export interface UserRoleData {
  userId: string;
  email?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  organizationId?: string;
  features: Record<string, boolean>;
}

/** Auth state emitted by authGuard */
export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId?: string;
  token?: string;
}

/** Auth guard interface exposed on window.authGuard */
export interface AuthGuard {
  onAuthStateChange: (callback: (state: AuthState) => void) => () => void;
  getToken: () => string | null;
  getAuthState: () => AuthState;
  signOut: () => void;
}

/** Permissions service interface exposed on window.permissionsService */
export interface PermissionsService {
  fetchUserRole: () => Promise<UserRoleData | null>;
  getUserRole: () => UserRoleData | null;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
  canAccessFeature: (featureKey: string) => boolean;
  getFeatures: () => Record<string, boolean>;
  clearPermissions: () => void;
  onPermissionChange: (callback: (role: UserRoleData | null) => void) => () => void;
  initPermissionsService: () => void;
}

/** Augment Window with app globals */
declare global {
  interface Window {
    authGuard?: AuthGuard;
    permissionsService?: PermissionsService;
  }
}
