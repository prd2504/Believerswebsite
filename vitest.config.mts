/**
 * Test runner config for the whole monorepo.
 *
 * Tests import the TypeScript SOURCE directly — `@bba/shared` is aliased to
 * shared/src, the same thing functions/build.mjs and the webapp's Vite config
 * do. So a test run needs no build step, and there is no stale shared/dist to
 * silently test against instead of the code being shipped.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@bba/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
