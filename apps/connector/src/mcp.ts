import {CONNECTOR_VERSION} from './version';
import type { Express } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toolResult } from '@agent-game/protocol';
import type { LocalBridge } from './bridge';

export function registerMcp(app: Express, bridge: LocalBridge): void {
  app.post('/mcp/:scopeId/:token', async (req, res) => {
    const scopeId = req.params.scopeId as string, token = req.params.token as string;
    const player = bridge.mcpPlayer(scopeId, token);
    if (!player) { res.status(401).json({ error: '无效或已过期的玩家凭据' }); return; }
    const server = new Server({ name: 'agent_game', version: CONNECTOR_VERSION }, { capabilities: { tools: {} }, instructions: player.request.instructions });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: player.registry.definitions.map(({ requiresDecision: _authority, ...tool }) => tool) }));
    server.setRequestHandler(CallToolRequestSchema, async request => {
      try { return await bridge.dispatchTool(scopeId, token, request.params.name, request.params.arguments ?? {}); }
      catch (error: any) { return toolResult({ error: error.message }, true); }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'MCP 请求失败' }, id: null }); }
  });
  app.all('/mcp/:scopeId/:token', (_req, res) => res.status(405).set('Allow', 'POST').end());
}
