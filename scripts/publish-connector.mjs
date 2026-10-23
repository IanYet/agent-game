import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const assets = ['tongzhuo-connector-windows-x64.exe', 'tongzhuo-connector-macos-arm64.zip', 'tongzhuo-connector-macos-x64.zip'];
export async function validatePackages(directory, sourceCommit) {
  const files = [];
  const expectedVersion = JSON.parse(await readFile(new URL('../apps/connector/version.json', import.meta.url), 'utf8')).version;
  let version;
  for (const asset of assets) {
    const bytes = await readFile(join(directory, asset));
    const metadata = JSON.parse(await readFile(join(directory, `${asset}.build.json`), 'utf8'));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const checksum = await readFile(join(directory, `${asset}.sha256`), 'utf8');
    const expected = asset.includes('windows') ? ['win32', 'x64'] : ['darwin', asset.includes('arm64') ? 'arm64' : 'x64'];
    if (metadata.asset !== asset || metadata.sha256 !== sha256 || metadata.size !== bytes.length || checksum !== `${sha256}  ${asset}\n`
      || metadata.sourceCommit !== sourceCommit || metadata.protocolVersion !== 4 || metadata.platform !== expected[0] || metadata.arch !== expected[1]
      || metadata.version !== expectedVersion || !/^\d+\.\d+\.\d+$/.test(metadata.version) || (version && metadata.version !== version)) throw new Error(`Invalid package/provenance: ${asset}`);
    version = metadata.version;
    // A build must bring matching runtime evidence; merely producing a ZIP/EXE
    // does not make it eligible for Release upload.
    const proof = JSON.parse(await readFile(join(directory, `package-${metadata.platform}-${metadata.arch}.json`), 'utf8'));
    if (proof.asset !== asset || proof.sha256 !== sha256 || proof.sourceCommit !== sourceCommit || proof.version !== version
      || proof.inference !== false || !Array.isArray(proof.checks) || proof.checks.length < 3) throw new Error(`Missing runtime verification: ${asset}`);
    for (const name of [asset, `${asset}.sha256`, `${asset}.build.json`, `package-${metadata.platform}-${metadata.arch}.json`]) {
      const data = await readFile(join(directory, name)); files.push({ name, data, sha256: createHash('sha256').update(data).digest('hex') });
    }
  }
  // Keep the legacy checksum URL valid when replacing the existing Windows
  // binary. A single publisher owns this aggregate; builders own only sidecars.
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
      body: `连接器 ${tag}，协议 4；Windows x64 与 macOS arm64/x64 均自带 Node.js。\n\n- Windows 窗口改用自动布局与完整换行，修复 DPI 缩放下文字截断和布局错乱。双端使用新的同桌图标。\n- 新增 macOS 原生菜单栏应用、退出入口、GUI PATH/Harness 发现和独立进程监护；macOS 13.5+，Apple Silicon 选 arm64，Intel 选 x64。\n- 纳入 v0.4.1 的 Codex ACP 合法游戏工具审批、暂停授权撤销和牌局收尾修复。网页最低连接器版本仍为 0.4.1。\n\nWindows 开发包未 Authenticode 签名。macOS 为开发分发包：只有 ad-hoc 签名，未 Developer ID 签名、未公证；首次打开请核对来源与 SHA-256，按 Apple 对单个应用的官方说明处理：https://support.apple.com/102445 。不应关闭 Gatekeeper 或删除下载隔离属性。真实 Mac GUI、下载隔离及真实账户验收仍待完成。\n\n每个资产的 .sha256、.build.json 和 package-*.json 记录校验和、源提交、签名状态和自动运行验证；SHA256SUMS.txt 同时汇总三套成品。GitHub runner 的自动运行使用明确的公开 ACP fixture，不证明真实账户推理。WorkBuddy 认证仍以专项验证结果为准。既有版本 tag 和资产保持不变。` } });
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
      const file = files[i], existing = before.find(asset => asset.name === file.name);
      if (existing) { await request(`${base}/releases/assets/${existing.id}`, { method: 'PATCH', body: { name: `${existing.name}.previous-${runId}` } }); backups.push(existing); }
      const signing = assets.includes(file.name) ? (file.name.includes('macos') ? ' · ad-hoc / not notarized' : ' · unsigned') : '';
      await request(`${base}/releases/assets/${staged[i].id}`, { method: 'PATCH', body: { name: file.name, label: `${tag} · ${sourceCommit.slice(0, 12)}${signing}` } });
    }
    const after = await listAssets();
    for (const file of files) if (!after.some(asset => asset.name === file.name && asset.digest === `sha256:${file.sha256}`)) throw new Error(`Release asset not verified: ${file.name}`);
    // A new version becomes public only with every download already in place.
    // During uploads, /releases/latest continues to serve the previous version.
    if (publishDraft) await request(`${base}/releases/${release.id}`, { method: 'PATCH', body: { draft: false } });
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
