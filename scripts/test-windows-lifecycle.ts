import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { ConnectorClient } from '../apps/web/src/connector';

if (process.platform !== 'win32') throw new Error('Windows-only lifecycle check.');
const port = 3331;
const endpoint = `http://127.0.0.1:${port}`;
const executable = resolve('release/同桌连接器.exe');
const browserOrigin = process.env.LIFECYCLE_WEB_ORIGIN ?? 'http://127.0.0.1:5173';
const browserFetch: typeof fetch = (url, options) => fetch(url, { ...options, headers: { ...Object.fromEntries(new Headers(options?.headers).entries()), Origin: browserOrigin } });
const children: ChildProcess[] = [];
async function waitFor(check: () => Promise<boolean>, timeout = 20_000) {
  const start = Date.now(); while (!await check()) { if (Date.now() - start > timeout) throw new Error('Lifecycle condition timed out'); await new Promise(resolve => setTimeout(resolve, 100)); }
}
async function ready() {
  try { const r = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1000) }); return r.ok && (await r.json() as any).auth === 'chatgpt'; } catch { return false; }
}
async function canBind() {
  const server = createServer();
  try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return true; }
  catch { return false; }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
function alive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
function descendants(pid: number): number[] {
  // Query only the launcher's descendants; no unrelated process arguments are read.
  const command = `$queue = [Collections.Generic.Queue[int]]::new(); $queue.Enqueue(${pid}); $found = [Collections.Generic.List[int]]::new(); while ($queue.Count) { $parentId = $queue.Dequeue(); foreach ($item in @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $parentId")) { $found.Add([int]$item.ProcessId); $queue.Enqueue([int]$item.ProcessId) } }; ConvertTo-Json -InputObject @($found.ToArray()) -Compress`;
  return JSON.parse(execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8' }).trim());
}
function start(args: string[]) {
  const child = spawn(executable, ['--headless', ...args], { windowsHide: true, stdio: 'ignore', env: { ...process.env, AGENT_GAME_PORT: String(port) } });
  children.push(child); return child;
}
async function idlePlayer() {
  const client = new ConnectorClient(endpoint, browserFetch); await client.connect();
  const { sessionId } = await client.createSession({ roomId: randomUUID(), seat: 0, kind: 'codex-acp', name: '生命周期测试' });
  assert.ok(sessionId); return client;
}
try {
  assert.equal(await canBind(), true, 'Lifecycle test port is already occupied.');
  const forced = start([]); await waitFor(ready); const firstClient = await idlePlayer();
  const firstTree = descendants(forced.pid!); assert.ok(firstTree.length >= 3, 'Expected connector + ACP + Codex descendants.');
  console.log(`Force-exit check: ${firstTree.length} owned descendants, including a live ACP/Codex session.`);
  // Kill ONLY the launcher. Passing /T here would mask a broken Job Object.
  forced.kill();
  await waitFor(async () => firstTree.every(pid => !alive(pid)) && await canBind(), 10_000);
  await firstClient.disconnect();
  console.log('PASS: force-killing the EXE alone killed all descendants and released the listening port.');

  const normal = start(['--exit-after-ms=10000']); await waitFor(ready); const secondClient = await idlePlayer();
  const secondTree = descendants(normal.pid!); assert.ok(secondTree.length >= 3);
  await waitFor(async () => !alive(normal.pid!) && secondTree.every(pid => !alive(pid)) && await canBind(), 20_000);
  await secondClient.disconnect();
  console.log('PASS: normal disposal killed all descendants and released the listening port.');

  const restarted = start([]); await waitFor(ready); restarted.kill(); await waitFor(canBind, 10_000);
  console.log('PASS: the same port can be used immediately after restart. No installer or Node.js dependency.');
} finally { for (const child of children) if (child.exitCode === null) child.kill(); }
