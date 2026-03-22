/**
 * Vitest setup file
 * 
 * Loads environment variables from .env.local before tests run.
 */

import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Verify required environment variables are set
const requiredVars = ['POSTGRES_URL'];
const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.warn(
    `Warning: Missing environment variables for integration tests: ${missing.join(', ')}\n` +
    'Some tests may be skipped. Make sure .env.local is configured.'
  );
}
