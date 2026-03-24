import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // api/_lib lives at the repo root, not inside frontend/
      '../../api/_lib': path.resolve(__dirname, '../api/_lib'),
      '../api/_lib': path.resolve(__dirname, '../api/_lib'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Increase timeout for database integration tests
    testTimeout: 30000,
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
