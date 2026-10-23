import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export interface ProcessCommand { command: string; args: string[]; env?: NodeJS.ProcessEnv }
export class JsonRpcProcess extends EventEmitter {
  private child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private exited = false;
  private stderr = '';
  onRequest?: (method: string, params: any) => Promise<unknown>;
  constructor(command: ProcessCommand, cwd?: string) {
    super();
    this.child = spawn(command.command, command.args, { cwd, env: command.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      let message: any;
      try { message = JSON.parse(line); } catch { return; }
      if (message.method) {
        if (process.env.AGENT_GAME_DEBUG === '1') console.error('[agent RPC]', message.method, message.params?.update?.sessionUpdate ?? message.params?.turn?.status ?? '', message.method === 'error' ? String(message.params?.error?.message ?? '').replace(/https?:\/\/\S+/g, '[endpoint]').slice(0, 250) : '');
        if (message.id !== undefined) {
          Promise.resolve(this.onRequest?.(message.method, message.params)).then(result => {
            this.write({ jsonrpc: '2.0', id: message.id, result: result ?? {} });
          }).catch(() => this.write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'This client only exposes game tools.' } }));
        } else this.emit('notification', message.method, message.params);
      } else if (this.pending.has(message.id)) {
        const pending = this.pending.get(message.id)!;
        clearTimeout(pending.timer); this.pending.delete(message.id);
        if (message.error) {
          if (process.env.AGENT_GAME_DEBUG === '1' && message.error.data) console.error('[RPC error detail]', JSON.stringify(message.error.data).replace(/https?:\/\/[^\s"\\]+/g, '[endpoint]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+|[A-Za-z0-9_-]{40,}/g, '[redacted]').slice(0, 1200));
          const detail = typeof message.error.data?.details === 'string' ? `：${message.error.data.details}` : '';
          pending.reject(new Error(`${message.error.message ?? 'RPC request failed'}${detail}`.replace(/https?:\/\/\S+/g, '[endpoint]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 700)));
        }
        else pending.resolve(message.result);
      }
    });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-3000); });
    this.child.stdin.on('error', () => {});
    this.child.on('error', error => this.fail(new Error(`无法启动 agent：${error.message}`)));
    this.child.on('exit', (code, signal) => {
      lines.close();
      const detail = this.stderr.split(/\r?\n/).find(line => /error|missing|required|failed/i.test(line))?.replace(/https?:\/\/\S+/g, '[endpoint]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi, '[redacted]').slice(0, 220);
      this.fail(new Error(`Agent 进程已退出（${signal ?? code ?? 'unknown'}）${detail ? `：${detail}` : ''}`));
    });
  }
  private fail(error: Error): void {
    if (this.exited) return;
    this.exited = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear(); this.emit('exit', error);
  }
  private write(message: unknown): void {
    if (!this.exited && !this.child.stdin.destroyed) this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  notify(method: string, params: unknown = {}): void { this.write({ jsonrpc: '2.0', method, params }); }
  call<T = any>(method: string, params: unknown = {}, timeoutMs = 45_000): Promise<T> {
    if (this.exited) return Promise.reject(new Error('Agent 进程已经关闭'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} 请求超时`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }
  async close(): Promise<void> {
    if (this.exited) return;
    this.fail(new Error('Agent 会话已关闭'));
    // Closing stdio asks adapters to shut down their child app-server as well.
    this.child.stdin.end();
    if (this.child.exitCode === null) {
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => {
          if (process.platform === 'win32' && this.child.pid && this.child.exitCode === null) {
            execFile('taskkill.exe', ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve());
          } else { this.child.kill(); resolve(); }
        }, 1800);
        timeout.unref();
        this.child.once('exit', () => { clearTimeout(timeout); resolve(); });
      });
    }
    this.removeAllListeners();
  }
}

export function abortError(): Error { const error = new Error('已暂停'); error.name = 'AbortError'; return error; }
