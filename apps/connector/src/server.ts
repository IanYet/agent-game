import express, { type ErrorRequestHandler } from 'express';
import { createServer } from 'node:http';
import { z } from 'zod';
import { PROTOCOL_VERSION, type ConnectorEvent, type SessionRequest } from '@agent-game/protocol';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { LocalBridge } from './bridge';
import { registerMcp } from './mcp';
import { UpstreamCooldownError } from './cooldowns';

export function createConnectorServer(bridge: LocalBridge, allowedOrigins: string[]) {
  const app = express(); app.disable('x-powered-by');
  const origins = new Set(allowedOrigins);
  const hosts = new Set([`127.0.0.1:${bridge.info.port}`, `localhost:${bridge.info.port}`]);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!hosts.has(req.headers.host ?? '') || (origin && !origins.has(origin))) { res.status(403).json({ error: '网页来源未获授权。请检查 connector.config.json 中的 allowedOrigins。' }); return; }
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); res.set('Access-Control-Allow-Private-Network', 'true');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
    res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.get('/health', (_req, res) => res.json({ name: 'Agent Arcade Connector', ...bridge.info }));
  app.post('/api/connect', (req, res) => {
    if (!req.headers.origin || !origins.has(req.headers.origin)) { res.status(403).json({ error: '请从受信任的游戏网页点击连接' }); return; }
    const requirements = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), requiredCapabilities: z.array(z.string()).default([]) }).parse(req.body);
    if (requirements.requiredCapabilities.some(capability => !bridge.info.capabilities.includes(capability))) throw new Error('连接器缺少网页所需能力，请下载最新连接器');
    const token = bridge.connect(req.headers.origin); res.json({ token, info: bridge.info });
  });
  app.use('/api', (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!bridge.authorized(token, req.headers.origin ?? '')) { res.status(401).json({ error: '本机连接已失效，请重新点击连接' }); return; }
    next();
  });
  app.get('/api/events', (req, res) => {
    const ownerToken = req.headers.authorization!.replace(/^Bearer /, '');
    bridge.attach();
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' }); res.flushHeaders();
    const send = (event: ConnectorEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: 'ready', info: bridge.info });
    const disconnect = () => res.end(); bridge.on('event', send); bridge.on('disconnect', disconnect);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    res.on('close', () => { clearInterval(heartbeat); bridge.off('event', send); bridge.off('disconnect', disconnect); void bridge.disconnect(ownerToken); });
  });
  app.post('/api/tool-results', (req, res) => {
    const body = z.object({ id: z.string().uuid(), response: z.unknown() }).parse(req.body);
    bridge.toolResult(body.id, CallToolResultSchema.parse(body.response)); res.json({ ok: true });
  });
  app.post('/api/sessions', async (req, res) => {
    const request = z.object({ scopeId: z.string().min(1).max(200), playerId: z.string().min(1).max(200), kind: z.enum(['codex', 'codex-acp', 'dsh', 'workbuddy']), name: z.string().min(1).max(100), instructions: z.string().max(200_000), tools: z.array(z.object({ name:z.string(), description:z.string(), inputSchema:z.record(z.unknown()) }).passthrough()).min(1).max(128), model: z.string().min(1).max(500).optional(), reasoningEffort: z.string().min(1).max(100).optional() }).parse(req.body);
    res.status(201).json(await bridge.createSession(request as unknown as SessionRequest));
  });
  app.post('/api/sessions/:id/turn', async (req, res) => {
    const { prompt, decisionId, settings } = z.object({ prompt: z.string().min(1).max(200_000), decisionId: z.string().min(1).max(300), settings: z.object({ model: z.string().min(1).max(500).optional(), reasoningEffort: z.string().min(1).max(100).optional() }).optional() }).parse(req.body);
    res.json(await bridge.playTurn(req.params.id as string, prompt, decisionId, settings));
  });
  app.post('/api/pause', async (_req, res) => { await bridge.pauseTurn(); res.json({ ok: true }); });
  app.delete('/api/sessions', async (req, res) => { const {ids}=z.object({ids:z.array(z.string()).optional()}).parse(req.body ?? {}); await bridge.stopSessions(ids); res.json({ ok: true }); });
  app.post('/api/disconnect', async (_req, res) => { await bridge.disconnect(); res.json({ ok: true }); });
  registerMcp(app, bridge);
  app.get('/', (_req, res) => res.type('text/plain').send('同桌本地连接器正在运行。请在独立的游戏网页点击连接本机。'));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof UpstreamCooldownError) { res.set('Retry-After', String(Math.max(1, Math.ceil((error.retryAt - Date.now()) / 1000)))); res.status(429).json({ error: error.message, retryAt: error.retryAt }); return; }
    res.status(400).json({ error: error instanceof z.ZodError ? '请求参数不符合要求' : String(error.message ?? '连接失败').slice(0, 500) });
  };
  app.use(errorHandler);
  const server = createServer(app);
  return {
    app, server,
    listen: () => new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(bridge.info.port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); }),
    close: async () => { await bridge.disconnect(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
