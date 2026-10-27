import { access, readdir, stat, readFile } from 'node:fs/promises';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import type { HarnessInfo } from '../types';
import type { ProcessCommand } from './rpc';

const exec = promisify(execFile);
const exists = async (path: string) => { try { await access(path); return true; } catch { return false; } };
export function executableCandidates(output: string, platform = process.platform): string[] {
  return output.trim().split(/\r?\n/).filter(path => path && (platform !== 'win32' || /\.(exe|cmd|mjs|cjs|js)$/i.test(path))).sort((a, b) => Number(!/\.exe$/i.test(a)) - Number(!/\.exe$/i.test(b)));
}
export async function findCodex(): Promise<string | null> {
  if (process.env.CODEX_PATH) {
    const configured = resolve(process.env.CODEX_PATH);
    if (await exists(configured)) return configured;
    return null;
  }
  try {
    const { stdout } = await exec(process.platform === 'win32' ? 'where.exe' : 'which', ['codex'], { windowsHide: true, timeout: 5000 });
    const paths = executableCandidates(stdout);
    for (const path of paths) if (await exists(path)) return path;
  } catch { /* App's bundled executable need not be on PATH. */ }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const base = join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    try {
      const versions = await Promise.all((await readdir(base)).map(async name => ({ path: join(base, name, 'codex.exe'), modified: (await stat(join(base, name))).mtimeMs })));
      for (const item of versions.sort((a, b) => b.modified - a.modified)) if (await exists(item.path)) return item.path;
    } catch { /* Missing app is reported in UI. */ }
    const npmCli = join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (await exists(npmCli)) return npmCli;
  }
  if (process.platform === 'darwin') {
    for (const base of [join(homedir(), 'Applications'), '/Applications']) {
      const bundled = join(base, 'Codex.app', 'Contents', 'Resources', 'codex');
      if (await exists(bundled)) return bundled;
    }
  }
  return null;
}

export async function executableCommand(path: string, args: string[] = []): Promise<ProcessCommand> {
  if (/\.(m?js|cjs)$/i.test(path)) return { command: process.execPath, args: [path, ...args] };
  if (/(?:^|[\\/])(?:codebuddy|workbuddy)$/i.test(path)) {
    const wrapper = await readFile(path, 'utf8').catch(() => '');
    if (wrapper.startsWith('#!/usr/bin/env node')) {
      const lite = await exists(resolve(dirname(path), '../dist/codebuddy-lite-wb.mjs'));
      return { command: process.execPath, args: [path, ...args], ...(lite ? { env: { ...process.env, CODEBUDDY_FORCE_LITE_WB_BUNDLE: '1' } } : {}) };
    }
  }
  if (/\.cmd$/i.test(path)) {
    // Resolve npm's Node shim without cmd.exe, shell interpolation, or a visible window.
    const shim = await readFile(path, 'utf8').catch(() => '');
    // DeepSeek Desktop ships a documented CLI carrier using Electron's Node mode
    // to resolve its ASAR-contained modules. Do not launch its graphical app.
    if (shim.includes('ELECTRON_RUN_AS_NODE=1') && shim.includes('dsh-desktop-host\\lib\\cli.js')) {
      const root = resolve(dirname(path), '../../../..'), carrier = join(root, 'DeepSeek Harness.exe');
      if (await exists(carrier) && await exists(join(root, 'resources', 'app.asar'))) return { command: carrier, args: ['--expose-internals', join(root, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js'), ...args], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } };
    }
    const match = /%(?:dp0%|~dp0)[\\/]([^"\r\n]+?(?:\.(?:mjs|cjs|js)|[\\/]bin[\\/](?:codebuddy|workbuddy)))"/i.exec(shim);
    if (match) {
      const entry = resolve(dirname(path), match[1].replace(/[\\/]/g, '/'));
      if (await exists(entry)) return executableCommand(entry, args);
    }
    throw new Error('无法解析此 npm 启动脚本，请将 Harness 路径指向实际 .exe、.js、.cjs 或 .mjs 入口');
  }
  return { command: path, args };
}

export async function findLocalHarness(name: 'dsh' | 'workbuddy'): Promise<string | null> {
  const override = process.env[name === 'dsh' ? 'DSH_PATH' : 'WORKBUDDY_PATH'];
  if (override) return await exists(resolve(override)) ? resolve(override) : null;
  for (const executable of name === 'dsh' ? ['dsh'] : ['workbuddy', 'codebuddy']) {
    try {
      const { stdout } = await exec(process.platform === 'win32' ? 'where.exe' : 'which', [executable], { windowsHide: true, timeout: 5000 });
      for (const path of executableCandidates(stdout)) if (await exists(path)) return path;
    } catch { /* Report missing installation, never install a CLI or request credentials. */ }
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? '', roaming = process.env.APPDATA ?? '';
    const candidates = name === 'dsh' ? [join(local, 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'), join(roaming, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')] : ['WorkBuddy', 'WorkBuddy AI', 'workbuddy'].flatMap(app => [
      join(local, 'Programs', app, 'resources', 'app.asar.unpacked', 'cli', 'bin', 'codebuddy'),
      join(local, 'Programs', app, 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs'),
      join(local, 'Programs', app, 'resources', 'app.asar.unpacked', 'cli', 'bin', 'codebuddy.js'),
      join(local, 'Programs', app, 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy.js'),
    ]);
    for (const path of candidates) if (await exists(path)) return path;
  }
  if (process.platform === 'darwin') {
    for (const base of [join(homedir(), 'Applications'), '/Applications']) {
      const candidates = name === 'workbuddy'
        ? ['WorkBuddy', 'CodeBuddy'].map(app => join(base, `${app}.app`, 'Contents/Resources/app.asar.unpacked/cli/bin/codebuddy'))
        : [join(base, 'DeepSeek Harness.app', 'Contents/Resources/runtime/cli/bin/dsh')];
      for (const path of candidates) if (await exists(path)) return path;
    }
  }
  return null;
}

export async function inspectCommand(path: string, args: string[]): Promise<string> {
  const command = await executableCommand(path, args);
  const result = await exec(command.command, command.args, { env: command.env ?? process.env, windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  return result.stdout;
}

export function findAcp(root: string): string | null {
  if (process.env.CODEX_ACP_PATH && isAbsolute(process.env.CODEX_ACP_PATH)) return process.env.CODEX_ACP_PATH;
  const candidates = [join(root, 'dist', 'connector', 'codex-acp.mjs'), join(root, 'node_modules', '@agentclientprotocol', 'codex-acp', 'dist', 'index.js')];
  const require = createRequire(join(root, 'package.json'));
  for (const candidate of candidates) { try { require.resolve(candidate); return candidate; } catch { /* next */ } }
  return null;
}

export async function discoverHarnesses(root: string): Promise<{ harnesses: HarnessInfo[]; codexPath: string | null; acpPath: string | null; dshPath: string | null; workbuddyPath: string | null }> {
  const codexPath = await findCodex();
  const acpPath = findAcp(root);
  const [dshPath, workbuddyPath] = await Promise.all([findLocalHarness('dsh'), findLocalHarness('workbuddy')]);
  let version: string | undefined;
  if (codexPath) {
    try { const command = await executableCommand(codexPath, ['--version']); version = (await exec(command.command, command.args, { windowsHide: true, timeout: 10_000 })).stdout.trim(); } catch { /* start will report actionable error */ }
  }
  return { codexPath, acpPath, dshPath, workbuddyPath, harnesses: [
    { id: 'codex-acp', name: 'Codex · ACP', protocol: 'Agent Client Protocol v1', available: !!codexPath && !!acpPath, version, detail: codexPath && acpPath ? '复用本机 Codex 登录' : '尚未找到本机 Codex', ...(codexPath ? { path: codexPath } : {}) },
    { id: 'codex', name: 'Codex · App Server', protocol: 'Codex App Server', available: !!codexPath, version, detail: '官方原生协议', ...(codexPath ? { path: codexPath } : {}) },
    { id: 'dsh', name: 'dsh · DeepSeek Harness', protocol: 'ACP v1 · HTTP MCP', available: false, ...(dshPath ? { path: dshPath, detail: '等待 ACP 与模型目录检测' } : { detail: '未找到 dsh，请安装官方 DeepSeek Harness CLI，或设置 DSH_PATH' }) },
    { id: 'workbuddy', name: 'WorkBuddy', protocol: 'CodeBuddy ACP v1 · HTTP MCP', available: false, ...(workbuddyPath ? { path: workbuddyPath, detail: '等待 ACP 与模型目录检测' } : { detail: '未找到 WorkBuddy/CodeBuddy CLI，可用 WORKBUDDY_PATH 指定公开 ACP 入口' }) },
  ] };
}
