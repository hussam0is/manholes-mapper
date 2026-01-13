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

## Project Structure

```
manholes-mapper/
├── src/                    # Application source code
│   ├── admin/              # Admin UI logic and helpers
│   ├── components/         # React components (Admin, Canvas, Layout)
│   ├── db.js               # IndexedDB database definition
│   ├── dom/                # DOM manipulation utilities
│   ├── features/           # Rendering engine and drawing primitives
│   ├── graph/              # Graph data structures and ID utilities
│   ├── hooks/              # Custom React hooks
│   ├── i18n.js             # Internationalization system
│   ├── legacy/             # Core logic (being modularized)
│   ├── main-entry.js       # Application entry point
│   ├── serviceWorker/      # SW registration and lifecycle
│   ├── state/              # Global state and persistence logic
│   └── utils/              # Shared utilities (CSV, Geometry, UI)
├── public/                 # Static assets and PWA manifest
├── dist/                   # Production build output
├── index.html              # Main entry HTML
├── styles.css              # Global styles and Tailwind directives
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

The application is built with a relative base path (`./`) for flexible deployment:

1. Build: `npm run build`
2. Deploy the `dist/` directory to any static host (GitHub Pages, Vercel, Netlify, etc.).
3. **Note**: HTTPS is required for Service Worker functionality.

## Data Management

### ArcGIS Integration
CSV exports are designed to be imported directly into ArcGIS:
- **Nodes CSV**: Includes coordinates, types, and custom attributes.
- **Edges CSV**: Includes connectivity (from/to) and measurements.

### Health Monitoring
A health check page is available at `/health/` to verify system status and PWA health.

## License

Proprietary - All rights reserved

---

**Built with modern web technologies for professional infrastructure mapping.**
