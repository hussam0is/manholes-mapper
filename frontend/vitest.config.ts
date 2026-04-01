import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Tests import from "../api/_lib/..." or "../../api/_lib/..." which resolves
      // relative to frontend/tests/. The actual API files live at the repo root
      // under api/_lib/. This alias rewrites those imports to the correct location.
      '../../api/_lib': path.resolve(__dirname, '../api/_lib'),
      '../api/_lib': path.resolve(__dirname, '../api/_lib'),
      // The auth.js module imports from ../../lib/auth.js (relative to api/_lib/)
      '../../lib/auth.js': path.resolve(__dirname, '../lib/auth.js'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Increase timeout for database integration tests
    testTimeout: 30000,
    // Limit worker pool to prevent worker crashes on Windows due to memory pressure
    pool: 'forks',
    maxWorkers: 4,
    // Exclude Playwright E2E tests and API integration tests (need POSTGRES_URL)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/tests/e2e/**',
      '**/tests/api/**',
    ],
  },
});
