import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assets, publish } from './publish-connector.mjs';

const commit = 'a'.repeat(40);
const version = JSON.parse(await readFile(new URL('../apps/connector/version.json', import.meta.url), 'utf8')).version;
const tag = `v${version}`;
async function packages() {
  const directory = await mkdtemp(join(tmpdir(), 'connector-release-test-'));
  for (const asset of assets) {
    const bytes = Buffer.from(asset), sha256 = createHash('sha256').update(bytes).digest('hex');
    const platform = asset.includes('windows') ? 'win32' : 'darwin', arch = asset.includes('arm64') ? 'arm64' : 'x64';
    await writeFile(join(directory, asset), bytes);
    await writeFile(join(directory, `${asset}.sha256`), `${sha256}  ${asset}\n`);
    await writeFile(join(directory, `${asset}.build.json`), JSON.stringify({ asset, sha256, version, protocolVersion: 4, sourceCommit: commit, size: bytes.length, platform, arch }));
    await writeFile(join(directory, `package-${platform}-${arch}.json`), JSON.stringify({ asset, sha256, version, sourceCommit: commit, inference: false, checks: ['force', 'normal', 'restart'] }));
  }
  return directory;
}
function github({ failPromote = false, wrongDigest = false } = {}) {
  const state = { calls: [], assets: [{ id: 10, name: assets[0], digest: 'sha256:old', size: 3 }, { id: 11, name: 'unrelated.txt' }, { id: 12, name: 'SHA256SUMS.txt', digest: 'sha256:legacy' }], body: 'Existing release notes must stay intact', tag: 'b'.repeat(40), next: 20 };
  const response = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(structuredClone(body)), { status, headers: { 'Content-Type': 'application/json' } });
  const release = () => ({ id: 1, name: `Original ${tag}`, body: state.body, tag_name: tag, html_url: `https://github.com/test/repo/releases/tag/${tag}`, upload_url: 'https://uploads.test/assets{?name,label}', draft: false, prerelease: false });
  const fetcher = async (url, options) => {
    const u = new URL(url), method = options.method ?? 'GET', body = options.body;
    state.calls.push({ method, path: u.pathname });
    if (method === 'GET' && u.pathname.includes('/git/ref/')) return response({ object: { sha: state.tag } });
    if (method === 'GET' && (u.pathname.endsWith(`/releases/tags/${tag}`) || u.pathname.endsWith('/releases/1'))) return response(release());
    if (method === 'GET' && u.pathname.endsWith('/releases/1/assets')) return response(state.assets);
    if (method === 'POST' && u.hostname === 'uploads.test') {
      const asset = { id: state.next++, name: u.searchParams.get('name'), size: body.length, digest: wrongDigest ? 'sha256:wrong' : `sha256:${createHash('sha256').update(body).digest('hex')}` };
      state.assets.push(asset); return response(asset, 201);
    }
    const id = Number(u.pathname.split('/').at(-1)), asset = state.assets.find(a => a.id === id);
    if (method === 'PATCH' && asset) {
      const data = JSON.parse(body);
      if (failPromote && data.name === assets[1]) return response({ message: 'injected promotion failure' }, 500);
      if (state.assets.some(a => a.id !== id && a.name === data.name)) return response({ message: 'duplicate' }, 422);
      Object.assign(asset, data); return response(asset);
    }
    if (method === 'DELETE' && asset) { state.assets = state.assets.filter(a => a.id !== id); return response(null, 204); }
    throw new Error(`Unexpected API mutation: ${method} ${u.pathname}`);
  };
  return { state, fetcher };
}
async function exercise(options, check) {
  const directory = await packages(), server = github(options);
  try { await check(() => publish({ repository: 'test/repo', token: 'test-token', directory, sourceCommit: commit, runId: '1', fetcher: server.fetcher }), server.state, directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
test('replaces only verified assets, preserving tag, Release body, and unrelated assets', async () => {
  await exercise({}, async (run, state) => {
    await run(); assert.equal(state.tag, 'b'.repeat(40)); assert.equal(state.body, 'Existing release notes must stay intact');
    assert.equal(state.assets.length, 14); assert.ok(state.assets.some(a => a.name === 'unrelated.txt'));
    assert.ok(state.assets.some(a => a.name === 'SHA256SUMS.txt'));
    assert.notEqual(state.assets.find(a => a.name === 'SHA256SUMS.txt').id, 12);
    for (const asset of assets) assert.ok(state.assets.some(a => a.name === asset));
    assert.ok(state.calls.filter(c => c.method !== 'GET').every(c => !c.path.includes('/git/') && c.path !== '/repos/test/repo/releases/1'));
  });
});
test('checksum failure rejects before any network request', async () => {
  await exercise({}, async (run, state, directory) => {
    await writeFile(join(directory, assets[0]), 'corrupted'); await assert.rejects(run, /Invalid package/); assert.equal(state.calls.length, 0);
  });
});
test('failed upload digest leaves stable assets untouched', async () => {
  await exercise({ wrongDigest: true }, async (run, state) => {
    await assert.rejects(run, /digest mismatch/); assert.deepEqual(state.assets.map(a => a.name), [assets[0], 'unrelated.txt', 'SHA256SUMS.txt']); assert.equal(state.assets[0].id, 10);
  });
});
test('promotion failure rolls back original stable download and removes only this run staging assets', async () => {
  await exercise({ failPromote: true }, async (run, state) => {
    await assert.rejects(run, /500/); assert.deepEqual(state.assets.map(a => a.name), [assets[0], 'unrelated.txt', 'SHA256SUMS.txt']); assert.equal(state.assets[0].id, 10);
  });
});
test('missing runtime evidence prevents publishing', async () => {
  await exercise({}, async (run, state, directory) => {
    await rm(join(directory, 'package-darwin-arm64.json')); await assert.rejects(run); assert.equal(state.calls.length, 0);
  });
});
test('a platform version differing from version.json prevents publishing', async () => {
  await exercise({}, async (run, state, directory) => {
    const asset = assets[1], path = join(directory, `${asset}.build.json`);
    const bytes = Buffer.from(asset), sha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path, JSON.stringify({ asset, sha256, version: '99.0.0', protocolVersion: 4, sourceCommit: commit, size: bytes.length, platform: 'darwin', arch: 'arm64' }));
    await assert.rejects(run, /Invalid package/); assert.equal(state.calls.length, 0);
  });
});
