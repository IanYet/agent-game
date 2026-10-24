import { mkdir, writeFile, readFile, readdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { preparePayload, packageMetadata } from './package-shared.mjs';
import { connectorIcons } from './connector-icons.mjs';
import { connectorPackageName } from './connector-assets.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Run this packaging script with Windows x64 Node.js 22 or newer.');
const destination = resolve('release', `portable-${Date.now()}`);
await preparePayload(destination, 'node.exe');
await writeFile(join(destination, '使用说明.txt'), '\uFEFF同桌连接器 · Windows 64 位\r\n\r\n需要 Windows 10 2004（19041）或更新版本。双击下载的 EXE 即可，无需另装 .NET、Windows App SDK 或 Node.js。\r\n窗口中的「概览」显示服务与网页状态，「可用程序」显示检测结果，「端口与进程」可确认占用者并逐项处理。\r\n回到游戏网页点击「连接本机」，按浏览器提示允许本地网络访问。\r\n关闭窗口后继续在托盘运行；单击托盘图标可重新打开。最小化留在任务栏。\r\n「停止服务」停止本次 Agent 会话并释放端口；「退出连接器」同时退出应用。\r\n端口默认 3211，遵循 AGENT_GAME_PORT。未知进程不会被自动结束，强制结束需要在窗口中确认具体 PID 和影响。\r\nCodex、dsh、WorkBuddy 需自行安装并登录。\r\n运行时按内容哈希展开到 %LOCALAPPDATA%\\TongZhuo；会话在 %LOCALAPPDATA%\\AgentArcade。不修改注册表。\r\n当前包没有 Authenticode 签名。\r\n', 'utf8');
const { ico } = await connectorIcons();
const dotnet = process.env.DOTNET_EXE ?? 'dotnet';
execFileSync(dotnet, ['publish', 'apps/connector/windows/Connector.csproj', '-c', 'Release', '-r', 'win-x64', '-p:Platform=x64', '-o', destination, '--nologo'], { stdio: 'inherit', windowsHide: true });
// Keep the exact restored packages' license texts beside the redistributed
// native and managed runtimes, including the Windows App SDK terms/notices.
const restored = JSON.parse(await readFile('apps/connector/windows/obj/project.assets.json', 'utf8'));
for (const library of Object.values(restored.libraries).filter(library => library.type === 'package')) {
  for (const folder of Object.keys(restored.packageFolders)) {
    const directory = join(folder, library.path);
    for (const file of await readdir(directory).catch(() => [])) if (/^(licen[sc]e|notice|third[-_]?party[-_]?notices?)(\..*)?$/i.test(file)) {
      await copyFile(join(directory, file), join(destination, 'licenses', `${library.path.replaceAll(/[\\/]/g, '__')}-${file}`));
    }
  }
}
for (const file of ['TongZhuoConnector.exe', 'TongZhuoConnector.pri', 'hostfxr.dll', 'Microsoft.UI.Xaml.dll']) {
  const bytes = await readFile(join(destination, file));
  if (bytes.length < (file.endsWith('.pri') ? 256 : 4096)) throw new Error(`Incomplete native publish output: ${file}`);
}
// Paths passed as literal PowerShell arguments; the staging folder is newly created.
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const temporaryArchive = `${destination}.zip`;
execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', `[System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(destination)}, ${quote(temporaryArchive)}, [System.IO.Compression.CompressionLevel]::Optimal, $false)`], { stdio: 'inherit', windowsHide: true });
const fileName = connectorPackageName('win32', 'x64');
const executable = resolve('release', fileName);
const compiler = join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
execFileSync(compiler, [
  '/nologo', '/optimize+', '/target:winexe', '/platform:x64',
  `/out:${executable}`, `/win32manifest:${resolve('apps/connector/windows/app.manifest')}`,
  `/win32icon:${ico}`,
  '/reference:System.dll', '/reference:System.Core.dll',
  '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
  `/resource:${temporaryArchive},TongZhuo.Payload`, resolve('apps/connector/windows/Bootstrap.cs'),
], { stdio: 'inherit', windowsHide: true });
await packageMetadata(executable, 'win32', 'x64', { type: 'unsigned', authenticode: false });
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
const manifest = JSON.stringify({ fileName, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), parts }, null, 2);
await writeFile('apps/web/public/downloads/manifest.json', manifest);
await writeFile('dist/client/downloads/manifest.json', manifest);
console.log(`Single-file portable EXE ready: ${executable}\nStatic site download updated. No installer, no registry changes. Windows Job Object owns all child processes.`);
