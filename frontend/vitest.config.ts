import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Project root is one level up from frontend/
const projectRoot = path.resolve(__dirname, '..');

export default defineConfig({
  resolve: {
    alias: [
      // Tests in frontend/tests/ import ../../api/_lib/* which resolves inside frontend/
      // but the api/ dir lives at project root — redirect to the correct location
      { find: /^(\.\.\/)+api\//, replacement: path.resolve(projectRoot, 'api') + '/' },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Increase timeout for database integration tests
    testTimeout: 30000,
    // Exclude Playwright E2E tests
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/tests/e2e/**',
    ],
  },
});
