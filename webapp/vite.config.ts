import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vite config for @bba/webapp.
 *
 * - The dev server runs on port 5173.
 * - `@/` resolves to ./src for short imports.
 * - `@bba/shared` resolves to the /shared source so edits to shared types are reflected
 *   instantly without a separate build step.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@bba/shared': path.resolve(__dirname, '../shared/src'),
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
