#!/usr/bin/env node
// PostToolUse hook: after any shell command that ran `git push`, remind Claude to
// verify the auto-deploy to production (project rule: every push to dev gets verified —
// dev IS the production branch since 2026-07-15, no promote step).
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
    'A `git push` just ran. Since 2026-07-15 the dev branch IS the production branch on the',
    'new Vercel team (gis-6579s-projects) — every push to dev auto-deploys to production.',
    'If this push targeted dev and you have not already verified it this turn (and this push',
    'is not itself a mid-verify step like an APP_VERSION bump), run the vercel-promote skill',
    'now (.claude/skills/vercel-promote/SKILL.md): wait for the production build to be Ready,',
    'then verify https://manholes-mapper-three.vercel.app/api/health returns 200.',
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
