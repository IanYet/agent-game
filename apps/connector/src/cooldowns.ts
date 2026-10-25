import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { HarnessId } from '@agent-game/protocol';
import type { RateLimitNotice } from './harness/rate-limit';

type Channel = 'codex' | 'dsh' | 'workbuddy';
interface Cooldown { retryAt: number; supplied: boolean }
export const cooldownChannel = (kind: HarnessId): Channel => kind === 'codex-acp' ? 'codex' : kind;
const names: Record<Channel, string> = { codex: 'Codex', dsh: 'DeepSeek Harness', workbuddy: 'WorkBuddy' };

export class UpstreamCooldownError extends Error {
  constructor(readonly retryAt: number, channel: Channel) {
    const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
    const wait = seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
    super(`${names[channel]} 上游限流，还需等待 ${wait}。冷却结束后点击继续；重复点击不会重新请求。`);
    this.name = 'UpstreamCooldownError';
  }
}

export class UpstreamCooldowns {
  private entries = new Map<Channel, Cooldown>();
  private loaded: Promise<void>;
  private saving = Promise.resolve();
  private file: string;
  constructor(directory: string) {
    this.file = join(directory, 'cooldowns.json');
    this.loaded = this.load();
  }
  ready(): Promise<void> { return this.loaded; }
  error(kind: HarnessId): UpstreamCooldownError | null {
    const channel = cooldownChannel(kind), entry = this.entries.get(channel);
    return entry && entry.retryAt > Date.now() ? new UpstreamCooldownError(entry.retryAt, channel) : null;
  }
  record(kind: HarnessId, notice: RateLimitNotice): UpstreamCooldownError {
    const channel = cooldownChannel(kind), now = Date.now(), previous = this.entries.get(channel);
    const supplied = notice.retryAt !== undefined && notice.retryAt > now;
    const proposed = { retryAt: supplied ? notice.retryAt! : now + 600_000, supplied };
    const current = previous && previous.retryAt > now ? previous : undefined;
    // An explicit server deadline replaces an estimate; later real deadlines
    // may extend it. Duplicate warnings without a hint never restart the clock.
    const next = !current || (!current.supplied && supplied) ? proposed : supplied ? { retryAt: Math.max(current.retryAt, proposed.retryAt), supplied: true } : current;
    this.entries.set(channel, next);
    this.saving = this.saving.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const channels = Object.fromEntries([...this.entries].filter(([, value]) => value.retryAt > Date.now()));
      const temporary = `${this.file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 1, channels }) + '\n', 'utf8');
      await rename(temporary, this.file);
    }).catch(() => { console.warn('限流冷却时间未能写入本机目录；本次进程内的冷却仍然有效。'); });
    return new UpstreamCooldownError(next.retryAt, channel);
  }
  flush(): Promise<void> { return this.saving; }
  private async load(): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      if (saved.version !== 1 || !saved.channels || typeof saved.channels !== 'object') return;
      for (const channel of ['codex', 'dsh', 'workbuddy'] as const) {
        const entry = saved.channels[channel];
        if (Number.isFinite(entry?.retryAt) && entry.retryAt > Date.now() && entry.retryAt <= 8.64e15) this.entries.set(channel, { retryAt: entry.retryAt, supplied: entry.supplied === true });
      }
    } catch { /* No unexpired cooldown saved for this connector. */ }
  }
}
