#!/usr/bin/env node
/**
 * Manholes Mapper — God Mode Daemon
 *
 * Interactive agent that monitors ClickUp tasks and manages project memory.
 *
 * Features:
 * - Polls ClickUp every 30 minutes for open/backlog tasks
 * - Interactive CLI for user commands
 * - Manages long-term and short-term memory files
 * - Writes actionable task summaries for Claude Code /manholes-mapper-god skill
 *
 * Usage:
 *   npm run god-mode
 *   node manholes-mapper-god-agent/daemon.mjs
 *
 * Stop: Ctrl+C or type "exit"
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { MemoryManager } from './memory-manager.mjs';
import { ClickUpPoller } from './clickup-poller.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

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
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN;
const LIST_ID = '901815260471';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  startTime: new Date(),
  pollCount: 0,
  lastPollTime: null,
  lastPollResult: null,
  isPolling: false,
  chatHistory: [],
};

// ── Initialize subsystems ──────────────────────────────────────────────────
const memory = new MemoryManager(__dirname);
const poller = new ClickUpPoller(CLICKUP_TOKEN, LIST_ID);

// ── Formatting helpers ─────────────────────────────────────────────────────
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function log(msg, color = '') {
  console.log(`${DIM}[${timestamp()}]${RESET} ${color}${msg}${RESET}`);
}

function banner() {
  console.log(`
${CYAN}${BOLD}  ╔══════════════════════════════════════════════╗
  ║     Manholes Mapper — God Mode Daemon        ║
  ║     Interactive Project Management Agent      ║
  ╚══════════════════════════════════════════════╝${RESET}

  ${DIM}ClickUp List:${RESET}  ${LIST_ID}
  ${DIM}Poll Interval:${RESET} 30 minutes
  ${DIM}Token:${RESET}         ${CLICKUP_TOKEN ? GREEN + 'loaded' + RESET : RED + 'MISSING (set CLICKUP_API_TOKEN in .env.local)' + RESET}
  ${DIM}Memory Dir:${RESET}    ${__dirname}

  ${DIM}Type ${BOLD}help${RESET}${DIM} for commands. Press Ctrl+C to exit.${RESET}
`);
}

// ── ClickUp Poll Cycle ─────────────────────────────────────────────────────
async function pollClickUp(silent = false) {
  if (!CLICKUP_TOKEN) {
    if (!silent) log('No CLICKUP_API_TOKEN — skipping poll', RED);
    return null;
  }
  if (state.isPolling) {
    if (!silent) log('Poll already in progress...', YELLOW);
    return null;
  }

  state.isPolling = true;
  if (!silent) log('Polling ClickUp for open tasks...', CYAN);

  try {
    const tasks = await poller.fetchTasks();
    state.pollCount++;
    state.lastPollTime = new Date();
    state.lastPollResult = tasks;

    const open = tasks.filter(t => ['open', 'backlog', 'Open'].includes(t.status));
    const inProgress = tasks.filter(t => t.status === 'in progress');
    const help = tasks.filter(t => t.status === 'help');
    const actionable = [...open, ...help];

    if (!silent) {
      log(`Poll #${state.pollCount} complete: ${tasks.length} total, ${open.length} open, ${inProgress.length} in progress, ${help.length} need help`, GREEN);
      if (actionable.length > 0) {
        log(`${BOLD}Actionable tasks:${RESET}`, YELLOW);
        for (const t of actionable) {
          console.log(`  ${YELLOW}[${t.status}]${RESET} ${t.name} ${DIM}(${t.id})${RESET}`);
        }
      }
    }

    // Update short-term memory with poll results
    memory.updateShortTerm({
      lastPoll: state.lastPollTime.toISOString(),
      pollCount: state.pollCount,
      totalTasks: tasks.length,
      openTasks: open.map(t => ({ id: t.id, name: t.name, status: t.status })),
      inProgressTasks: inProgress.map(t => ({ id: t.id, name: t.name })),
      helpTasks: help.map(t => ({ id: t.id, name: t.name })),
    });

    return { tasks, open, inProgress, help };
  } catch (err) {
    if (!silent) log(`Poll failed: ${err.message}`, RED);
    return null;
  } finally {
    state.isPolling = false;
  }
}

// ── Command Handlers ───────────────────────────────────────────────────────
const commands = {
  help() {
    console.log(`
${BOLD}Available Commands:${RESET}
  ${GREEN}status${RESET}       Show daemon status and last poll
  ${GREEN}tasks${RESET}        List all ClickUp tasks
  ${GREEN}open${RESET}         Show only open/backlog/help tasks
  ${GREEN}progress${RESET}     Show in-progress tasks
  ${GREEN}poll${RESET}         Force immediate ClickUp poll
  ${GREEN}memory${RESET}       Show current memory state
  ${GREEN}ltm${RESET}          Show long-term memory
  ${GREEN}stm${RESET}          Show short-term memory
  ${GREEN}note <text>${RESET}  Add a note to short-term memory
  ${GREEN}learn <text>${RESET} Add insight to long-term memory
  ${GREEN}chat <msg>${RESET}   Log a message for /manholes-mapper-god context
  ${GREEN}save${RESET}         Force save all memory files
  ${GREEN}clear-stm${RESET}    Clear short-term memory (keeps long-term)
  ${GREEN}exit${RESET}         Stop daemon and save state
`);
  },

  status() {
    const uptime = Math.round((Date.now() - state.startTime.getTime()) / 60000);
    console.log(`
${BOLD}Daemon Status:${RESET}
  Uptime:      ${uptime} minutes
  Poll count:  ${state.pollCount}
  Last poll:   ${state.lastPollTime ? state.lastPollTime.toLocaleTimeString() : 'never'}
  Next poll:   ~${state.lastPollTime ? Math.max(0, Math.round((POLL_INTERVAL_MS - (Date.now() - state.lastPollTime.getTime())) / 60000)) : 0} minutes
  Chat msgs:   ${state.chatHistory.length}
  Token:       ${CLICKUP_TOKEN ? 'present' : 'MISSING'}
`);
  },

  async tasks() {
    const result = state.lastPollResult;
    if (!result || result.length === 0) {
      log('No tasks cached. Run "poll" first.', YELLOW);
      return;
    }
    console.log(`\n${BOLD}All Tasks (${result.length}):${RESET}`);
    const grouped = {};
    for (const t of result) {
      if (!grouped[t.status]) grouped[t.status] = [];
      grouped[t.status].push(t);
    }
    for (const [status, tasks] of Object.entries(grouped)) {
      const color = status === 'in progress' ? CYAN : status.includes('success') ? GREEN : status === 'Open' ? YELLOW : RED;
      console.log(`\n  ${color}${BOLD}${status.toUpperCase()}${RESET} (${tasks.length})`);
      for (const t of tasks) {
        console.log(`    ${t.name} ${DIM}(${t.id})${RESET}`);
      }
    }
    console.log('');
  },

  async open() {
    const result = state.lastPollResult;
    if (!result) { log('No tasks cached. Run "poll" first.', YELLOW); return; }
    const actionable = result.filter(t => ['open', 'backlog', 'Open', 'help'].includes(t.status));
    if (actionable.length === 0) {
      log('No open/backlog/help tasks!', GREEN);
      return;
    }
    console.log(`\n${BOLD}Actionable Tasks (${actionable.length}):${RESET}`);
    for (const t of actionable) {
      const color = t.status === 'help' ? RED : YELLOW;
      console.log(`  ${color}[${t.status}]${RESET} ${t.name} ${DIM}(${t.id})${RESET}`);
    }
    console.log('');
  },

  async progress() {
    const result = state.lastPollResult;
    if (!result) { log('No tasks cached. Run "poll" first.', YELLOW); return; }
    const ip = result.filter(t => t.status === 'in progress');
    if (ip.length === 0) { log('No tasks in progress.', GREEN); return; }
    console.log(`\n${BOLD}In Progress (${ip.length}):${RESET}`);
    for (const t of ip) {
      console.log(`  ${CYAN}[in progress]${RESET} ${t.name} ${DIM}(${t.id})${RESET}`);
    }
    console.log('');
  },

  async poll() {
    await pollClickUp(false);
  },

  memory() {
    const ltm = memory.readLongTerm();
    const stm = memory.readShortTerm();
    console.log(`\n${BOLD}Memory Summary:${RESET}`);
    console.log(`  Long-term:  ${ltm.split('\n').length} lines`);
    console.log(`  Short-term: ${stm.split('\n').length} lines`);
    console.log(`  Chat log:   ${state.chatHistory.length} messages\n`);
  },

  ltm() {
    const content = memory.readLongTerm();
    console.log(`\n${BOLD}Long-Term Memory:${RESET}\n${DIM}${'─'.repeat(60)}${RESET}`);
    console.log(content);
    console.log(`${DIM}${'─'.repeat(60)}${RESET}\n`);
  },

  stm() {
    const content = memory.readShortTerm();
    console.log(`\n${BOLD}Short-Term Memory:${RESET}\n${DIM}${'─'.repeat(60)}${RESET}`);
    console.log(content);
    console.log(`${DIM}${'─'.repeat(60)}${RESET}\n`);
  },

  note(text) {
    if (!text) { log('Usage: note <text>', YELLOW); return; }
    memory.appendShortTermNote(text);
    log(`Note saved to short-term memory`, GREEN);
  },

  learn(text) {
    if (!text) { log('Usage: learn <text>', YELLOW); return; }
    memory.appendLongTermInsight(text);
    log(`Insight saved to long-term memory`, GREEN);
  },

  chat(text) {
    if (!text) { log('Usage: chat <message>', YELLOW); return; }
    const entry = { time: new Date().toISOString(), role: 'user', content: text };
    state.chatHistory.push(entry);
    memory.appendChatMessage(entry);
    log(`Message logged (${state.chatHistory.length} total). Will be available to /manholes-mapper-god.`, GREEN);
  },

  save() {
    memory.saveAll(state);
    log('All memory files saved.', GREEN);
  },

  'clear-stm'() {
    memory.clearShortTerm();
    log('Short-term memory cleared.', GREEN);
  },
};

// ── Main Loop ──────────────────────────────────────────────────────────────
async function main() {
  banner();

  // Initial poll
  await pollClickUp(false);

  // Start 30-minute poll timer
  const pollTimer = setInterval(() => pollClickUp(false), POLL_INTERVAL_MS);

  // Interactive readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${CYAN}god>${RESET} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }

    const [cmd, ...rest] = trimmed.split(/\s+/);
    const arg = rest.join(' ');

    if (cmd === 'exit' || cmd === 'quit') {
      log('Saving state and shutting down...', YELLOW);
      memory.saveAll(state);
      clearInterval(pollTimer);
      rl.close();
      process.exit(0);
    }

    const handler = commands[cmd];
    if (handler) {
      try {
        await handler(arg);
      } catch (err) {
        log(`Error: ${err.message}`, RED);
      }
    } else {
      // Treat unknown input as a chat message
      const entry = { time: new Date().toISOString(), role: 'user', content: trimmed };
      state.chatHistory.push(entry);
      memory.appendChatMessage(entry);
      log(`Message logged. Run /manholes-mapper-god in Claude Code to process it.`, DIM);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    log('Saving state and shutting down...', YELLOW);
    memory.saveAll(state);
    clearInterval(pollTimer);
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('');
    log('Received SIGINT. Saving and exiting...', YELLOW);
    memory.saveAll(state);
    clearInterval(pollTimer);
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
