import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Generate the ACP extension before the connector is started in development.
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit', windowsHide: true });

const children = [
  spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'watch', 'apps/connector/src/index.ts'], { stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { stdio: 'inherit', windowsHide: true }),
];
const shutdown = () => { for (const child of children) child.kill(); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
for (const child of children) child.on('exit', code => { if (code) { shutdown(); process.exitCode = code; } });
