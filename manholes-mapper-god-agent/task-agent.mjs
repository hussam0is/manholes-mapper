#!/usr/bin/env node
/**
 * ClickUp Task Agent — Autonomous Task Runner via Claude Agent SDK
 *
 * Polls ClickUp for tasks with status "Open"/"open"/"backlog",
 * spawns Claude Code via Agent SDK to implement each task,
 * commits/pushes to dev, and updates ClickUp status.
 *
 * Usage:
 *   npm run task-agent
 *   node manholes-mapper-god-agent/task-agent.mjs
 *
 * Stop: Ctrl+C (saves state gracefully)
 *
 * Env vars (in .env.local):
 *   CLICKUP_API_TOKEN     — ClickUp personal token (required)
 *   ANTHROPIC_API_KEY     — Anthropic API key (required by Agent SDK)
 *   TASK_AGENT_POLL_MS    — Poll interval in ms (default: 120000 = 2 min)
 *   TASK_AGENT_MAX_TURNS  — Max agent turns per task (default: 50)
 *   TASK_AGENT_MAX_BUDGET — Max USD per task (default: 5)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClickUpPoller } from './clickup-poller.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(__dirname, 'task-agent-state.json');

// ── Load env vars from .env.local ──────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ── Config ─────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = parseInt(process.env.TASK_AGENT_POLL_MS || '120000', 10);
const MAX_TURNS = parseInt(process.env.TASK_AGENT_MAX_TURNS || '50', 10);
const MAX_BUDGET = parseFloat(process.env.TASK_AGENT_MAX_BUDGET || '5');
const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN;
const LIST_ID = '901815260471';
const OPEN_STATUSES = ['open', 'backlog'];

// ── Logging ────────────────────────────────────────────────────────────────
const COLORS = { reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', magenta: '\x1b[35m' };

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(level, msg) {
  const colors = { INFO: COLORS.green, WARN: COLORS.yellow, ERROR: COLORS.red, TASK: COLORS.cyan, SDK: COLORS.magenta };
  const color = colors[level] || COLORS.reset;
  console.log(`${COLORS.dim}[${timestamp()}]${COLORS.reset} ${color}[${level}]${COLORS.reset} ${msg}`);
}

// ── State persistence ──────────────────────────────────────────────────────
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      return {
        processedIds: new Set(raw.processedIds || []),
        stats: {
          totalCostUsd: raw.stats?.totalCostUsd || 0,
          tasksProcessed: raw.stats?.tasksProcessed || 0,
          tasksErrored: raw.stats?.tasksErrored || 0,
          lastRun: raw.stats?.lastRun || null,
        },
      };
    }
  } catch (e) {
    log('WARN', `Failed to load state: ${e.message}`);
  }
  return {
    processedIds: new Set(),
    stats: { totalCostUsd: 0, tasksProcessed: 0, tasksErrored: 0, lastRun: null },
  };
}

function saveState(state) {
  try {
    const serializable = {
      processedIds: [...state.processedIds],
      stats: state.stats,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(serializable, null, 2));
    log('INFO', `State saved (${state.processedIds.size} processed tasks)`);
  } catch (e) {
    log('ERROR', `Failed to save state: ${e.message}`);
  }
}

// ── Build task prompt ──────────────────────────────────────────────────────
function buildTaskPrompt(task) {
  const description = task.description || '(no description)';
  const priority = task.priority?.priority || task.priority || 'none';

  return `# ClickUp Task: ${task.name}

**Task ID:** ${task.id}
**Priority:** ${priority}
**URL:** ${task.url || 'N/A'}

## Description

${description}

---

## Your Mission

You are an autonomous agent. Complete this task by following these 4 phases:

### Phase 1: PLAN
- Read the task description carefully
- Explore the codebase to understand what needs to change
- Write a 3-5 bullet plan of what you will do

### Phase 2: IMPLEMENT
- Make the code changes following CLAUDE.md conventions
- Keep changes minimal and focused on the task
- Follow existing code patterns and style

### Phase 3: VERIFY
- Run \`npm run lint\` and fix any lint errors
- Run \`npm run test:run\` and fix any test failures
- If lint or tests fail, fix the issues before proceeding

### Phase 4: COMMIT & PUSH
- Stage only the files you changed: \`git add <specific files>\`
- Commit with a descriptive message referencing the task
- Push to the dev branch: \`git push origin HEAD:dev\`

**Important:** Complete ALL 4 phases. Do not stop after implementing — you MUST verify and push.`;
}

// ── Autonomy instructions appended to system prompt ────────────────────────
const AUTONOMY_APPEND = `
## Autonomous Task Agent Rules

You are running as an AUTONOMOUS agent. Follow these rules strictly:

1. **Never ask questions** — make reasonable decisions and proceed.
2. **Always plan before coding** — spend time reading relevant files first.
3. **Always run lint and tests** after making changes (\`npm run lint\`, \`npm run test:run\`).
4. **Always commit and push** — stage specific files, write a clear commit message, push to dev.
5. **Never force-push** or use destructive git operations.
6. **Follow CLAUDE.md** conventions for code style, i18n, RTL, mobile-first.
7. **Keep changes minimal** — only change what the task requires.
8. If tests or lint fail, fix the issues. Do not skip verification.
9. Use the /manholes-mapper-god skill knowledge if you need deep codebase context.
`;

// ── Run a single task via Agent SDK ────────────────────────────────────────
async function runTask(task, state) {
  log('TASK', `Starting: "${task.name}" (${task.id})`);

  // Lazy-import Agent SDK (may not be installed yet)
  let query;
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    query = sdk.query;
  } catch (e) {
    log('ERROR', `Agent SDK not installed. Run: npm install @anthropic-ai/claude-agent-sdk`);
    throw new Error('Agent SDK not available');
  }

  const prompt = buildTaskPrompt(task);
  const messages = [];
  let costUsd = 0;
  let success = false;

  try {
    const conversation = query({
      prompt,
      options: {
        systemPrompt: { type: 'preset', preset: 'claude_code', append: AUTONOMY_APPEND },
        settingSources: ['project'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        model: 'claude-opus-4-6',
        maxTurns: MAX_TURNS,
        maxBudgetUsd: MAX_BUDGET,
        cwd: PROJECT_ROOT,
      },
    });

    for await (const message of conversation) {
      messages.push(message);

      if (message.type === 'assistant') {
        // Log assistant text (truncated)
        const text = (message.message?.content || [])
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('')
          .slice(0, 200);
        if (text) log('SDK', text.replace(/\n/g, ' '));
      } else if (message.type === 'result') {
        costUsd = message.costUsd || 0;
        log('INFO', `Agent finished. Cost: $${costUsd.toFixed(4)}, Turns: ${message.turnCount || '?'}`);
        success = true;
      }
    }
  } catch (e) {
    log('ERROR', `Agent SDK error: ${e.message}`);
    throw e;
  }

  state.stats.totalCostUsd += costUsd;

  return { success, costUsd, messageCount: messages.length };
}

// ── Poll cycle ─────────────────────────────────────────────────────────────
async function pollAndProcess(poller, state) {
  log('INFO', 'Polling ClickUp...');

  let tasks;
  try {
    tasks = await poller.fetchTasks();
  } catch (e) {
    log('ERROR', `ClickUp poll failed: ${e.message}`);
    return;
  }

  // Filter to open tasks not yet processed
  const openTasks = tasks.filter(
    t => OPEN_STATUSES.includes(t.status.toLowerCase()) && !state.processedIds.has(t.id)
  );

  log('INFO', `Found ${tasks.length} total tasks, ${openTasks.length} open & unprocessed`);

  if (openTasks.length === 0) return;

  // Pick oldest unprocessed task (by dateCreated)
  openTasks.sort((a, b) => (a.dateCreated || '0') - (b.dateCreated || '0'));
  const task = openTasks[0];

  log('TASK', `Picked task: "${task.name}" (${task.id})`);

  // Fetch full task details (full description, not truncated)
  let fullTask;
  try {
    fullTask = await poller.getTask(task.id);
  } catch (e) {
    log('ERROR', `Failed to fetch task details: ${e.message}`);
    state.processedIds.add(task.id);
    state.stats.tasksErrored++;
    saveState(state);
    return;
  }

  // Update ClickUp → "in progress"
  try {
    await poller.updateTaskStatus(task.id, 'in progress');
    log('INFO', `ClickUp status → "in progress"`);
  } catch (e) {
    log('WARN', `Failed to update ClickUp status: ${e.message}`);
  }

  // Run the task via Agent SDK
  let result;
  try {
    result = await runTask(fullTask, state);
  } catch (e) {
    log('ERROR', `Task failed: ${e.message}`);
    state.processedIds.add(task.id);
    state.stats.tasksErrored++;
    saveState(state);
    return;
  }

  // Mark as processed
  state.processedIds.add(task.id);
  state.stats.tasksProcessed++;
  state.stats.lastRun = new Date().toISOString();

  // Update ClickUp → "success in dev"
  if (result.success) {
    try {
      await poller.updateTaskStatus(task.id, 'success in dev');
      log('INFO', `ClickUp status → "success in dev"`);
    } catch (e) {
      log('WARN', `Failed to update ClickUp status: ${e.message}`);
    }
  }

  saveState(state);
  log('TASK', `Completed: "${task.name}" (cost: $${result.costUsd.toFixed(4)}, messages: ${result.messageCount})`);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`
${COLORS.cyan}╔══════════════════════════════════════════════╗
║       ClickUp Task Agent — Autonomous        ║
║       Claude Agent SDK Task Runner            ║
╚══════════════════════════════════════════════╝${COLORS.reset}
`);

  // Preflight checks
  if (!CLICKUP_TOKEN) {
    log('ERROR', 'CLICKUP_API_TOKEN not set in .env.local');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    log('INFO', 'No ANTHROPIC_API_KEY — using Claude Code OAuth session');
  }

  log('INFO', `Poll interval: ${POLL_INTERVAL_MS / 1000}s | Max turns: ${MAX_TURNS} | Max budget: $${MAX_BUDGET}`);
  log('INFO', `Project root: ${PROJECT_ROOT}`);

  const poller = new ClickUpPoller(CLICKUP_TOKEN, LIST_ID);
  const state = loadState();

  log('INFO', `Loaded state: ${state.processedIds.size} previously processed tasks`);
  log('INFO', `Cumulative stats: ${state.stats.tasksProcessed} processed, ${state.stats.tasksErrored} errored, $${state.stats.totalCostUsd.toFixed(4)} spent`);

  // Graceful shutdown
  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    log('INFO', 'Shutting down...');
    clearInterval(pollTimer);
    saveState(state);
    log('INFO', `Final stats: ${state.stats.tasksProcessed} processed, ${state.stats.tasksErrored} errored, $${state.stats.totalCostUsd.toFixed(4)} spent`);
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Initial poll
  await pollAndProcess(poller, state);

  // Recurring poll
  const pollTimer = setInterval(() => {
    pollAndProcess(poller, state).catch(e => {
      log('ERROR', `Unhandled poll error: ${e.message}`);
    });
  }, POLL_INTERVAL_MS);

  log('INFO', `Daemon running. Next poll in ${POLL_INTERVAL_MS / 1000}s. Press Ctrl+C to stop.`);
}

main().catch(e => {
  log('ERROR', `Fatal: ${e.message}`);
  process.exit(1);
});
