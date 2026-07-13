#!/usr/bin/env node
// PostToolUse hook: after any shell command that ran `git push`, remind Claude to
// promote the dev preview to production (project rule: every push to dev gets promoted).
// Reads the hook payload from stdin and emits additionalContext JSON; always exits 0
// so it never blocks the tool result.

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const cmd = String(input?.tool_input?.command ?? '');
  if (!/\bgit\b[^\n;&|]*\bpush\b/.test(cmd)) process.exit(0);

  const context = [
    'A `git push` just ran. Project rule: every commit pushed to the dev branch must be',
    'promoted to production on Vercel. If this push targeted dev and you have not already',
    'promoted it this turn (and this push is not itself a mid-promote step like an',
    'APP_VERSION bump), run the vercel-promote skill now',
    '(.claude/skills/vercel-promote/SKILL.md): wait for the dev preview build to be Ready,',
    'promote it (Vercel MCP if connected, else `npx vercel promote <preview-url> --scope',
    'hussam0is-projects --yes`), then verify https://manholes-mapper.vercel.app/api/health.',
  ].join(' ');

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: context,
      },
    }),
  );
  process.exit(0);
});
