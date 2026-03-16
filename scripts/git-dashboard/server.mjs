#!/usr/bin/env node
/**
 * Git Network Graph Dashboard — Internal Use
 * Run: node scripts/git-dashboard/server.mjs
 * Open: http://localhost:5001
 */

import http from 'node:http';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 5001;
const REPO_ROOT = join(__dirname, '..', '..');

function getGitData() {
  const SEP = '‖';
  const format = ['%H', '%h', '%P', '%s', '%an', '%ae', '%aI', '%D'].join(SEP);

  const logRaw = execSync(
    `git log --all --topo-order --format="${format}" -n 500`,
    { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );

  const commits = logRaw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, parents, subject, authorName, authorEmail, date, refs] =
        line.split(SEP);
      return {
        hash,
        shortHash,
        parents: parents ? parents.split(' ') : [],
        subject,
        authorName,
        authorEmail,
        date,
        refs: refs
          ? refs
              .split(',')
              .map((r) => r.trim())
              .filter(Boolean)
          : [],
      };
    });

  // branches
  const branchesRaw = execSync('git branch -a --format="%(refname:short) %(objectname:short)"', {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  const branches = branchesRaw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(' ');
      return { name: parts[0], commit: parts[1] };
    });

  // tags
  let tags = [];
  try {
    const tagsRaw = execSync('git tag --format="%(refname:short) %(objectname:short)"', {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    tags = tagsRaw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(' ');
        return { name: parts[0], commit: parts[1] };
      });
  } catch {
    /* no tags */
  }

  // current branch
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  }).trim();

  return { commits, branches, tags, currentBranch };
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/graph') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    try {
      const data = getGitData();
      res.end(JSON.stringify(data));
    } catch (err) {
      res.end(JSON.stringify({ error: err.message }));
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readFileSync(join(__dirname, 'index.html'), 'utf-8'));
  }
});

server.listen(PORT, () => {
  console.log(`Git Dashboard running at http://localhost:${PORT}`);
});
