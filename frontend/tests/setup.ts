/**
 * Vitest setup file
 * 
 * Loads environment variables from .env.local before tests run.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

// Load environment variables from the repo-root .env.local. Vitest normally runs
// with cwd=frontend/ (where no .env.local exists), so fall back to the parent dir.
const envFile = [resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '../.env.local')].find(existsSync);
if (envFile) config({ path: envFile });

// Verify required environment variables are set
const requiredVars = ['POSTGRES_URL'];
const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.warn(
    `Warning: Missing environment variables for integration tests: ${missing.join(', ')}\n` +
    'Some tests may be skipped. Make sure .env.local is configured.'
  );
}
