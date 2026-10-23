import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { connectorPackages } from './connector-assets.mjs';

export const assets = connectorPackages.map(asset => asset.name);
export async function validatePackages(directory, sourceCommit) {
  const files = [];
  const expectedVersion = JSON.parse(await readFile(new URL('../apps/connector/version.json', import.meta.url), 'utf8')).version;
  let version;
  for (const { name: asset, platform, arch } of connectorPackages) {
    const bytes = await readFile(join(directory, asset));
    const metadata = JSON.parse(await readFile(join(directory, `${asset}.build.json`), 'utf8'));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const checksum = await readFile(join(directory, `${asset}.sha256`), 'utf8');
    if (metadata.asset !== asset || metadata.sha256 !== sha256 || metadata.size !== bytes.length || checksum !== `${sha256}  ${asset}\n`
      || metadata.sourceCommit !== sourceCommit || metadata.protocolVersion !== 4 || metadata.platform !== platform || metadata.arch !== arch
      || metadata.version !== expectedVersion || !/^\d+\.\d+\.\d+$/.test(metadata.version) || (version && metadata.version !== version)) throw new Error(`Invalid package/provenance: ${asset}`);
    version = metadata.version;
    for (const name of [asset, `${asset}.sha256`, `${asset}.build.json`]) {
      const data = await readFile(join(directory, name)); files.push({ name, data, sha256: createHash('sha256').update(data).digest('hex') });
    }
  }
  // Builders write sidecars; the publisher owns the combined checksum list.
  const sums = Buffer.from(files.filter(file => assets.includes(file.name)).map(file => `${file.sha256}  ${file.name}\n`).join(''));
  files.push({ name: 'SHA256SUMS.txt', data: sums, sha256: createHash('sha256').update(sums).digest('hex') });
  return { version, files };
}

// Only this publisher holds contents:write, behind a repository-wide workflow
// concurrency lock. Build jobs never touch Release assets or tags.
export async function publish({ repository, token, directory, sourceCommit, runId, fetcher = fetch, api = 'https://api.github.com' }) {
  const { version, files } = await validatePackages(directory, sourceCommit);
  const tag = `v${version}`, base = `${api}/repos/${repository}`;
  async function request(url, { method = 'GET', body, raw = false, missing = false } = {}) {
    const result = await fetcher(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'agent-game-release', ...(body !== undefined ? { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' } : {}) }, ...(body !== undefined ? { body: raw ? body : JSON.stringify(body) } : {}) });
    if (missing && result.status === 404) return null;
    if (!result.ok) throw new Error(`GitHub ${method} ${new URL(url).pathname}: ${result.status} ${(await result.text()).slice(0, 300)}`);
    return result.status === 204 ? null : result.json();
  }
  const tagBefore = await request(`${base}/git/ref/tags/${tag}`, { missing: true });
  let release = await request(`${base}/releases/tags/${tag}`, { missing: true });
  if (!release) {
    release = await request(`${base}/releases`, { method: 'POST', body: { tag_name: tag, target_commitish: sourceCommit, name: `同桌连接器 ${tag}`, draft: true, prerelease: false,
      body: `同桌连接器 ${tag}，协议 4，自带 Node.js。\n\nWindows 下载 64 位 EXE；macOS 13.5+ 按芯片选择 Apple Silicon 或 Intel ZIP，解压后将应用拖入「应用程序」。\n\nWindows 包尚未签名；macOS 包只有 ad-hoc 签名，尚未完成 Developer ID 签名与公证。首次打开受阻时，请按 Apple 官方说明处理：https://support.apple.com/102445 。\n\n每个包附带 .sha256 校验和与 .build.json 构建信息，SHA256SUMS.txt 汇总全部安装包。源提交：${sourceCommit}。` } });
  }
  if (release.prerelease) throw new Error('Refusing to publish stable downloads into a prerelease.');
  const publishDraft = release.draft;
  if (publishDraft && release.target_commitish !== sourceCommit) throw new Error('Draft Release belongs to a different source commit.');
  const originalBody = release.body, originalName = release.name;
  const listAssets = async () => {
    const all = [];
    for (let page = 1; ; page++) { const batch = await request(`${base}/releases/${release.id}/assets?per_page=100&page=${page}`); all.push(...batch); if (batch.length < 100) return all; }
  };
  const before = await listAssets(), staged = [], backups = [];
  const suffix = `.staging-${runId}-${sourceCommit.slice(0, 12)}`;
  try {
    // Upload and verify EVERY temporary asset before changing any stable name.
    for (const file of files) {
      const upload = release.upload_url.replace(/\{.*$/, '');
      const asset = await request(`${upload}?name=${encodeURIComponent(file.name + suffix)}`, { method: 'POST', body: file.data, raw: true });
      staged.push(asset);
      if (asset.size !== file.data.length || asset.digest !== `sha256:${file.sha256}`) throw new Error(`Uploaded digest mismatch: ${file.name}`);
    }
    for (let i = 0; i < files.length; i++) {
      // GitHub treats asset names as case-insensitive, including renames.
      const file = files[i], existing = before.find(asset => asset.name.toLowerCase() === file.name.toLowerCase());
      if (existing) { await request(`${base}/releases/assets/${existing.id}`, { method: 'PATCH', body: { name: `${existing.name}.previous-${runId}` } }); backups.push(existing); }
      const packageInfo = connectorPackages.find(asset => [asset.name, `${asset.name}.sha256`, `${asset.name}.build.json`].includes(file.name));
      const detail = file.name.endsWith('.sha256') ? ' · SHA-256 校验和' : file.name.endsWith('.build.json') ? ' · 构建信息' : '';
      const label = packageInfo ? `${packageInfo.label}${detail} · ${tag}` : '全部安装包 · SHA-256 校验和';
      await request(`${base}/releases/assets/${staged[i].id}`, { method: 'PATCH', body: { name: file.name, label } });
    }
    const after = await listAssets();
    for (const file of files) if (!after.some(asset => asset.name === file.name && asset.digest === `sha256:${file.sha256}`)) throw new Error(`Release asset not verified: ${file.name}`);
    // A new version becomes public only with every download already in place.
    // During uploads, /releases/latest continues to serve the previous version.
    if (publishDraft) await request(`${base}/releases/${release.id}`, { method: 'PATCH', body: { draft: false } });
    // Verify the PUBLIC download route as well as GitHub's upload digest. This
    // also catches stale redirects or truncated delivery after asset promotion.
    const downloads = await Promise.allSettled(files.map(async file => {
      const asset = after.find(asset => asset.name === file.name);
      const url = new URL(asset.browser_download_url); url.searchParams.set('verify', runId);
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetcher(url.href, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(120_000) });
        if (!response.ok && attempt < 2 && [404, 502, 503].includes(response.status)) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
        if (!response.ok) throw new Error(`Public download failed: ${file.name} (${response.status})`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length !== file.data.length || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Public download digest mismatch: ${file.name}`);
        console.log(`Verified public download: ${file.name} (${bytes.length} bytes)`); return;
      }
    }));
    for (const download of downloads) if (download.status === 'rejected') throw download.reason;
    const tagAfter = await request(`${base}/git/ref/tags/${tag}`);
    if (tagBefore && tagBefore.object.sha !== tagAfter.object.sha) throw new Error('Tag changed externally while publishing.');
    if (!tagBefore && tagAfter.object.sha !== sourceCommit) throw new Error('New tag does not point to the verified source commit.');
    const unchanged = await request(`${base}/releases/${release.id}`);
    if (unchanged.body !== originalBody || unchanged.name !== originalName) throw new Error('Release description changed externally while publishing.');
  } catch (error) {
    // Roll back only this run's assets. Never delete an entire Release or touch
    // an unrelated platform/asset, description, or tag.
    if (publishDraft) await request(`${base}/releases/${release.id}`, { method: 'PATCH', body: { draft: true } }).catch(() => {});
    for (const asset of staged) await request(`${base}/releases/assets/${asset.id}`, { method: 'DELETE' }).catch(() => {});
    for (const asset of backups.reverse()) await request(`${base}/releases/assets/${asset.id}`, { method: 'PATCH', body: { name: asset.name } }).catch(() => {});
    throw error;
  }
  for (const asset of backups) await request(`${base}/releases/assets/${asset.id}`, { method: 'DELETE' });
  console.log(`Published verified assets to ${release.html_url}; existing tag and Release description preserved.`);
  return release.html_url;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { GITHUB_REPOSITORY: repository, GH_TOKEN: token, GITHUB_SHA: sourceCommit, GITHUB_RUN_ID: runId } = process.env;
  if (!repository || !token || !sourceCommit || !runId) throw new Error('Run the publisher inside the authorized GitHub Actions publish job.');
  await publish({ repository, token, sourceCommit, runId: `${runId}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`, directory: resolve(process.argv[2] ?? 'release-assets') });
}
