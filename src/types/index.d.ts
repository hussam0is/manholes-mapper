/**
 * Manholes Mapper — Shared Type Definitions
 *
 * Central type definitions for the domain model. These types are available
 * globally via tsconfig's `include` and provide IDE auto-complete + error
 * checking even in plain .js files that use `// @ts-check` or JSDoc.
 */

// ─── Domain: Graph / Sketch ─────────────────────────────────────────────────

/** A manhole or junction node in the network graph. */
export interface GraphNode {
  id: string;
  x: number;
  y: number;
  surveyX?: number;
  surveyY?: number;
  type: string;
  label?: string;
  depth?: number;
  diameter?: number;
  material?: string;
  condition?: string;
  /** ISO 8601 timestamp */
  createdAt?: string;
  /** ISO 8601 timestamp */
  updatedAt?: string;
  /** Extra fields set by input-flow or field-commander */
  [key: string]: unknown;
}

/** A pipe or connection edge in the network graph. */
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  length?: number;
  type?: string;
  diameter?: number;
  material?: string;
  slope?: number;
  condition?: string;
  [key: string]: unknown;
}

/** Admin configuration for a sketch (field settings, display options). */
export interface AdminConfig {
  nodeTypes?: Array<{ id: string; label: string; icon?: string; color?: string }>;
  edgeTypes?: Array<{ id: string; label: string; color?: string }>;
  inputFlow?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A complete sketch (project drawing). */
export interface Sketch {
  id: string;
  name: string;
  creationDate?: string;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string;
  ownerId?: string;
  ownerUsername?: string;
  ownerEmail?: string;
  isOwner?: boolean;
  createdBy?: string;
  lastEditedBy?: string;
  cloudSynced?: boolean;
  metadataOnly?: boolean;
  version?: number;
  nodeCount?: number;
  edgeCount?: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  adminConfig?: AdminConfig;
}

// ─── Domain: Auth ───────────────────────────────────────────────────────────

/** A Better Auth user object. */
export interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  emailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** A Better Auth session object. */
export interface AuthSession {
  id: string;
  userId?: string;
  expiresAt?: string;
  token?: string;
}

/** The combined session data returned by Better Auth getSession(). */
export interface SessionData {
  session: AuthSession | null;
  user: AuthUser | null;
}

/** Response shape from Better Auth client methods. */
export interface AuthResponse<T = unknown> {
  data: T | null;
  error: AuthError | null;
}

/** Error shape returned by Better Auth. */
export interface AuthError {
  message: string;
  code?: string;
  status?: number;
}

/** Internal auth state tracked by auth-guard.js. */
export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  sessionId: string | null;
  user: AuthUser | null;
}

// ─── Domain: Permissions ────────────────────────────────────────────────────

/** User role data returned by GET /api/user-role. */
export interface UserRoleData {
  role?: string;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  features?: Record<string, boolean>;
}

// ─── Domain: Sync ───────────────────────────────────────────────────────────

/** Sync operation queued for offline replay. */
export interface SyncOperation {
  type: 'UPDATE' | 'DELETE';
  sketchId: string;
  data?: Sketch;
  timestamp: number;
  _queueKey?: string;
}

/** Sync state exposed via onSyncStateChange(). */
export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingChanges: number;
  error: string | null;
  errorStatusCode?: number | null;
  queueSize: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  successRate: number;
  consecutiveFailures: number;
}

/** Sync health metrics from getSyncHealth(). */
export interface SyncHealth {
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  lastFailureTime: Date | null;
  lastFailureMessage: string | null;
  consecutiveFailures: number;
}

/** Sketch merge comparison result. */
export interface SketchComparison {
  hasConflict: boolean;
  localNodeCount?: number;
  serverNodeCount?: number;
  localEdgeCount?: number;
  serverEdgeCount?: number;
}

/** Sketch merge result. */
export interface SketchMergeResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mergeInfo: {
    addedNodes: number;
    addedEdges: number;
    conflictingNodes: number;
    conflictingEdges: number;
  };
}

// ─── Domain: GNSS ───────────────────────────────────────────────────────────

/** Parsed NMEA position data. */
export interface GNSSPosition {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  fixType?: string;
  satellites?: number;
  hdop?: number;
  timestamp?: string;
}

/** GNSS connection state. */
export interface GNSSState {
  connected: boolean;
  adapter: string | null;
  position: GNSSPosition | null;
  error: string | null;
}

// ─── Domain: Cockpit ────────────────────────────────────────────────────────

/** Completion engine issue. */
export interface SketchIssue {
  id: string;
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  nodeId?: string;
  edgeId?: string;
  fix?: {
    label: string;
    action: () => void;
  };
}

// ─── Global Augmentations ───────────────────────────────────────────────────

declare global {
  interface Window {
    t: (key: string, ...args: unknown[]) => string;
    currentLang?: string;
    showToast?: (message: string, options?: Record<string, unknown>) => void;
    renderHome?: () => void;
    invalidateLibraryCache?: () => void;
    __onSketchIdChanged?: (oldId: string, newId: string) => void;
    menuEvents?: {
      emit: (event: string, data?: unknown) => void;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      off: (event: string, handler: (...args: unknown[]) => void) => void;
    };
    authGuard?: {
      onAuthStateChange: (callback: (state: AuthState) => void) => () => void;
    };
    syncService?: Record<string, unknown>;
    permissionsService?: Record<string, unknown>;
  }
}

export {};
