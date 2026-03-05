/**
 * Memory Manager for God Mode Daemon
 *
 * Manages two memory files:
 * - long-term-mem.md  — Persistent project knowledge, architecture decisions, patterns
 * - short-term-mem.md — Session state: active tasks, recent polls, chat log, working context
 *
 * Both files are read by Claude Code's /manholes-mapper-god skill for context.
 */

import fs from 'fs';
import path from 'path';

export class MemoryManager {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.longTermPath = path.join(baseDir, 'long-term-mem.md');
    this.shortTermPath = path.join(baseDir, 'short-term-mem.md');
    this.ensureFiles();
  }

  ensureFiles() {
    if (!fs.existsSync(this.longTermPath)) {
      fs.writeFileSync(this.longTermPath, this._defaultLongTerm(), 'utf-8');
    }
    if (!fs.existsSync(this.shortTermPath)) {
      fs.writeFileSync(this.shortTermPath, this._defaultShortTerm(), 'utf-8');
    }
  }

  // ── Read ───────────────────────────────────────────────────────────────
  readLongTerm() {
    return fs.readFileSync(this.longTermPath, 'utf-8');
  }

  readShortTerm() {
    return fs.readFileSync(this.shortTermPath, 'utf-8');
  }

  // ── Write ──────────────────────────────────────────────────────────────
  writeLongTerm(content) {
    fs.writeFileSync(this.longTermPath, content, 'utf-8');
  }

  writeShortTerm(content) {
    fs.writeFileSync(this.shortTermPath, content, 'utf-8');
  }

  clearShortTerm() {
    fs.writeFileSync(this.shortTermPath, this._defaultShortTerm(), 'utf-8');
  }

  // ── Append Operations ──────────────────────────────────────────────────
  appendShortTermNote(text) {
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const content = this.readShortTerm();
    const marker = '## Notes';
    if (content.includes(marker)) {
      const updated = content.replace(marker, `${marker}\n- [${ts}] ${text}`);
      this.writeShortTerm(updated);
    } else {
      this.writeShortTerm(content + `\n${marker}\n- [${ts}] ${text}\n`);
    }
  }

  appendLongTermInsight(text) {
    const ts = new Date().toISOString().slice(0, 10);
    const content = this.readLongTerm();
    const marker = '## Learned Insights';
    if (content.includes(marker)) {
      const updated = content.replace(marker, `${marker}\n- [${ts}] ${text}`);
      this.writeLongTerm(updated);
    } else {
      this.writeLongTerm(content + `\n${marker}\n- [${ts}] ${text}\n`);
    }
  }

  appendChatMessage(entry) {
    const ts = entry.time.slice(0, 19).replace('T', ' ');
    const content = this.readShortTerm();
    const marker = '## Chat Log';
    const line = `- [${ts}] **${entry.role}**: ${entry.content}`;
    if (content.includes(marker)) {
      const updated = content.replace(marker, `${marker}\n${line}`);
      this.writeShortTerm(updated);
    } else {
      this.writeShortTerm(content + `\n${marker}\n${line}\n`);
    }
  }

  // ── ClickUp Poll Update ────────────────────────────────────────────────
  updateShortTerm(pollData) {
    let content = this.readShortTerm();

    // Replace the ClickUp Status section
    const clickupSection = `## ClickUp Status
- **Last Poll**: ${pollData.lastPoll}
- **Poll Count**: ${pollData.pollCount}
- **Total Tasks**: ${pollData.totalTasks}
- **Open Tasks**: ${pollData.openTasks.length}
- **In Progress**: ${pollData.inProgressTasks.length}
- **Need Help**: ${pollData.helpTasks.length}

### Open / Actionable Tasks
${pollData.openTasks.length === 0 ? '_None_' : pollData.openTasks.map(t => `- [${t.status}] ${t.name} (\`${t.id}\`)`).join('\n')}

### In Progress
${pollData.inProgressTasks.length === 0 ? '_None_' : pollData.inProgressTasks.map(t => `- ${t.name} (\`${t.id}\`)`).join('\n')}

### Need Help
${pollData.helpTasks.length === 0 ? '_None_' : pollData.helpTasks.map(t => `- ${t.name} (\`${t.id}\`)`).join('\n')}`;

    // Replace existing ClickUp Status section or prepend it
    const startMarker = '## ClickUp Status';
    const nextSection = /\n## (?!ClickUp Status)/;
    if (content.includes(startMarker)) {
      const startIdx = content.indexOf(startMarker);
      const afterStart = content.slice(startIdx + startMarker.length);
      const nextMatch = afterStart.match(nextSection);
      const endIdx = nextMatch ? startIdx + startMarker.length + nextMatch.index : content.length;
      content = content.slice(0, startIdx) + clickupSection + '\n' + content.slice(endIdx);
    } else {
      // Insert after the header
      const headerEnd = content.indexOf('\n---');
      if (headerEnd !== -1) {
        content = content.slice(0, headerEnd) + '\n\n' + clickupSection + content.slice(headerEnd);
      } else {
        content = clickupSection + '\n\n' + content;
      }
    }

    this.writeShortTerm(content);
  }

  // ── Save All (daemon state snapshot) ───────────────────────────────────
  saveAll(daemonState) {
    // Update short-term with daemon session info
    let stm = this.readShortTerm();
    const sessionSection = `## Daemon Session
- **Started**: ${daemonState.startTime.toISOString()}
- **Last Saved**: ${new Date().toISOString()}
- **Total Polls**: ${daemonState.pollCount}
- **Chat Messages**: ${daemonState.chatHistory.length}`;

    const marker = '## Daemon Session';
    const nextSection = /\n## (?!Daemon Session)/;
    if (stm.includes(marker)) {
      const startIdx = stm.indexOf(marker);
      const afterStart = stm.slice(startIdx + marker.length);
      const nextMatch = afterStart.match(nextSection);
      const endIdx = nextMatch ? startIdx + marker.length + nextMatch.index : stm.length;
      stm = stm.slice(0, startIdx) + sessionSection + '\n' + stm.slice(endIdx);
    } else {
      stm = sessionSection + '\n\n' + stm;
    }

    this.writeShortTerm(stm);
  }

  // ── Defaults ───────────────────────────────────────────────────────────
  _defaultLongTerm() {
    return `# Manholes Mapper — Long-Term Memory

This file stores persistent project knowledge that survives across sessions.
It is read by Claude Code's \`/manholes-mapper-god\` skill for deep context.

---

## Project Identity
- **Name**: Manholes Mapper
- **Purpose**: PWA for field surveying — draw manhole/pipe networks on HTML5 Canvas with RTK GNSS and cloud sync
- **Production URL**: https://manholes-mapper.vercel.app
- **Preview URL**: https://manholes-mapper-git-dev-hussam0is-projects.vercel.app
- **ClickUp Board**: List ID \`901815260471\` — [Version 3 Development](https://app.clickup.com/90182222916/v/li/901815260471)

## Architecture Summary
- **Frontend**: Vite 7.x, vanilla JS (ES modules), HTML5 Canvas, React 19 (auth UI only), Tailwind CSS 4.x
- **Backend**: Vercel serverless (Node.js), Better Auth 1.4.x, Neon Postgres
- **Mobile**: Capacitor 8.x (Android), Bluetooth SPP for TSC3/GNSS
- **Testing**: Vitest (~490 tests), Playwright (E2E)
- **Entry**: index.html -> src/main-entry.js -> src/legacy/main.js (~8300 lines monolith)

## Key Directories
| Directory | Purpose |
|-----------|---------|
| \`src/legacy/main.js\` | Monolithic core: canvas, events, CRUD, panels |
| \`src/auth/\` | Better Auth client, session guards, sync-service, RBAC |
| \`src/gnss/\` | GNSS state machine, browser-location-adapter, markers |
| \`src/survey/\` | TSC3 Bluetooth/WebSocket survey device integration |
| \`src/project/\` | Multi-sketch project canvas mode |
| \`src/admin/\` | Admin panel, CSV config, input flow settings |
| \`src/map/\` | Tile manager, projections (ITM/WGS84), reference layers |
| \`src/menu/\` | Responsive menu system, event delegation |
| \`api/\` | Vercel serverless: sketches, projects, orgs, users, auth |
| \`manholes-mapper-god-agent/\` | God mode daemon, memory, ClickUp integration |

## Database
- **Provider**: Neon PostgreSQL
- **Tables**: organizations, projects, sketches (nodes/edges JSONB), users (role RBAC), user_features, project_layers, sketch_locks
- **Auth Tables**: user, session, account, verification (Better Auth)
- **Roles**: user < admin < super_admin

## ClickUp Integration
- **List ID**: \`901815260471\`
- **MCP Server**: \`clickup\` in \`.mcp.json\` — use \`mcp__clickup__clickup_search\`, \`mcp__clickup__clickup_update_task\`, \`mcp__clickup__clickup_create_task\`
- **REST API Fallback**: \`manholes-mapper-god-agent/clickup-poller.mjs\` — direct API calls with \`CLICKUP_API_TOKEN\`
- **Statuses**: backlog, Open, in progress, success in dev, Testing, Closed
- **Task Prefixes**: FEATURE:, BUG:, UPGRADE:

## Auth Credentials
- Admin: admin@geopoint.me / Geopoint2026! (super_admin role)

## Deployment
- \`dev\` branch -> Vercel Preview (auto)
- Production: \`npx vercel promote <preview-url>\`
- Bump \`APP_VERSION\` in \`public/service-worker.js\` after non-fingerprinted file changes

## Coordinate Systems
- WGS84 (GPS) -> ITM EPSG:2039 (proj4) -> Canvas World -> Screen pixels
- Draw pipeline: \`screen = world * stretch * viewScale + viewTranslate\`

## GNSS Fix Quality
| Accuracy | Fix Type | Color |
|----------|----------|-------|
| < 0.05m | RTK Fixed | Green |
| < 0.5m | RTK Float | Blue |
| < 5m | DGPS | Amber |
| < 15m | GPS | Amber |
| >= 15m | No fix | Red |

## Learned Insights
`;
  }

  _defaultShortTerm() {
    return `# Manholes Mapper — Short-Term Memory

This file tracks the current session state, active tasks, and recent interactions.
It is automatically updated by the God Mode Daemon every 30 minutes.
It is read by Claude Code's \`/manholes-mapper-god\` skill for working context.

---

## Notes

## Chat Log
`;
  }
}
