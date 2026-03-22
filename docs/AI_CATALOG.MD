# Application Catalog (Routing)

This file documents the routing logic for the Manhole Mapper application.

## App Routing Logic

The application uses hash-based routing with Better Auth authentication.

| Path | Description | Page | Auth Required |
| :--- | :--- | :--- | :--- |
| `#/login` | Login page with SignIn form | Login | No |
| `#/signup` | Sign up page with SignUp form | Signup | No |
| `#/` | Main application view (Home/Canvas) | Home | Yes |
| `#/admin` | Administration and configuration settings | Admin | Yes |

## Main Views & Components

### 1. Home View (`#/`)
This is the central workspace of the application. It dynamically switches between several states:
- **Home Panel**: Displays "My Sketches" (a list of saved sketches) and a "New Sketch" button.
- **Start Panel**: Prompted when starting a new sketch; asks for a creation date.
- **Canvas Workspace**: The primary graph sketching area where users can draw nodes and edges.
- **Details Sidebar**: A resizable drawer on the right side for viewing and editing details of selected nodes or edges.

### 2. Admin View (`#/admin`)
A dedicated screen for advanced configuration:
- **Field Visibility**: Toggle which fields are included in CSV exports for nodes and edges.
- **Default Values**: Set default values for new entities.
- **Option Lists**: Configure selectable options (e.g., materials, diameters, status) with label-to-code mappings.
- **Import/Export Settings**: Capability to save and load the administrative configuration as JSON.

### 3. Utility Modals & Overlays
- **Help Modal**: Contains tips and a list of keyboard shortcuts.
- **Floating Keyboard**: A numeric-only on-screen keyboard for mobile users, triggered when numeric inputs are focused.
- **Toast Notifications**: Used for brief status updates (e.g., "Saved", "Settings Imported").

## Authentication & Cloud Sync

### Authentication (Better Auth)
- **Provider**: Better Auth (Email/Password authentication with Neon Postgres)
- **Config Files**: 
  - `src/auth/auth-provider.jsx` - Auth React components
  - `src/auth/auth-client.js` - Better Auth client
  - `src/auth/auth-guard.js` - Route protection and auth state
  - `lib/auth.js` - Better Auth server configuration
- **Environment Variables**:
  - `BETTER_AUTH_SECRET` - Server-side secret key
  - `POSTGRES_URL` - Neon Postgres connection string

### Cloud Sync (Vercel Postgres)
- **Sync Service**: `src/auth/sync-service.js` - Handles cloud synchronization
- **API Routes** (Vercel Serverless):
  - `GET /api/sketches` - List user's sketches
  - `POST /api/sketches` - Create new sketch
  - `GET /api/sketches/[id]` - Get single sketch
  - `PUT /api/sketches/[id]` - Update sketch
  - `DELETE /api/sketches/[id]` - Delete sketch

### Caching Strategy
1. **On Login**: Fetches sketches from cloud, caches in IndexedDB
2. **Subsequent Logins**: Loads from cache immediately, syncs in background
3. **Offline Mode**: Saves to IndexedDB, queues changes for later sync
4. **Online Sync**: Debounced saves (2s delay) to cloud when editing

## Key Features

- **Multi-Node Modes**: Quick switching between standard Manholes, Home Nodes, and Drainage Nodes.
- **Sketch Persistence**: Automatic mirroring of state between `localStorage`, `IndexedDB`, and cloud (Vercel Postgres).
- **Cloud Sync**: Real-time synchronization of sketches when online, with offline queue for changes.
- **Search**: Top bar search to quickly locate nodes by ID.
- **Export/Import**: Support for exporting/importing the entire sketch (JSON) or exporting nodes/edges separately (CSV).
- **Responsive Design**: Includes a mobile-specific overflow menu and optimized touch interactions.

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `N` | Switch to Node mode |
| `E` | Switch to Edge mode |
| `+` / `=` | Zoom In |
| `-` | Zoom Out |
| `0` | Reset Zoom |
| `Esc` | Cancel action or clear selection |
| `Delete` / `Backspace` | Delete selected item |

> [!NOTE]
> The routing logic is primarily handled in [src/legacy/main.js](file:///c:/Users/murjan.a/Documents/manholes%20mapper%20v2/manholes-mapper/src/legacy/main.js) via the `handleRoute` function. UI definitions are located in [index.html](file:///c:/Users/murjan.a/Documents/manholes%20mapper%20v2/manholes-mapper/index.html).
