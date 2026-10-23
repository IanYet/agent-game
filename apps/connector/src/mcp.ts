import type { Express } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { GameTool } from '@agent-game/protocol';
import type { LocalBridge } from './bridge';

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
export function registerMcp(app: Express, bridge: LocalBridge): void {
  app.post('/mcp/:roomId/:token', async (req, res) => {
    const player = bridge.mcpSeat(req.params.roomId as string, req.params.token as string);
    if (!player) { res.status(401).json({ error: '无效或已过期的座位凭据' }); return; }
    const server = new McpServer({ name: 'agent_game', version: '0.1.0' }, { instructions: '使用 game_get_state 读取自己的手牌，以最新 revision 和 actionId 执行一次 game_act 后立即结束任务。' });
    const proxy = async (tool: GameTool, args: Record<string, unknown> = {}) => {
      try { return await bridge.callBrowser({ roomId: player.roomId, seat: player.seat, tool, args }); }
      catch (error: any) { return { content: [{ type: 'text' as const, text: JSON.stringify({ error: error.message }) }], isError: true }; }
    };
    server.registerTool('game_get_state', { description: '读取自己的手牌、公开牌局、轮次与revision。其他玩家只返回余牌数。预览12个合法行动。', inputSchema: {}, annotations: readOnly }, async () => proxy('game_get_state'));
    server.registerTool('game_legal_actions', { description: '获取当前座位的合法行动列表，使用 actionId 出牌。', inputSchema: { offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(80) }, annotations: readOnly }, async args => proxy('game_legal_actions', args));
    server.registerTool('game_act', { description: '用最新 revision 和合法 actionId 执行一次本座位行动。成功后立即结束任务。', inputSchema: { actionId: z.string().min(1).max(300), revision: z.number().int().min(1) }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }, async args => proxy('game_act', args));
    server.registerTool('game_rules', { description: '获取当前游戏的规则与计分方法。', inputSchema: {}, annotations: readOnly }, async () => proxy('game_rules'));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: '游戏 MCP 请求失败' }, id: null }); }
  });
  app.all('/mcp/:roomId/:token', (_req, res) => res.status(405).set('Allow', 'POST').end());
}
