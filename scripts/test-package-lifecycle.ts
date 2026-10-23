import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { ConnectorClient } from '../apps/web/src/connector';
import { CONNECTOR_VERSION } from '../apps/connector/src/version';

if (!['win32', 'darwin'].includes(process.platform)) throw new Error('Run on a native Windows or macOS runner.');
await mkdir('.cache/validation', { recursive: true });
const directory = await mkdtemp(resolve('.cache/validation/package lifecycle '));
const asset = resolve(`release/tongzhuo-connector-${process.platform === 'win32' ? 'windows' : 'macos'}-${process.arch}.${process.platform === 'win32' ? 'exe' : 'zip'}`);
const metadata = JSON.parse(await readFile(`${asset}.build.json`, 'utf8'));
assert.equal(metadata.version, CONNECTOR_VERSION); assert.equal(metadata.protocolVersion, 4);
assert.equal(metadata.arch, process.arch); assert.equal(metadata.platform, process.platform);
assert.equal(metadata.sha256, createHash('sha256').update(await readFile(asset)).digest('hex'));
let executable = asset;
if (process.platform === 'darwin') {
  execFileSync('/usr/bin/ditto', ['-x', '-k', asset, directory]);
  const app = join(directory, '同桌连接器.app');
  executable = join(app, 'Contents/MacOS/TongZhuoConnector');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const actual = execFileSync('/usr/bin/file', ['-L', join(app, 'Contents/Resources/runtime/node')], { encoding: 'utf8' });
  assert.ok(actual.includes(process.arch === 'arm64' ? 'arm64' : 'x86_64'), actual);
  const version = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  assert.equal(version, CONNECTOR_VERSION);
}

const probe = createServer();
await new Promise<void>(r => probe.listen(0, '127.0.0.1', r));
const port = (probe.address() as { port: number }).port;
await new Promise<void>(r => probe.close(() => r()));
const endpoint = `http://127.0.0.1:${port}`;
const audit = join(directory, 'owned.ndjson'), acpAudit = join(directory, 'acp.ndjson');
await writeFile(audit, ''); await writeFile(acpAudit, '');
const environment = { ...process.env, AGENT_GAME_PORT: String(port), AGENT_GAME_DATA_DIR: join(directory, 'data'),
  AGENT_GAME_WEB_ORIGINS: 'http://127.0.0.1:5173', CODEX_PATH: join(directory, 'missing-codex'), WORKBUDDY_PATH: join(directory, 'missing-workbuddy'),
  DSH_PATH: resolve('scripts/fixtures/lifecycle-driver.mjs'), AGENT_GAME_FIXTURE_AUDIT: acpAudit, AGENT_GAME_LIFECYCLE_AUDIT: audit,
  ...(process.platform === 'darwin' ? { PATH: '/usr/bin:/bin', AGENT_GAME_SKIP_LOGIN_PATH: '1' } : {}) };
const children: ChildProcess[] = [], clients: ConnectorClient[] = [];
let diagnostic = '';
async function until(check: () => boolean | Promise<boolean>, timeout = 40_000) {
  const end = Date.now() + timeout;
  while (!await check()) { if (Date.now() > end) throw new Error(`Lifecycle timeout: ${diagnostic.slice(-5000)}`); await new Promise(r => setTimeout(r, 80)); }
}
async function canBind() {
  const server = createServer();
  try { await new Promise<void>((r, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', r); }); return true; }
  catch { return false; }
  finally { await new Promise<void>(r => server.close(() => r())); }
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    if (process.platform === 'darwin') return !execFileSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim().startsWith('Z');
    return true;
  } catch { return false; }
}
function descendants(pid: number): number[] {
  if (process.platform === 'win32') {
    const query = `$queue = [Collections.Generic.Queue[int]]::new(); $queue.Enqueue(${pid}); $found = [Collections.Generic.List[int]]::new(); while ($queue.Count) { $parentId = $queue.Dequeue(); foreach ($item in @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $parentId")) { $found.Add([int]$item.ProcessId); $queue.Enqueue([int]$item.ProcessId) } }; ConvertTo-Json -InputObject @($found.ToArray()) -Compress`;
    return JSON.parse(execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', query], { encoding: 'utf8', windowsHide: true }));
  }
  const all = execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const found = new Set<number>([pid]);
  let added = true;
  while (added) { added = false; for (const [child, parent] of all) if (found.has(parent) && !found.has(child)) { found.add(child); added = true; } }
  found.delete(pid); return [...found];
}
function start(args: string[] = [], gui = false, extra: NodeJS.ProcessEnv = {}) {
  const child = spawn(executable, [...(gui ? [] : ['--headless']), ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...environment, ...extra } });
  child.on('error', error => { diagnostic += String(error); });
  child.stdout?.on('data', c => { diagnostic = (diagnostic + c.toString()).slice(-8000); });
  child.stderr?.on('data', c => { diagnostic = (diagnostic + c.toString()).slice(-8000); });
  children.push(child); return child;
}
async function ready() {
  try { const r = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1000) }); const data = await r.json(); return r.ok && data.version === CONNECTOR_VERSION && data.harnesses.some((h: any) => h.id === 'dsh' && h.available); }
  catch { return false; }
}
async function idlePlayer() {
  const browserFetch: typeof fetch = (url, options) => fetch(url, { ...options, headers: { ...Object.fromEntries(new Headers(options?.headers)), Origin: 'http://127.0.0.1:5173' } });
  const client = new ConnectorClient(endpoint, browserFetch); clients.push(client); await client.connect();
  const { sessionId } = await client.createSession({ scopeId: randomUUID(), playerId: 'lifecycle', kind: 'dsh', name: 'Lifecycle fixture', displayTitle: 'Lifecycle fixture', instructions: 'No inference.', tools: [{ name: 'lifecycle_probe', description: 'Lifecycle probe', inputSchema: { type: 'object' } }] });
  assert.ok(sessionId);
}
const checks: string[] = [];
try {
  assert.ok(await canBind(), 'Selected test port must be free.');
  const forced = start(); await until(ready); await idlePlayer();
  const tree = descendants(forced.pid!); assert.ok(tree.length >= (process.platform === 'darwin' ? 4 : 3));
  const records = (await readFile(audit, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(records.some(r => tree.includes(r.pid) && tree.includes(r.child)), 'Expected active ACP and stubborn grandchild.');
  const duplicate = start(); await until(() => duplicate.exitCode !== null); assert.ok(await ready(), 'Duplicate must not stop original.');
  forced.kill('SIGKILL'); // ONLY the launcher; no taskkill /T or process-group kill.
  await until(async () => tree.every(pid => !alive(pid)) && await canBind(), 12_000);
  checks.push('duplicate, launcher-only SIGKILL, ACP + stubborn grandchild cleanup, port released');
  for (const client of clients) await client.disconnect(); clients.length = 0;

  const normal = start(); await until(ready); await idlePlayer();
  const normalTree = descendants(normal.pid!); assert.ok(normalTree.length >= (process.platform === 'darwin' ? 4 : 3));
  if (process.platform === 'darwin') normal.kill('SIGTERM');
  else {
    // Windows SIGTERM is forceful. The timer exercises managed normal disposal.
    // A separate timer-driven launch is verified below as well.
    normal.kill();
  }
  await until(async () => !alive(normal.pid!) && normalTree.every(pid => !alive(pid)) && await canBind(), 12_000);
  checks.push('restart, signal shutdown, full tree and port cleanup');

  const timed = start(['--exit-after-ms=12000']); await until(ready); await idlePlayer();
  const timedTree = descendants(timed.pid!);
  await until(async () => !alive(timed.pid!) && timedTree.every(pid => !alive(pid)) && await canBind(), 20_000);
  checks.push('normal timed Quit/disposal with live ACP and grandchild, immediate port reuse');
  if (process.platform === 'darwin') {
    // Same compiled AppKit entry path as Finder, with automatic Quit. This is an
    // automated runner smoke; it does not assert menu appearance or Gatekeeper.
    const gui = start(['--exit-after-ms=8000'], true); await until(ready);
    await until(async () => !alive(gui.pid!) && await canBind(), 15_000);
    checks.push('AppKit startup and automatic Quit on runner (no manual UI acceptance)');
    const noHarness = start([], false, { DSH_PATH: join(directory, 'missing-dsh') });
    await until(async () => { try { const r = await fetch(`${endpoint}/health`); const data = await r.json(); return r.ok && !data.harnesses.some((h: any) => h.available); } catch { return false; } });
    noHarness.kill('SIGKILL'); await until(canBind, 12_000);
    checks.push('starts without installed Node or available Harness with minimal Finder PATH');
  }
  const proof = { verifiedAt: new Date().toISOString(), version: CONNECTOR_VERSION, platform: process.platform, arch: process.arch, sourceCommit: metadata.sourceCommit, asset: metadata.asset, sha256: metadata.sha256, inference: false, checks };
  await writeFile(resolve(`.cache/validation/package-${process.platform}-${process.arch}.json`), JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally {
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  // Also clean fixture descendants if an assertion failed, without targeting any
  // user Harness. The audit file only contains this invocation's fixture PIDs.
  await until(canBind, 12_000).catch(() => {});
  for (const client of clients) await client.disconnect();
  for (const line of (await readFile(audit, 'utf8')).trim().split('\n').filter(Boolean)) for (const pid of Object.values(JSON.parse(line)) as number[]) { try { process.kill(pid, 'SIGKILL'); } catch {} }
}
