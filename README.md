# Manholes Mapper PWA

A professional, high-performance Progressive Web Application (PWA) for infrastructure mapping and field data collection. Built for offline-first operations with real-time canvas-based visualization and GIS-ready data export.

## Overview

Manholes Mapper is a lightweight yet powerful tool designed for field workers to capture, manage, and visualize infrastructure network data (manholes, home connections, and drainage systems). It operates seamlessly without internet connectivity, providing a desktop-class editing experience on mobile and tablet devices.

## Key Features

- **Interactive Canvas Editor**: High-performance HTML5 Canvas rendering for node-edge network visualization.
- **Multi-Node Modes**: Specialized support for different infrastructure types:
  - **Manholes**: Standard network nodes.
  - **Home Nodes**: Residential/Building connections.
  - **Drainage Nodes**: Stormwater and surface water nodes.
- **Offline-First Architecture**: Full functionality without internet using a hybrid IndexedDB and localStorage persistence layer.
- **Advanced Admin Configuration**:
  - Customize field visibility for CSV exports.
  - Set default values for new nodes and edges.
  - Manage selectable option lists (materials, diameters, status) with code mappings.
  - Export/Import administrative settings as JSON.
- **Mobile Optimized**:
  - **Floating Numeric Keyboard**: Custom on-screen dialpad for efficient numeric entry on touch devices.
  - **Resizable Details Drawer**: Swipeable and resizable sidebar for viewing and editing entity details.
  - **Mobile Action Menu**: Context-aware overflow menu for small screens.
  - **Touch Gestures**: Support for pinch-to-zoom and pan.
- **Data Integrity & Export**:
  - **Real-time Autosave**: Automatic background persistence to prevent data loss.
  - **GIS Integration**: Export nodes and edges separately as CSV files optimized for ArcGIS.
  - **Backup & Sharing**: Export/Import entire sketches as JSON.
- **Bilingual Support**: Full Hebrew (RTL) and English (LTR) localization.
- **Navigation & Search**:
  - Hash-based routing for quick switching between workspace and settings.
  - Top-bar search to instantly locate nodes by ID.
  - Recenter view and edge legend for better orientation.

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES Modules) with a progressive migration to **React 19**.
- **Styling**: **Tailwind CSS 4.x** for modern, responsive layouts.
- **Build Tool**: **Vite 7.x** with stable output filenames for service worker compatibility.
- **Rendering**: HTML5 Canvas API for the graph engine.
- **Storage**: IndexedDB for durable storage, mirrored with localStorage for synchronous access.
- **Offline**: Service Worker (Workbox-inspired) for asset caching and offline fallback.
- **Authentication**: **Better Auth** for user authentication and session management with Neon Postgres.

## Authentication (Better Auth)

This project uses [Better Auth](https://better-auth.com) for user authentication, providing secure sign-in, sign-up, and session management backed by Neon Postgres.

### Better Auth Integration

| Component | Package | Purpose |
| :--- | :--- | :--- |
| Auth Library | `better-auth` | Core authentication library |
| Client SDK | `better-auth/client` | Client-side authentication |
| Database | `@neondatabase/serverless` | Neon Postgres for session storage |

### Environment Variables

| Variable | Location | Description |
| :--- | :--- | :--- |
| `BETTER_AUTH_SECRET` | Vercel Environment | Secret key for signing sessions |
| `POSTGRES_URL` | Vercel Environment | Neon Postgres connection string |
| `BETTER_AUTH_URL` | Vercel Environment | Base URL for auth endpoints (optional) |

### Setup Instructions

1. **Configure Database**: Ensure your Neon Postgres database is connected via Vercel Storage.
2. **Set Secret Key**: Add `BETTER_AUTH_SECRET` to your Vercel project's environment variables:
   ```bash
   BETTER_AUTH_SECRET=your-secure-random-secret-here
   ```
3. **Database Tables**: Better Auth will automatically create the required tables (`user`, `session`, `account`, `verification`).

### Authentication Features

- **Hash-based Routing**: Sign-in (`#/login`) and sign-up (`#/signup`) use hash routing for PWA compatibility.
- **Session Persistence**: Cookie-based session management with 7-day expiration.
- **API Session Verification**: Backend routes verify sessions using Better Auth's session API.
- **User Button**: Integrated user menu for profile management and sign-out.

## Project Structure

```
manholes-mapper/
├── src/                    # Application source code
│   ├── admin/              # Admin UI logic and helpers
│   ├── components/         # React components (Admin, Canvas, Layout)
│   ├── db.js               # IndexedDB database definition
│   ├── dom/                # DOM manipulation utilities
│   ├── features/           # Rendering engine and drawing primitives
│   ├── gnss/               # GNSS/Live Measure module
│   │   ├── bluetooth-adapter.js   # Bluetooth SPP connection
│   │   ├── wifi-adapter.js        # WiFi TCP connection
│   │   ├── mock-adapter.js        # Mock for development
│   │   ├── nmea-parser.js         # NMEA sentence parsing
│   │   ├── gnss-state.js          # State management
│   │   ├── gnss-marker.js         # Canvas marker rendering
│   │   ├── point-capture-dialog.js # Point capture UI
│   │   └── connection-manager.js  # Unified connection interface
│   ├── graph/              # Graph data structures and ID utilities
│   ├── hooks/              # Custom React hooks
│   ├── i18n.js             # Internationalization system
│   ├── legacy/             # Core logic (being modularized)
│   ├── main-entry.js       # Application entry point
│   ├── map/                # Map tiles and user location
│   ├── serviceWorker/      # SW registration and lifecycle
│   ├── state/              # Global state and persistence logic
│   └── utils/              # Shared utilities (CSV, Geometry, UI)
├── android/                # Capacitor Android project
├── public/                 # Static assets and PWA manifest
├── dist/                   # Production build output
├── index.html              # Main entry HTML
├── styles.css              # Global styles and Tailwind directives
├── capacitor.config.ts     # Capacitor configuration
├── vite.config.ts          # Vite & Build configuration
└── package.json            # Dependencies and scripts
```

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev
```

### Building for Production

```bash
# Create optimized production build
npm run build

# Preview production build locally
npm run preview
```

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

## Deployment

### Vercel (Production)

This project is deployed on **Vercel** with automatic deployments from Git.

#### Project Configuration

| Setting | Value |
| :--- | :--- |
| **Project Name** | `manholes-mapper` |
| **Framework** | Vite |
| **Node Version** | 24.x |
| **Build Command** | `vite build` |
| **Output Directory** | `dist` |

#### Production URLs

| Environment | URL |
| :--- | :--- |
| **Production** | https://manholes-mapper.vercel.app |
| **Preview (dev branch)** | https://manholes-mapper-git-dev-hussam0is-projects.vercel.app |

#### Deployment Process

1. **Automatic Deployments**: Push to `main` branch triggers production deployment; push to `dev` triggers preview deployment.
2. **Manual Deployment**: Use Vercel CLI or dashboard to trigger deployments.

```bash
# Install Vercel CLI (if needed)
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

#### Vercel Configuration (`vercel.json`)

```json
{
  "framework": "vite",
  "devCommand": "vite",
  "buildCommand": "vite build",
  "outputDirectory": "dist"
}
```

### Alternative Deployment

The application is built with a relative base path (`./`) for flexible deployment to other platforms:

1. Build: `npm run build`
2. Deploy the `dist/` directory to any static host (GitHub Pages, Netlify, etc.).
3. **Note**: HTTPS is required for Service Worker functionality.

## Data Management

### ArcGIS Integration
CSV exports are designed to be imported directly into ArcGIS:
- **Nodes CSV**: Includes coordinates, types, and custom attributes.
- **Edges CSV**: Includes connectivity (from/to) and measurements.

### Health Monitoring
A health check page is available at `/health/` to verify system status and PWA health.

## GNSS Integration (Live Measure Mode)

The application supports live GNSS coordinate capture from Trimble R780/R780-2 receivers for survey-grade positioning.

### Overview

Live Measure mode enables:
- Real-time GNSS position display on the sketch canvas
- Survey point capture and assignment to nodes
- Automatic edge creation between captured points
- RTK fix quality and accuracy indicators

### Supported Connection Methods

| Method | Platform | Description |
| :--- | :--- | :--- |
| Bluetooth SPP | Android | Bluetooth Classic Serial Port Profile connection |
| WiFi TCP | Android | TCP connection over R780's WiFi hotspot |

**Note**: The GNSS features require building as a native Android app using Capacitor, as browsers cannot access Bluetooth SPP or raw TCP sockets.

### Trimble R780 Configuration

1. **Enable NMEA Output**: Configure the R780 to output NMEA sentences (GGA and RMC at minimum).
2. **Bluetooth Pairing**: Pair the R780 with your Android device in system Bluetooth settings.
3. **WiFi Mode**: Alternatively, connect your device to the R780's WiFi hotspot (default IP: 192.168.1.10, port: 5017).

### Building the Android App

```bash
# Build the web assets
npm run build

# Sync with Android platform
npm run build:android

# Open in Android Studio
npm run open:android
```

### Installing Capacitor Plugins

For Bluetooth SPP support:
```bash
npm install @niceprogrammer/capacitor-bluetooth-serial
npx cap sync android
```

For WiFi TCP support:
```bash
npm install capacitor-tcp-socket
npx cap sync android
```

### Using Live Measure Mode

1. **Enable Live Measure**: Tap the GPS icon in the canvas toolbar.
2. **Connect to R780**: Tap "Connect to R780" and select your paired device (or enter WiFi IP).
3. **Monitor Position**: The status pill shows fix quality, satellite count, and HDOP.
4. **Capture Points**: 
   - Position yourself at a manhole.
   - Tap "Capture Point".
   - Select the node to assign coordinates to.
   - Optionally create an edge from the previous point.
5. **Verify**: Captured coordinates are stored and the node is repositioned on the canvas.

### GNSS Status Indicators

| Fix Quality | Color | Description |
| :--- | :--- | :--- |
| No Fix | Red | No GNSS fix available |
| GPS | Amber | Standalone GPS fix |
| DGPS | Amber | Differential GPS fix |
| RTK Float | Blue | RTK float solution |
| RTK Fixed | Green | RTK fixed solution (highest accuracy) |

### Development Testing

In web browser mode (without Capacitor), the app uses a mock GNSS adapter for testing:

```javascript
// Connect to mock GNSS
await window.gnssConnection.connectMock();

// Simulate movement
window.gnssConnection.setMockPosition(32.0853, 34.7818);
```

## License

Proprietary - All rights reserved

---

**Built with modern web technologies for professional infrastructure mapping.**
