import express, { type ErrorRequestHandler } from 'express';
import { createServer } from 'node:http';
import { z } from 'zod';
import type { ConnectorEvent } from '@agent-game/protocol';
import type { LocalBridge } from './bridge';
import { registerMcp } from './mcp';

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
  app.use(express.json({ limit: '128kb' }));
  app.get('/health', (_req, res) => res.json({ name: 'Agent Arcade Connector', ...bridge.info }));
  app.post('/api/connect', (req, res) => {
    if (!req.headers.origin || !origins.has(req.headers.origin)) { res.status(403).json({ error: '请从受信任的游戏网页点击连接' }); return; }
    z.object({ protocolVersion: z.literal(1) }).parse(req.body);
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
    const body = z.object({ id: z.string().uuid(), response: z.object({ content: z.array(z.object({ type: z.literal('text'), text: z.string().max(100_000) })).max(5), isError: z.boolean().optional() }) }).parse(req.body);
    bridge.toolResult(body.id, body.response); res.json({ ok: true });
  });
  app.post('/api/sessions', async (req, res) => {
    const request = z.object({ roomId: z.string().uuid(), seat: z.union([z.literal(0), z.literal(1), z.literal(2)]), kind: z.enum(['codex', 'codex-acp']), name: z.string().min(1).max(32), model: z.string().min(1).max(100).optional() }).parse(req.body);
    res.status(201).json(await bridge.createSession(request));
  });
  app.post('/api/sessions/:id/turn', async (req, res) => {
    const { prompt, revision } = z.object({ prompt: z.string().min(1).max(6000), revision: z.number().int().min(1) }).parse(req.body);
    res.json(await bridge.playTurn(req.params.id as string, prompt, revision));
  });
  app.delete('/api/sessions', async (_req, res) => { await bridge.stopSessions(); res.json({ ok: true }); });
  app.post('/api/disconnect', async (_req, res) => { await bridge.disconnect(); res.json({ ok: true }); });
  registerMcp(app, bridge);
  app.get('/', (_req, res) => res.type('text/plain').send('同桌本地连接器正在运行。请在独立的游戏网页点击 Codex 连接。'));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => { if (!res.headersSent) res.status(400).json({ error: error instanceof z.ZodError ? '请求参数不符合要求' : String(error.message ?? '连接失败').slice(0, 500) }); };
  app.use(errorHandler);
  const server = createServer(app);
  return {
    app, server,
    listen: () => new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(bridge.info.port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); }),
    close: async () => { await bridge.disconnect(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
