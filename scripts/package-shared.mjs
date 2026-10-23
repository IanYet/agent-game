import { mkdir, cp, writeFile, copyFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export async function preparePayload(destination, runtimeName) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('The embedded runtime must be Node.js 22 or newer.');
  await mkdir(join(destination, 'runtime'), { recursive: true });
  await mkdir(join(destination, 'dist'), { recursive: true });
  await copyFile(process.execPath, join(destination, 'runtime', runtimeName));
  await cp(resolve('dist/connector'), join(destination, 'dist/connector'), { recursive: true });
  await copyFile('connector.config.json', join(destination, 'connector.config.json'));
  const { version } = JSON.parse(await readFile('apps/connector/version.json', 'utf8'));
  const launcher = await readFile('apps/connector/windows/Launcher.cs', 'utf8');
  for (const attribute of ['AssemblyVersion', 'AssemblyFileVersion']) {
    if (!launcher.includes(`${attribute}("${version}.0")`)) throw new Error(`Windows ${attribute} must match connector version ${version}.`);
  }
  await writeFile(join(destination, 'package.json'), JSON.stringify({ name: 'agent-arcade-connector', version, private: true }) + '\n');
  await cp('THIRD_PARTY_NOTICES.md', join(destination, 'THIRD_PARTY_NOTICES.md'));
  await mkdir(join(destination, 'licenses'), { recursive: true });
  const cached = resolve('.cache', `node-LICENSE-v${process.versions.node}.txt`);
  try { await copyFile(cached, join(destination, 'licenses/Node.js-LICENSE.txt')); }
  catch {
    const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`);
    if (!response.ok) throw new Error('Could not obtain the embedded Node.js license.');
    await writeFile(join(destination, 'licenses/Node.js-LICENSE.txt'), await response.text());
  }
  for (const entry of await readdir('node_modules', { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const packages = entry.name.startsWith('@') ? (await readdir(join('node_modules', entry.name))).map(name => join(entry.name, name)) : [entry.name];
    for (const name of packages) {
      const directory = join('node_modules', name);
      for (const file of await readdir(directory).catch(() => [])) {
        if (/^(licen[sc]e|notice)(\..*)?$/i.test(file)) await copyFile(join(directory, file), join(destination, 'licenses', `${name.replaceAll(/[\\/]/g, '__')}-${file}`));
      }
    }
  }
  return version;
}

export async function packageMetadata(asset, platform, arch, signing) {
  const { version } = JSON.parse(await readFile('apps/connector/version.json', 'utf8'));
  const protocol = /PROTOCOL_VERSION = (\d+)/.exec(await readFile('packages/protocol/src/index.ts', 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(version) || !protocol) throw new Error('Invalid connector version or protocol.');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  if (process.env.CI && execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', windowsHide: true }).trim()) throw new Error('CI package source must be clean.');
  const bytes = await readFile(asset), sha256 = createHash('sha256').update(bytes).digest('hex');
  const name = asset.split(/[\\/]/).at(-1);
  const metadata = { schemaVersion: 1, asset: name, version, protocolVersion: Number(protocol[1]), platform, arch, sourceCommit,
    nodeVersion: process.version, builtAt: new Date().toISOString(), sha256, size: bytes.length, signing,
    workflowRun: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null };
  await writeFile(`${asset}.sha256`, `${sha256}  ${name}\n`);
  await writeFile(`${asset}.build.json`, JSON.stringify(metadata, null, 2) + '\n');
  console.log(`Package: ${name}\nSHA-256: ${sha256}\nSource: ${sourceCommit}`);
  return metadata;
}
