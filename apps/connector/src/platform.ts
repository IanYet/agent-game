import { dirname, join, posix } from 'node:path';
import { homedir } from 'node:os';
import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export function dataDirectory(platform = process.platform, home = homedir(), env = process.env): string {
  if (env.AGENT_GAME_DATA_DIR) return env.AGENT_GAME_DATA_DIR;
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'AgentArcade');
  return join(env.LOCALAPPDATA ?? join(home, '.local', 'share'), 'AgentArcade');
}

export function macSearchPath(home: string, runtime: string, inherited = '', login = '', nodeVersions: string[] = []): string {
  const join = posix.join;
  return [...new Set([
    runtime, ...inherited.split(':'), ...login.split(':'),
    '/opt/homebrew/bin', '/usr/local/bin', join(home, '.local/bin'),
    join(home, '.npm-global/bin'), join(home, '.volta/bin'), join(home, '.asdf/shims'),
    join(home, '.local/share/fnm/aliases/default/bin'),
    ...nodeVersions.map(v => join(home, '.nvm/versions/node', v, 'bin')),
    '/usr/bin', '/bin', '/usr/sbin', '/sbin',
  ].filter(p => p.startsWith('/')))].join(':');
}

// Finder does not inherit the user's terminal PATH. Read only a bounded login
// shell PATH, then add common installations and the embedded Node for CLI shims.
export async function preparePlatformEnvironment(): Promise<void> {
  if (process.platform !== 'darwin') return;
  const home = homedir();
  let login = '';
  if (process.env.AGENT_GAME_SKIP_LOGIN_PATH !== '1') {
    try {
      const { stdout } = await exec('/bin/zsh', ['-l', '-c', 'printf "\\036AGENT_GAME_PATH=%s\\037" "$PATH"'], { timeout: 4000, maxBuffer: 64 * 1024 });
      login = /\x1eAGENT_GAME_PATH=([^\x1f]*)\x1f/.exec(stdout)?.[1] ?? '';
    } catch { /* A broken shell profile must not prevent the GUI from starting. */ }
  }
  const versions = (await readdir(join(home, '.nvm/versions/node')).catch(() => []))
    .filter(v => /^v\d+\.\d+\.\d+$/.test(v)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  process.env.PATH = macSearchPath(home, dirname(process.execPath), process.env.PATH, login, versions);
}
