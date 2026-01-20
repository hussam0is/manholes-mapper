import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Increase timeout for database integration tests
    testTimeout: 30000,
  },
});
