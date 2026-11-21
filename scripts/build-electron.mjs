import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'dist-electron');
const enableSourceMap = process.env.ACCS_SOURCEMAP === '1';

mkdirSync(outDir, { recursive: true });
if (!enableSourceMap) {
  rmSync(resolve(outDir, 'main.js.map'), { force: true });
  rmSync(resolve(outDir, 'preload.js.map'), { force: true });
}

await Promise.all([
  build({
    entryPoints: [resolve(root, 'electron/main.ts')],
    outfile: resolve(outDir, 'main.js'),
    bundle: true,
    minify: true,
    treeShaking: true,
    legalComments: 'none',
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    sourcemap: enableSourceMap,
    target: 'node20',
  }),
  build({
    entryPoints: [resolve(root, 'electron/preload.ts')],
    outfile: resolve(outDir, 'preload.js'),
    bundle: true,
    minify: true,
    treeShaking: true,
    legalComments: 'none',
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    sourcemap: enableSourceMap,
    target: 'node20',
  }),
]);

console.log('[build-electron] Built minified main.js and preload.js');
