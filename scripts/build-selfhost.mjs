import { build } from 'esbuild';

await build({
  entryPoints: {
    server: 'selfhost/server.ts',
    cli: 'selfhost/cli.ts',
    preflight: 'selfhost/preflight.ts',
  },
  outdir: 'dist/selfhost',
  entryNames: '[name]',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'bundle',
  external: ['better-sqlite3'],
  logLevel: 'info',
});
