import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { connectorIcons } from './connector-icons.mjs';

if (process.platform !== 'win32') throw new Error('Run layout rendering on Windows.');
const output = resolve('.cache/validation/windows-ui');
await mkdir(output, { recursive: true });
const executable = join(output, 'WindowsLayout.exe');
const { ico } = await connectorIcons();
const compiler = join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
execFileSync(compiler, ['/nologo', '/target:exe', '/platform:x64', '/main:WindowsLayout', `/out:${executable}`,
  `/win32manifest:${resolve('apps/connector/windows/app.manifest')}`,
  `/win32icon:${ico}`, `/resource:${ico},AgentArcade.Icon`,
  '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
  '/reference:System.Net.Http.dll', '/reference:System.Web.Extensions.dll', '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
  resolve('apps/connector/windows/Launcher.cs'), resolve('scripts/fixtures/WindowsLayout.cs')], { stdio: 'inherit', windowsHide: true });
execFileSync(executable, [output], { stdio: 'inherit', windowsHide: true });
