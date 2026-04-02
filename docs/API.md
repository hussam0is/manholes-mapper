# Manholes Mapper API

Complete API surface for the Manholes Mapper platform.

---

## Authentication

### POST /api/auth/sign-in
Sign in with Better Auth.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** Session token and user data.

### POST /api/auth/sign-up
Create a new user account.

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "securepassword",
  "name": "Full Name"
}
```

**Response:** User data and session token.

### POST /api/auth/sign-out
Sign out and invalidate session.

**Headers:** Authorization: Bearer <token>

**Response:** Success message.

---

## Projects

### GET /api/projects
List all projects for the current user.

**Headers:** Authorization: Bearer <token>

**Response:**
```json
[
  {
    "id": "proj_123",
    "name": "City Survey 2026",
    "description": "Main city infrastructure mapping",
    "organizationId": "org_456",
    "createdAt": "2026-03-01T00:00:00Z"
  }
]
```

### POST /api/projects
Create a new project.

**Headers:** Authorization: Bearer <token>

**Request:**
```json
{
  "name": "New Project",
  "description": "Project description",
  "organizationId": "org_123"
}
```

### GET /api/projects/:id
Get project details.

**Response:** Project object with permissions.

### PUT /api/projects/:id
Update project.

### DELETE /api/projects/:id
Delete project.

---

## Sketches

### GET /api/projects/:projectId/sketches
List sketches for a project.

**Response:**
```json
[
  {
    "id": "sketch_789",
    "name": "Manhole Network A",
    "description": "Primary survey area",
    "projectId": "proj_123",
    "isLocked": false,
    "lockedAt": null,
    "lockedBy": null,
    "createdAt": "2026-03-15T10:30:00Z"
  }
]
```

### POST /api/projects/:projectId/sketches
Create a new sketch.

**Request:**
```json
{
  "name": "New Sketch",
  "description": "Sketch description"
}
```

### GET /api/sketches/:id
Get sketch with all nodes and edges.

**Response:**
```json
{
  "id": "sketch_789",
  "name": "Manhole Network A",
  "nodes": [
    {
      "id": "node_1",
      "x": 123456.789,
      "y": 234567.890,
      "nodeType": "Manhole",
      "type": "type1",
      "gnssFixQuality": 4,
      "surveyX": 123456.789,
      "surveyY": 234567.890,
      "surveyZ": 10.5,
      "tail_measurement": null,
      "head_measurement": null
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "tail": "node_1",
      "head": "node_2",
      "length": 15.5,
      "direction": 45.0,
      "tail_measurement": 5.2,
      "head_measurement": 7.3
    }
  ]
}
```

### PUT /api/sketches/:id
Update sketch (nodes and edges).

**Response:** Updated sketch object.

### DELETE /api/sketches/:id
Delete sketch.

### POST /api/sketches/:id/lock
Acquire sketch lock (30-minute expiry).

**Headers:** Authorization: Bearer <token>

**Response:** Lock confirmation.

### POST /api/sketches/:id/unlock
Force unlock sketch (admin only).

### POST /api/sketches/:id/force-unlock
Force unlock by admin (bypasses expiry).

---

## Organizations

### GET /api/organizations
List organizations for the user.

### POST /api/organizations
Create organization.

### GET /api/organizations/:id
Get organization details.

### PUT /api/organizations/:id
Update organization.

### DELETE /api/organizations/:id
Delete organization.

### GET /api/organizations/:id/users
List organization members.

### POST /api/organizations/:id/users
Add member.

### DELETE /api/organizations/:id/users/:userId
Remove member.

---

## Users

### GET /api/users/:id
Get user details.

### PUT /api/users/:id
Update user profile.

### GET /api/users/me
Get current user.

---

## Feature Flags

### GET /api/features
List all feature flags.

**Response:**
```json
[
  {
    "name": "csv_export",
    "enabled": true,
    "description": "Allow CSV export of nodes and edges"
  }
]
```

### POST /api/features
Create feature flag (admin only).

### PUT /api/features/:name
Toggle feature flag.

### DELETE /api/features/:name
Delete feature flag (admin only).

---

## Layers

### GET /api/layers
List all reference layers.

**Response:**
```json
[
  {
    "id": "layer_1",
    "name": "Sections",
    "type": "vector",
    "visible": true,
    "dataUrl": "/api/layers/sections.geojson"
  }
]
```

### POST /api/layers
Create reference layer (admin only).

### PUT /api/layers/:id
Update layer visibility/data.

### DELETE /api/layers/:id
Delete layer (admin only).

---

## Issues

### GET /api/issues
List issues for a sketch.

**Response:**
```json
[
  {
    "id": "issue_123",
    "type": "missing_coordinates",
    "nodeId": "node_1",
    "description": "Node has no coordinates",
    "severity": "warning",
    "createdAt": "2026-03-20T10:00:00Z"
  }
]
```

### POST /api/issues
Report new issue.

**Request:**
```json
{
  "type": "negative_gradient",
  "nodeId": "node_1",
  "description": "Edge has negative slope"
}
```

### DELETE /api/issues/:id
Delete issue.

---

## Issue Comments

### GET /api/issues/:issueId/comments
List comments for an issue.

### POST /api/issues/:issueId/comments
Add comment to issue.

**Request:**
```json
{
  "text": "Fixed in commit abc123"
}
```

---

## Stats

### GET /api/stats/overview
Get project/sketch statistics.

**Response:**
```json
{
  "totalNodes": 156,
  "totalEdges": 289,
  "completedNodes": 142,
  "issueCount": 8,
  "lastUpdated": "2026-03-31T00:00:00Z"
}
```

### GET /api/stats/project/:projectId
Get project statistics.

---

## Health Check

### GET /health/
Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-31T10:00:00Z",
  "services": {
    "database": "connected",
    "auth": "healthy"
  }
}
```

---

## Authentication Middleware

All routes except `/auth/*` and `/health/` require authentication:

**Header:** `Authorization: Bearer <token>`

**Token Format:** JWT from Better Auth session.

---

## Error Responses

All errors return JSON:

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token",
  "code": "AUTH_INVALID_TOKEN"
}
```

---

## Rate Limiting

Rate limits apply to:
- Sign-in: 5 attempts per 15 minutes
- API calls: 100 requests per minute per user

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## File Exports

### POST /api/sketches/:id/export/csv
Export sketch as CSV for ArcGIS.

**Headers:** Authorization: Bearer <token>

**Response:** CSV file with nodes and edges.

### POST /api/sketches/:id/export/json
Export sketch as JSON.

**Response:** JSON file with full sketch data.

### POST /api/sketches/:id/import
Import sketch from JSON.

**Request:** JSON file with nodes and edges.

---

## CORS

CORS enabled for:
- Origin: Any (development)
- Production: Configured via Vercel

---

## Base URL

```
https://manholes-mapper.vercel.app/api
```

Development uses relative paths from the frontend.

---

*Last updated: 2026-03-31*