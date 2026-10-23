import { mkdir, cp, writeFile, copyFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Run this packaging script with Windows x64 Node.js 22 or newer.');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('The portable runtime must be Node.js 22 or newer.');
const destination = resolve('release', `portable-${Date.now()}`);
await mkdir(join(destination, 'runtime'), { recursive: true });
await mkdir(join(destination, 'dist', 'connector'), { recursive: true });
await copyFile(process.execPath, join(destination, 'runtime', 'node.exe'));
await cp(resolve('dist/connector'), join(destination, 'dist', 'connector'), { recursive: true });
await copyFile('connector.config.json', join(destination, 'connector.config.json'));
await writeFile(join(destination, 'package.json'), '{"name":"agent-arcade-connector","version":"0.1.0","private":true}\n');
await writeFile(join(destination, '使用说明.txt'), '\uFEFF同桌 · Windows 本地连接器\r\n\r\n1. 在浏览器打开游戏网页。\r\n2. 双击「同桌连接器.exe」，无需安装或解压，也无需 Node.js。\r\n3. 回到网页，点击「连接 Codex」。允许浏览器访问本地网络。\r\n4. 关闭连接器窗口会结束其所有子进程，并释放本机监听端口。\r\n\r\n本机需要已经安装 Codex，并使用 ChatGPT 订阅登录。\r\n运行时自动展开到系统临时目录，不修改注册表。\r\n', 'utf8');
await cp('THIRD_PARTY_NOTICES.md', join(destination, 'THIRD_PARTY_NOTICES.md'));
await mkdir(join(destination, 'licenses'), { recursive: true });
const runtimeLicensePath = resolve('.cache', `node-LICENSE-v${process.versions.node}.txt`);
try { await copyFile(runtimeLicensePath, join(destination, 'licenses', 'Node.js-LICENSE.txt')); }
catch {
  const license = await fetch(`https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`);
  if (!license.ok) throw new Error('Could not obtain the bundled Node.js license.');
  await writeFile(join(destination, 'licenses', 'Node.js-LICENSE.txt'), await license.text());
}
for (const entry of await readdir('node_modules', { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  const packages = entry.name.startsWith('@') ? (await readdir(join('node_modules', entry.name))).map(name => join(entry.name, name)) : [entry.name];
  for (const name of packages) {
    const directory = join('node_modules', name);
    for (const file of await readdir(directory).catch(() => [])) {
      if (/^(licen[sc]e|notice)(\..*)?$/i.test(file)) await copyFile(join(directory, file), join(destination, 'licenses', `${name.replaceAll(/[\\/]/g, '__')}-${file}`)).catch(() => {});
    }
  }
}
// Paths passed as literal PowerShell arguments; the staging folder is newly created.
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const temporaryArchive = `${destination}.zip`;
execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', `[System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(destination)}, ${quote(temporaryArchive)}, [System.IO.Compression.CompressionLevel]::Optimal, $false)`], { stdio: 'inherit', windowsHide: true });
const executable = resolve('release/同桌连接器.exe');
const compiler = join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
execFileSync(compiler, [
  '/nologo', '/optimize+', '/target:winexe', '/platform:x64',
  `/out:${executable}`, `/win32manifest:${resolve('apps/connector/windows/app.manifest')}`,
  '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
  '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
  `/resource:${temporaryArchive},AgentArcade.Payload`, resolve('apps/connector/windows/Launcher.cs'),
], { stdio: 'inherit', windowsHide: true });
await mkdir('apps/web/public/downloads', { recursive: true });
await mkdir('dist/client/downloads', { recursive: true });
// Split static assets below common CDN per-file limits. The browser assembles a
// single portable EXE in memory, verifies SHA-256, and downloads it with one click.
const bytes = await readFile(executable);
const chunkSize = 20 * 1024 * 1024;
const parts = [];
for (let offset = 0; offset < bytes.length; offset += chunkSize) {
  const name = `connector-${String(parts.length + 1).padStart(2, '0')}.part`;
  const chunk = bytes.subarray(offset, offset + chunkSize);
  await writeFile(join('apps/web/public/downloads', name), chunk);
  await writeFile(join('dist/client/downloads', name), chunk);
  parts.push(name);
}
const manifest = JSON.stringify({ fileName: '同桌连接器.exe', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), parts }, null, 2);
await writeFile('apps/web/public/downloads/manifest.json', manifest);
await writeFile('dist/client/downloads/manifest.json', manifest);
console.log(`Single-file portable EXE ready: ${executable}\nStatic site download updated. No installer, no registry changes. Windows Job Object owns all child processes.`);
