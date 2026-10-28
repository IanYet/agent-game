import type { JsonRpcProcess } from './rpc';

export interface RateLimitNotice { retryAt?: number; detail?: string }

const rateLimitText = /\b(?:HTTP|status(?:\s+code)?)\W*429\b|\b429\s+Too Many Requests\b|\btoo many requests\b|\brate[_ -]?limit(?:ed|[_ -](?:exceeded|error|reached))?\b|请求过于频繁|请求频率过高|触发限流/i;
const rateLimitCode = /^(?:ratelimited|ratelimitexceeded|ratelimiterror|toomanyrequests|usagelimitexceeded)$/;

// Read provider error metadata only; player messages and game tool results are
// never trusted as signals to stop other players. No raw headers are recorded.
export function rateLimitNotice(error: unknown, now = Date.now()): RateLimitNotice | null {
  let limited = false, retryAt: number | undefined;
  const seen = new Set<object>();
  const details = new Set<string>();
  const remember = (time: number) => { if (Number.isFinite(time) && time > now && time <= 8.64e15) retryAt = Math.max(retryAt ?? 0, time); };
  const seconds = (value: unknown, multiplier = 1000) => {
    const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
    if (Number.isFinite(number) && number >= 0) remember(now + Math.max(1000, number * multiplier));
  };
  const timestamp = (value: unknown) => {
    if (typeof value === 'number') remember(value < 1e12 ? value * 1000 : value);
    else if (typeof value === 'string') { if (/^\d+(?:\.\d+)?$/.test(value)) timestamp(Number(value)); else remember(Date.parse(value)); }
  };
  const text = (value: string) => {
    limited ||= rateLimitText.test(value);
    const header = /["']?retry[-_ ]after["']?\s*[:=]\s*["']?([^"'\r\n}]+)/i.exec(value)?.[1]?.trim();
    if (header) { if (/^\d+(?:\.\d+)?$/.test(header)) seconds(header); else timestamp(header); }
    const delay = /\bretry(?:ing)?(?:\s+again)?\s+(?:in|after)\s+(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s|minutes?|min|m|hours?|h)\b/i.exec(value) ?? /\bretrying\b[^\r\n]{0,100}?\bin\s+(\d+(?:\.\d+)?)\s*(ms|s)\b/i.exec(value);
    if (delay) seconds(delay[1], /^m(?:s|illisecond)/i.test(delay[2]) ? 1 : /^m/i.test(delay[2]) ? 60_000 : /^h/i.test(delay[2]) ? 3_600_000 : 1000);
    // Some ACP implementations put the original JSON error in details.
    if (value.length <= 32_768 && /^[\s]*[\[{]/.test(value)) { try { visit(JSON.parse(value), 1); } catch { /* Plain provider error text. */ } }
  };
  let count = 0;
  function visit(value: unknown, depth = 0): void {
    if (depth > 8 || ++count > 256) return;
    if (typeof value === 'string') { text(value); return; }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      const field = key.replace(/[-_\s]/g, '').toLowerCase();
      if (['message', 'title', 'details', 'additionaldetails'].includes(field) && typeof entry === 'string') details.add(entry);
      if (['httpstatuscode', 'statuscode', 'code', 'codexerrorinfo'].includes(field) && (typeof entry === 'string' || typeof entry === 'number')) details.add(`${key}: ${entry}`);
      if (['httpstatuscode', 'statuscode', 'status', 'code'].includes(field) && (entry === 429 || entry === '429')) limited = true;
      if (['code', 'type', 'category', 'codexerrorinfo'].includes(field) && typeof entry === 'string' && rateLimitCode.test(entry.replace(/[-_\s]/g, '').toLowerCase())) limited = true;
      if (['retryafterms', 'retryaftermilliseconds'].includes(field)) seconds(entry, 1);
      else if (['retryafter', 'retryafterseconds'].includes(field)) {
        if (typeof entry === 'string' && !/^\d+(?:\.\d+)?$/.test(entry.trim())) timestamp(entry);
        else seconds(entry);
      } else if (['retryat', 'retryatms', 'resetsat', 'resetat'].includes(field)) timestamp(entry);
      visit(entry, depth + 1);
    }
  }
  visit(error);
  const detail = [...details].join('\n').replace(/https?:\/\/\S+/gi, '[endpoint]').replace(/Bearer\s+[^\s"']+|sk-[A-Za-z0-9_-]+/gi, '[redacted]')
    .replace(/((?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[redacted]').slice(0, 1600);
  return limited ? { ...(retryAt ? { retryAt } : {}), ...(detail ? { detail } : {}) } : null;
}

export function observeRateLimits(rpc: JsonRpcProcess, report: (notice: RateLimitNotice) => void, onRetry?: (notice: RateLimitNotice) => void): void {
  rpc.on('message', (direction: string, message: any) => {
    if (direction !== 'received') return;
    let error = message.error;
    let retrying = false;
    if (message.result?.stopReason && !['end_turn', 'stop_sequence', 'cancelled'].includes(message.result.stopReason)) error = message.result._meta ?? message.result.error;
    if (message.method === 'error') { error = message.params?.error; retrying = message.params?.willRetry === true; }
    if (message.method === 'turn/completed') error = message.params?.turn?.error;
    if (message.method === 'session/update') {
      const update = message.params?.update;
      if (update?.sessionUpdate !== 'session_info_update') return;
      error = update._meta?.codex?.error ?? update._meta?.jetbrains?.air?.sessionFailure;
      retrying = error?.willRetry === true || error?.severity === 'warning';
    }
    if (!error) return;
    const notice = rateLimitNotice(error);
    // A retry warning is not a failed turn. Cancelling here would interrupt
    // the harness's own backoff and replace a recoverable 429 with our cooldown.
    if (notice) { if (retrying) onRetry?.(notice); else report(notice); }
  });
}
