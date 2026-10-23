import { CONNECTOR_PORT, PROTOCOL_VERSION, type AgentSettings, type BrowserToolRequest, type ConnectorEvent, type ConnectorInfo, type SessionRequest, type ToolResponse } from '@agent-game/protocol';
import { connectorCompatibilityProblem } from './compatibility';

export class ConnectorVersionError extends Error {
  constructor(message: string, readonly connector: ConnectorInfo) { super(message); this.name = 'ConnectorVersionError'; }
}

export class ConnectorClient {
  private token = '';
  private stream: AbortController | null = null;
  private generation = 0;
  onEvent: (event: ConnectorEvent) => void = () => {};
  onTool: (request: BrowserToolRequest) => ToolResponse = () => ({ content: [], isError: true });
  onDisconnect: () => void = () => {};
  constructor(readonly endpoint = `http://127.0.0.1:${CONNECTOR_PORT}`, private fetcher: typeof fetch = (...args) => fetch(...args)) {}
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.endpoint}${path}`, { method, headers: { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(path.endsWith('/turn') ? 200_000 : 100_000) });
    } catch { throw new Error('无法连接本机连接器。请双击启动连接器，并在浏览器提示时允许访问本地网络。'); }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? '连接器请求失败');
    return data as T;
  }
  async connect(): Promise<ConnectorInfo> {
    const info = await this.request<ConnectorInfo>('/health');
    const problem = connectorCompatibilityProblem(info);
    if (problem) throw new ConnectorVersionError(problem, info);
    const result = await this.request<{ token: string; info: ConnectorInfo }>('/api/connect', 'POST', { protocolVersion: PROTOCOL_VERSION });
    this.token = result.token;
    const stream = new AbortController(); this.stream = stream; const generation = ++this.generation;
    await new Promise<void>((resolve, reject) => {
      let ready = false;
      const timer = setTimeout(() => { stream.abort(); reject(new Error('连接器握手超时，请重试')); }, 12_000);
      void (async () => {
        const response = await this.fetcher(`${this.endpoint}/api/events`, { headers: { Authorization: `Bearer ${this.token}` }, signal: stream.signal });
        if (!response.ok || !response.body) throw new Error('无法建立本机事件连接');
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let separator: number;
          while ((separator = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, separator); buffer = buffer.slice(separator + 2);
            const data = frame.split('\n').find(line => line.startsWith('data: '))?.slice(6); if (!data) continue;
            const event = JSON.parse(data) as ConnectorEvent;
            if (event.type === 'ready') { ready = true; clearTimeout(timer); resolve(); }
            if (event.type === 'tool') {
              const response = this.onTool(event.request);
              void this.request('/api/tool-results', 'POST', { id: event.request.id, response }).catch(() => {});
            } else this.onEvent(event);
          }
        }
        if (!stream.signal.aborted) throw new Error('连接器已断开');
      })().catch(error => { if (!ready) { clearTimeout(timer); reject(error); } }).finally(() => {
        clearTimeout(timer);
        if (generation === this.generation) { this.token = ''; this.onDisconnect(); }
      });
    });
    return result.info;
  }
  createSession(request: SessionRequest): Promise<{ sessionId: string }> { return this.request('/api/sessions', 'POST', request); }
  playTurn(sessionId: string, prompt: string, revision: number, settings?: AgentSettings): Promise<{ acted: boolean }> { return this.request(`/api/sessions/${encodeURIComponent(sessionId)}/turn`, 'POST', { prompt, revision, settings }); }
  async pauseTurn(): Promise<void> { if (this.token) await this.request('/api/pause', 'POST'); }
  async stopSessions(): Promise<void> { if (this.token) await this.request('/api/sessions', 'DELETE'); }
  async disconnect(): Promise<void> {
    this.generation++;
    if (this.token) await this.request('/api/disconnect', 'POST').catch(() => {});
    this.stream?.abort(); this.stream = null; this.token = '';
  }
}
