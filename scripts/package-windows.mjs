import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { preparePayload, packageMetadata } from './package-shared.mjs';
import { connectorIcons } from './connector-icons.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Run this packaging script with Windows x64 Node.js 22 or newer.');
const destination = resolve('release', `portable-${Date.now()}`);
await preparePayload(destination, 'node.exe');
await writeFile(join(destination, '使用说明.txt'), '\uFEFF同桌 · Windows 本地连接器\r\n\r\n1. 在浏览器打开游戏网页。\r\n2. 双击「同桌连接器.exe」，无需安装或解压，也无需 Node.js。\r\n3. 回到网页，点击「连接本机」。允许浏览器访问本地网络。\r\n4. 在窗口或托盘菜单选择「退出连接器」会结束其所有子进程，并释放本机监听端口。\r\n\r\n本机需要已安装并登录所选 Harness。Codex 使用 ChatGPT 订阅登录；dsh 与 WorkBuddy 使用各自的已有登录与模型配置。未就绪原因可在网页本地连接页面查看。\r\nDSH_PATH、DSH_PROFILE 与 WORKBUDDY_PATH 可指定 CLI 入口/配置。支持公开 ACP 和 HTTP MCP 的版本才会就绪。\r\n运行时自动展开到系统临时目录，不修改注册表。\r\n', 'utf8');
// Paths passed as literal PowerShell arguments; the staging folder is newly created.
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const temporaryArchive = `${destination}.zip`;
execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', `[System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(destination)}, ${quote(temporaryArchive)}, [System.IO.Compression.CompressionLevel]::Optimal, $false)`], { stdio: 'inherit', windowsHide: true });
const executable = resolve('release/同桌连接器.exe');
const compiler = join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
const { ico } = await connectorIcons();
execFileSync(compiler, [
  '/nologo', '/optimize+', '/target:winexe', '/platform:x64',
  `/out:${executable}`, `/win32manifest:${resolve('apps/connector/windows/app.manifest')}`,
  `/win32icon:${ico}`, `/resource:${ico},AgentArcade.Icon`,
  '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
  '/reference:System.Net.Http.dll', '/reference:System.Web.Extensions.dll',
  '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
  `/resource:${temporaryArchive},AgentArcade.Payload`, resolve('apps/connector/windows/Launcher.cs'),
], { stdio: 'inherit', windowsHide: true });
const asset = resolve('release/tongzhuo-connector-windows-x64.exe');
await copyFile(executable, asset);
await packageMetadata(asset, 'win32', 'x64', { type: 'unsigned', authenticode: false });
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
