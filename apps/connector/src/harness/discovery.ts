import { access, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import type { HarnessInfo } from '../types';
import type { ProcessCommand } from './rpc';

const exec = promisify(execFile);
const exists = async (path: string) => { try { await access(path); return true; } catch { return false; } };
export async function findCodex(): Promise<string | null> {
  if (process.env.CODEX_PATH) {
    const configured = resolve(process.env.CODEX_PATH);
    if (await exists(configured)) return configured;
    return null;
  }
  try {
    const { stdout } = await exec(process.platform === 'win32' ? 'where.exe' : 'which', ['codex'], { windowsHide: true, timeout: 5000 });
    const paths = stdout.trim().split(/\r?\n/);
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
  return null;
}

export async function executableCommand(path: string, args: string[] = []): Promise<ProcessCommand> {
  if (/\.(m?js|cjs)$/i.test(path)) return { command: process.execPath, args: [path, ...args] };
  if (/\.cmd$/i.test(path)) {
    const cli = join(dirname(path), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (await exists(cli)) return { command: process.execPath, args: [cli, ...args] };
    throw new Error('请将 CODEX_PATH 指向 codex.exe 或 codex.js');
  }
  return { command: path, args };
}

export function findAcp(root: string): string | null {
  if (process.env.CODEX_ACP_PATH && isAbsolute(process.env.CODEX_ACP_PATH)) return process.env.CODEX_ACP_PATH;
  const candidates = [join(root, 'dist', 'connector', 'codex-acp.mjs'), join(root, 'node_modules', '@agentclientprotocol', 'codex-acp', 'dist', 'index.js')];
  const require = createRequire(join(root, 'package.json'));
  for (const candidate of candidates) { try { require.resolve(candidate); return candidate; } catch { /* next */ } }
  return null;
}

export async function discoverHarnesses(root: string): Promise<{ harnesses: HarnessInfo[]; codexPath: string | null; acpPath: string | null }> {
  const codexPath = await findCodex();
  const acpPath = findAcp(root);
  let version: string | undefined;
  if (codexPath) {
    try { const command = await executableCommand(codexPath, ['--version']); version = (await exec(command.command, command.args, { windowsHide: true, timeout: 10_000 })).stdout.trim(); } catch { /* start will report actionable error */ }
  }
  return { codexPath, acpPath, harnesses: [
    { id: 'codex-acp', name: 'Codex · ACP', protocol: 'Agent Client Protocol v1', available: !!codexPath && !!acpPath, version, detail: codexPath && acpPath ? '复用本机 Codex 登录' : '尚未找到本机 Codex', ...(codexPath ? { path: codexPath } : {}) },
    { id: 'codex', name: 'Codex · App Server', protocol: 'Codex App Server', available: !!codexPath, version, detail: '官方原生协议', ...(codexPath ? { path: codexPath } : {}) },
    { id: 'bot', name: '练习机器人', protocol: 'Local rules', available: true, detail: '无需模型，不消耗订阅额度' },
  ] };
}
