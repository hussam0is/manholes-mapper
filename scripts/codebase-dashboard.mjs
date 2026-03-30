#!/usr/bin/env node
/**
 * Codebase Metrics Dashboard — Standalone Local Server
 *
 * Run: node scripts/codebase-dashboard.mjs
 *      npm run dashboard
 *
 * Opens http://localhost:4000 with a dark-themed dashboard showing:
 * - File counts by extension
 * - Lines of code per directory/module
 * - Top largest files
 * - Dependencies (prod + dev)
 * - Test inventory
 * - API endpoint inventory
 * - Scripts inventory
 * - Git stats (commits, contributors)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PORT = parseInt(process.env.DASHBOARD_PORT || '4000', 10);
const ROOT = path.resolve(process.argv[1], '..', '..');

// ── Helpers ──

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch { return 0; }
}

function walkDir(dir, ignore = []) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkDir(fullPath, ignore));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return results;
}

function gitExec(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 10000 }).trim();
  } catch { return ''; }
}

// ── Data Collection ──

function collectMetrics() {
  const start = Date.now();
  const ignoreTop = ['node_modules', '.git', 'dist', 'android', '.claude'];
  const ignoreNested = ['node_modules', '.git', 'dist'];

  // 1. All files
  const allFiles = walkDir(ROOT, ignoreTop);

  // 2. File counts by extension
  const extCounts = {};
  for (const f of allFiles) {
    const ext = path.extname(f).toLowerCase() || '(none)';
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  const filesByExt = Object.entries(extCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);

  // 3. Code extensions for LOC
  const codeExts = new Set(['.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.json', '.mjs', '.cjs']);
  const codeFiles = allFiles.filter(f => codeExts.has(path.extname(f).toLowerCase()));

  // 4. LOC per top-level directory
  const dirLoc = {};
  for (const f of codeFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const topDir = rel.split('/')[0];
    const lines = countLines(f);
    dirLoc[topDir] = (dirLoc[topDir] || 0) + lines;
  }
  const locByDir = Object.entries(dirLoc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  // 5. LOC per frontend module
  const frontendSrc = path.join(ROOT, 'frontend', 'src');
  const moduleLoc = {};
  if (fs.existsSync(frontendSrc)) {
    const srcFiles = walkDir(frontendSrc, ignoreNested);
    for (const f of srcFiles) {
      if (!codeExts.has(path.extname(f).toLowerCase())) continue;
      const rel = path.relative(frontendSrc, f).replace(/\\/g, '/');
      const mod = rel.split('/')[0];
      const lines = countLines(f);
      moduleLoc[mod] = (moduleLoc[mod] || 0) + lines;
    }
  }
  const locByModule = Object.entries(moduleLoc)
    .sort((a, b) => b[1] - a[1]);

  // 6. Top 20 largest files
  const fileSizes = codeFiles.map(f => ({
    path: path.relative(ROOT, f).replace(/\\/g, '/'),
    lines: countLines(f),
  }));
  const largestFiles = fileSizes.sort((a, b) => b.lines - a.lines).slice(0, 20);

  // 7. Total LOC
  const totalLoc = fileSizes.reduce((s, f) => s + f.lines, 0);

  // 8. Dependencies from package.json
  let deps = [];
  let devDeps = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    deps = Object.entries(pkg.dependencies || {}).map(([n, v]) => ({ name: n, version: v, type: 'prod' }));
    devDeps = Object.entries(pkg.devDependencies || {}).map(([n, v]) => ({ name: n, version: v, type: 'dev' }));
  } catch { /* no package.json */ }

  // 9. Test inventory
  const testFiles = allFiles.filter(f => {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    return (rel.includes('/tests/') || rel.includes('/test/') || rel.endsWith('.test.js') || rel.endsWith('.test.ts') || rel.endsWith('.spec.ts') || rel.endsWith('.spec.js'));
  });
  const unitTests = testFiles.filter(f => !f.includes('e2e'));
  const e2eTests = testFiles.filter(f => f.includes('e2e'));

  // 10. API endpoint inventory
  const apiDir = path.join(ROOT, 'api');
  let apiEndpoints = [];
  if (fs.existsSync(apiDir)) {
    const apiFiles = walkDir(apiDir, ['node_modules', '_lib']);
    apiEndpoints = apiFiles
      .filter(f => f.endsWith('.js'))
      .map(f => {
        const rel = path.relative(apiDir, f).replace(/\\/g, '/').replace('/index.js', '').replace('.js', '');
        return { route: `/api/${rel}`, file: path.relative(ROOT, f).replace(/\\/g, '/'), lines: countLines(f) };
      });
  }

  // 11. Scripts inventory
  const scriptsDir = path.join(ROOT, 'scripts');
  let scripts = [];
  if (fs.existsSync(scriptsDir)) {
    try {
      const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
      scripts = entries
        .filter(e => e.isFile() && (e.name.endsWith('.js') || e.name.endsWith('.mjs') || e.name.endsWith('.sh') || e.name.endsWith('.py')))
        .map(e => ({ name: e.name, lines: countLines(path.join(scriptsDir, e.name)) }));
    } catch { /* skip */ }
  }

  // 12. Git stats
  const totalCommits = parseInt(gitExec('git rev-list --count HEAD'), 10) || 0;
  const recentCommits = parseInt(gitExec('git rev-list --count --since="30 days ago" HEAD'), 10) || 0;
  const contributors = gitExec('git shortlog -sn --all HEAD')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      return match ? { commits: parseInt(match[1], 10), name: match[2] } : null;
    })
    .filter(Boolean);

  const currentBranch = gitExec('git rev-parse --abbrev-ref HEAD');
  const lastCommitDate = gitExec('git log -1 --format=%ci');

  const elapsed = Date.now() - start;

  return {
    totalFiles: allFiles.length,
    totalLoc,
    filesByExt,
    locByDir,
    locByModule,
    largestFiles,
    deps: [...deps, ...devDeps],
    prodDepsCount: deps.length,
    devDepsCount: devDeps.length,
    testFiles: { total: testFiles.length, unit: unitTests.length, e2e: e2eTests.length },
    apiEndpoints,
    scripts,
    git: { totalCommits, recentCommits, contributors, currentBranch, lastCommitDate },
    scanTimeMs: elapsed,
  };
}

// ── HTML Template ──

function renderHTML(data) {
  const barChart = (items, color = '#3b82f6') => {
    const max = Math.max(...items.map(i => i[1]), 1);
    return items.map(([label, value]) => {
      const pct = (value / max) * 100;
      return `<div class="bar-row">
        <span class="bar-label">${escHtml(label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="bar-value">${value.toLocaleString()}</span>
      </div>`;
    }).join('');
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Manholes Mapper — Codebase Metrics</title>
<style>
  :root { --bg: #0f172a; --surface: #1e293b; --border: #334155; --text: #e2e8f0; --muted: #94a3b8; --accent: #3b82f6; --green: #10b981; --orange: #f59e0b; --red: #ef4444; --purple: #8b5cf6; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; padding: 24px; max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 4px; }
  h1 span { color: var(--accent); }
  .subtitle { color: var(--muted); font-size: 0.85rem; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .card h2 { font-size: 0.95rem; color: var(--muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .big-num { font-size: 2rem; font-weight: 700; line-height: 1.1; }
  .big-num small { font-size: 0.8rem; color: var(--muted); font-weight: 400; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; text-align: center; }
  .kpi .kpi-val { font-size: 1.6rem; font-weight: 700; }
  .kpi .kpi-label { font-size: 0.72rem; color: var(--muted); margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  th, td { padding: 6px 10px; text-align: start; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
  tr:hover td { background: rgba(59,130,246,0.04); }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .bar-label { width: 80px; font-size: 0.78rem; color: var(--muted); text-align: end; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; height: 16px; background: rgba(255,255,255,0.04); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .bar-value { width: 60px; font-size: 0.78rem; color: var(--text); text-align: end; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 8px; font-size: 0.7rem; font-weight: 600; }
  .badge-prod { background: rgba(16,185,129,0.15); color: var(--green); }
  .badge-dev { background: rgba(139,92,246,0.15); color: var(--purple); }
  .full-width { grid-column: 1 / -1; }
  .scroll-table { max-height: 400px; overflow-y: auto; }
  footer { text-align: center; color: var(--muted); font-size: 0.75rem; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); }
</style>
</head>
<body>
  <h1><span>Manholes Mapper</span> — Codebase Metrics</h1>
  <p class="subtitle">Scanned in ${data.scanTimeMs}ms &bull; Branch: ${escHtml(data.git.currentBranch)} &bull; Last commit: ${escHtml(data.git.lastCommitDate?.slice(0, 10) || '--')}</p>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-val">${data.totalFiles.toLocaleString()}</div><div class="kpi-label">Total Files</div></div>
    <div class="kpi"><div class="kpi-val">${data.totalLoc.toLocaleString()}</div><div class="kpi-label">Lines of Code</div></div>
    <div class="kpi"><div class="kpi-val">${data.prodDepsCount}</div><div class="kpi-label">Prod Deps</div></div>
    <div class="kpi"><div class="kpi-val">${data.devDepsCount}</div><div class="kpi-label">Dev Deps</div></div>
    <div class="kpi"><div class="kpi-val">${data.testFiles.total}</div><div class="kpi-label">Test Files</div></div>
    <div class="kpi"><div class="kpi-val">${data.apiEndpoints.length}</div><div class="kpi-label">API Endpoints</div></div>
    <div class="kpi"><div class="kpi-val">${data.scripts.length}</div><div class="kpi-label">Scripts</div></div>
    <div class="kpi"><div class="kpi-val">${data.git.totalCommits.toLocaleString()}</div><div class="kpi-label">Total Commits</div></div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Files by Extension</h2>
      ${barChart(data.filesByExt, 'var(--accent)')}
    </div>
    <div class="card">
      <h2>LOC by Directory</h2>
      ${barChart(data.locByDir, 'var(--green)')}
    </div>
    <div class="card">
      <h2>LOC by Frontend Module</h2>
      ${barChart(data.locByModule, 'var(--purple)')}
    </div>
    <div class="card">
      <h2>Git — Recent 30 Days</h2>
      <div class="big-num">${data.git.recentCommits} <small>commits</small></div>
      <div style="margin-top:12px">
        <h2 style="margin-bottom:8px">Contributors</h2>
        <div class="scroll-table">
        <table>
          <thead><tr><th>Name</th><th>Commits</th></tr></thead>
          <tbody>
            ${data.git.contributors.map(c => `<tr><td>${escHtml(c.name)}</td><td>${c.commits}</td></tr>`).join('')}
          </tbody>
        </table>
        </div>
      </div>
    </div>

    <div class="card full-width">
      <h2>Top 20 Largest Files</h2>
      <table>
        <thead><tr><th>#</th><th>File</th><th>Lines</th></tr></thead>
        <tbody>
          ${data.largestFiles.map((f, i) => `<tr><td>${i + 1}</td><td>${escHtml(f.path)}</td><td>${f.lines.toLocaleString()}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Dependencies (${data.deps.length})</h2>
      <div class="scroll-table">
      <table>
        <thead><tr><th>Package</th><th>Version</th><th>Type</th></tr></thead>
        <tbody>
          ${data.deps.map(d => `<tr><td>${escHtml(d.name)}</td><td>${escHtml(d.version)}</td><td><span class="badge ${d.type === 'prod' ? 'badge-prod' : 'badge-dev'}">${d.type}</span></td></tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>

    <div class="card">
      <h2>Test Inventory</h2>
      <div style="margin-bottom:8px">
        <span class="big-num">${data.testFiles.total}</span> <small style="color:var(--muted)">files</small>
        <span style="margin-inline-start:16px;font-size:0.85rem;color:var(--muted)">${data.testFiles.unit} unit &bull; ${data.testFiles.e2e} E2E</span>
      </div>
    </div>

    <div class="card">
      <h2>API Endpoints</h2>
      <table>
        <thead><tr><th>Route</th><th>Lines</th></tr></thead>
        <tbody>
          ${data.apiEndpoints.map(e => `<tr><td>${escHtml(e.route)}</td><td>${e.lines}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Scripts (${data.scripts.length})</h2>
      <div class="scroll-table">
      <table>
        <thead><tr><th>Name</th><th>Lines</th></tr></thead>
        <tbody>
          ${data.scripts.sort((a, b) => b.lines - a.lines).map(s => `<tr><td>${escHtml(s.name)}</td><td>${s.lines}</td></tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>
  </div>

  <footer>Manholes Mapper Codebase Dashboard &bull; Auto-generated at ${new Date().toISOString().slice(0, 19)}</footer>
</body>
</html>`;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Server ──

console.log('Scanning codebase...');
const metrics = collectMetrics();
console.log(`Scan complete in ${metrics.scanTimeMs}ms — ${metrics.totalFiles} files, ${metrics.totalLoc.toLocaleString()} LOC`);

const html = renderHTML(metrics);

const server = http.createServer((req, res) => {
  if (req.url === '/api/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics, null, 2));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`\n  Codebase Dashboard: http://localhost:${PORT}\n  JSON API:           http://localhost:${PORT}/api/metrics\n`);
});
