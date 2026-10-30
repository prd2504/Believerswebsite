import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'lib/index.js',
  sourcemap: true,
  // Resolve @bba/shared directly from source so it gets bundled inline.
  // Cloud Build never sees it as a separate package.
  alias: {
    '@bba/shared': resolve(__dirname, '../shared/src/index.ts'),
  },
  // These are installed in the Cloud Functions runtime — don't bundle them.
  external: [
    'firebase-admin',
    'firebase-admin/*',
    'firebase-functions',
    'firebase-functions/*',
  ],
});

console.log('functions bundle written to lib/index.js');
