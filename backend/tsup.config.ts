import path from 'node:path';
import { defineConfig } from 'tsup';

const SHARED_ENTRY = path.resolve(__dirname, '../shared/src/index.ts');

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @novafin/shared ships TypeScript source, so it is bundled into the server build.
  noExternal: ['@novafin/shared'],
  // Runtime packages used by shared stay external and resolve from the workspace node_modules.
  external: ['decimal.js', 'zod'],
  esbuildPlugins: [
    {
      // Resolve the workspace package directly by path. This also keeps the build working when a
      // stray Yarn Plug'n'Play manifest (.pnp.cjs) exists in a parent directory, which esbuild would
      // otherwise use to reject the bare "@novafin/shared" import.
      name: 'novafin-shared-resolver',
      setup(build) {
        build.onResolve({ filter: /^@novafin\/shared$/ }, () => ({ path: SHARED_ENTRY }));
      },
    },
  ],
});
