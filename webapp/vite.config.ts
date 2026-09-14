import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vite config for @bba/webapp.
 *
 * - The dev server runs on port 5173.
 * - `@/` resolves to ./src for short imports.
 * - `@bba/shared` resolves to the /shared source so edits to shared types are reflected
 *   instantly without a separate build step.
 *
 * Note: we use `import.meta.url` instead of `__dirname` because webapp/package.json has
 * `"type": "module"` — `__dirname` is not available in ESM context.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@bba/shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
