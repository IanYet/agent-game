import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { ConnectorClient } from '../apps/web/src/connector';
import { GameController } from '../apps/web/src/controller';
import { CONNECTOR_VERSION } from '../apps/connector/src/version';

// Explicit real-account inference against the FINAL EXE, never an npm test fixture.
// The human seat is driven only by this test; all three agents use their native ACP.
if (process.platform !== 'win32') throw new Error('This check requires the Windows EXE.');
const executable = resolve('release/同桌连接器.exe');
const sha256 = createHash('sha256').update(await readFile(executable)).digest('hex');
const root = resolve('.cache', 'validation', 'packaged-acp-' + randomUUID());
await mkdir(root, { recursive: true });
const socket = createServer(); await new Promise<void>(done => socket.listen(0, '127.0.0.1', done));
const port = (socket.address() as { port: number }).port; await new Promise<void>(done => socket.close(() => done()));
const endpoint = `http://127.0.0.1:${port}`;
const child = spawn(executable, ['--headless'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, AGENT_GAME_PORT: String(port), AGENT_GAME_DATA_DIR: root } });
let diagnostic = '';
child.stdout.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-3000); });
child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-3000); });
const browserFetch: typeof fetch = (url, options) => fetch(url, { ...options, headers: { ...Object.fromEntries(new Headers(options?.headers)), Origin: 'http://127.0.0.1:5173' } });
const values = new Map<string, string>();
const game = new GameController({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, new ConnectorClient(endpoint, browserFetch));
const until = async (check: () => boolean | Promise<boolean>, timeout = 60_000) => {
  const deadline = Date.now() + timeout;
  while (!await check()) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('EXE exited: ' + diagnostic);
    if (Date.now() > deadline) throw new Error('Verification timed out: ' + diagnostic);
    await new Promise(done => setTimeout(done, 100));
  }
};
let lastRevision = -1;
game.subscribe(() => {
  const current = game.getSnapshot();
  if (current.game && current.game.revision !== lastRevision) {
    lastRevision = current.game.revision;
    console.log(`revision ${lastRevision}: ${current.game.phase}; ${current.game.events.at(-1)?.text ?? ''}`);
  }
});
try {
  await until(async () => { try { return (await fetch(endpoint + '/health', { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } });
  await game.connect(); assert.equal(game.getSnapshot().connector?.version, CONNECTOR_VERSION);
  const model = process.env.ACP_SMOKE_MODEL ?? 'gpt-6.1-sol', reasoningEffort = process.env.ACP_SMOKE_EFFORT ?? 'low';
  await game.create([{ name: '实机测试真人位', kind: 'human' }, ...['Atlas', 'Nova', 'Echo'].map(name => ({ name, kind: 'codex-acp' as const, model, reasoningEffort }))], { gameId: 'holdem' });
  let pausedAndResumed = false, thinkingSince = 0;
  let sessions: string[] = [];
  await until(async () => {
    const current = game.getSnapshot();
    if (current.error) throw new Error(current.error);
    if (current.room?.finished) return true;
    if (!pausedAndResumed && current.seats.some(seat => seat.status === 'thinking')) {
      thinkingSince ||= Date.now();
      if (Date.now() - thinkingSince >= 400) {
        sessions = current.seats.filter(seat => seat.kind !== 'human').map(seat => seat.sessionId!);
        assert.equal(sessions.length, 3); assert.ok(sessions.every(Boolean));
        await game.pause(); assert.equal(game.getSnapshot().paused, true);
        assert.deepEqual(game.getSnapshot().seats.filter(seat => seat.kind !== 'human').map(seat => seat.sessionId), sessions);
        await game.resume(); pausedAndResumed = true;
        console.log('PASS: interrupted a real ACP turn and resumed the same three native sessions.');
      }
    }
    const actions = game.getSnapshot().game?.legalActions ?? [];
    const action = actions.find((value: any) => value.id === 'check') ?? actions.find((value: any) => value.id === 'call') ?? actions.find((value: any) => value.id === 'fold');
    if (action && !game.getSnapshot().paused) game.humanAction(action.action);
    return false;
  }, 480_000);
  await game.pause();
  const final = game.getSnapshot();
  assert.ok(pausedAndResumed, 'Pause/resume must be exercised during real inference.');
  assert.equal(final.error, null); assert.equal(final.game.totalChips, 4000);
  assert.equal(final.game.players.reduce((sum: number, player: any) => sum + player.chips, 0), 4000);
  assert.ok(final.seats.filter(seat => seat.kind !== 'human').every(seat => seat.turns > 0), 'Every native agent must finish an action.');
  const proof = { verifiedAt: new Date().toISOString(), executableSha256: sha256, version: CONNECTOR_VERSION, model, reasoningEffort, inference: true, fixture: false, participants: 4, nativeAcpAgents: 3, pausedAndResumedSameSessions: sessions, finished: final.room?.finished, revision: final.game.revision, phase: final.game.phase, totalChips: final.game.totalChips, turns: final.seats.map(seat => ({ seat: seat.seat, kind: seat.kind, turns: seat.turns })), events: final.game.events };
  await writeFile(resolve('.cache', 'validation', 'packaged-acp-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log('PASS: final EXE completed real four-seat holdem; every ACP agent acted; chips conserved. SHA-256 ' + sha256);
} finally {
  await game.disconnect().catch(() => {});
  const exited = new Promise<void>(done => { if (child.exitCode !== null || child.signalCode !== null) done(); else child.once('exit', () => done()); });
  child.kill(); await exited;
}
