import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { discoverHarnesses } from './harness/discovery';
import { CodexAdapter, inspectCodex } from './harness/codex';
import { AcpAdapter } from './harness/acp';
import { LocalBridge } from './bridge';
import { createConnectorServer } from './server';
import type { ConnectorInfo, HarnessAdapter } from './types';
import { APP_VERSION, PROTOCOL_VERSION } from '@agent-game/protocol';

async function main() {
  const port = Number(process.env.AGENT_GAME_PORT ?? 3211);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('AGENT_GAME_PORT 必须是 1024–65535 的端口');
  const root = process.env.AGENT_GAME_ROOT ? resolve(process.env.AGENT_GAME_ROOT) : process.argv[1].endsWith('.cjs') ? resolve(dirname(process.argv[1]), '../..') : process.cwd();
  const directory = process.env.AGENT_GAME_DATA_DIR ?? join(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'AgentArcade');
  let allowedOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173'];
  try { const config = JSON.parse(await readFile(join(root, 'connector.config.json'), 'utf8')); if (Array.isArray(config.allowedOrigins)) allowedOrigins = config.allowedOrigins; } catch { /* Development origins above. */ }
  if (process.env.AGENT_GAME_WEB_ORIGINS) allowedOrigins = process.env.AGENT_GAME_WEB_ORIGINS.split(',').map(v => new URL(v.trim()).origin);
  const discovery = await discoverHarnesses(root);
  const connector: ConnectorInfo = { version: APP_VERSION, protocolVersion: PROTOCOL_VERSION, platform: process.platform, port, harnesses: discovery.harnesses, models: [], auth: 'unknown' };
  let otherMcpServers: string[] = [];
  if (discovery.codexPath) {
    try {
      const inspection = await inspectCodex(discovery.codexPath);
      connector.models = inspection.models; connector.auth = inspection.auth; otherMcpServers = inspection.mcpServers;
      for (const harness of connector.harnesses) if (harness.id === 'codex' || harness.id === 'codex-acp') harness.models = inspection.models;
    } catch (error: any) {
      connector.auth = 'unknown';
      console.error(`Codex 检测失败：${String(error.message ?? '未知错误').replace(/https?:\/\/\S+/g, '[endpoint]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi, '[redacted]').slice(0, 350)}`);
    }
  } else connector.auth = 'missing';
  const adapters = new Map<string, HarnessAdapter>();
  if (discovery.codexPath) adapters.set('codex', new CodexAdapter(discovery.codexPath, otherMcpServers));
  if (discovery.acpPath && discovery.codexPath) adapters.set('codex-acp', new AcpAdapter(discovery.acpPath, discovery.codexPath, otherMcpServers));
  const bridge = new LocalBridge(connector, adapters, directory);
  const service = createConnectorServer(bridge, allowedOrigins);
  bridge.on('connected', () => console.log('AGENT_ARCADE_STATUS:connected'));
  bridge.on('disconnect', () => console.log('AGENT_ARCADE_STATUS:ready'));
  try { await service.listen(); } catch (error: any) {
    if (error.code === 'EADDRINUSE') throw new Error(`端口 ${port} 已在使用。连接器可能已经启动，请回网页点击连接。`);
    throw error;
  }
  console.log(`\n  同桌 · Agent Arcade 本地连接器 v0.2.0\n\n  状态：已就绪，等待网页连接\n  监听：127.0.0.1:${port}\n  Codex：${connector.auth === 'chatgpt' ? '已使用 ChatGPT 订阅登录' : '请先在 Codex 中登录 ChatGPT'}\n\n  现在回到游戏网页，点击「连接 Codex」。\n  最小化或关闭窗口会缩到托盘；请从托盘菜单选择「退出连接器」来退出。\n`);
  console.log('AGENT_ARCADE_STATUS:ready');
  let stopping = false;
  const shutdown = async () => { if (stopping) return; stopping = true; await service.close(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
main().catch(error => { console.error(`\n连接器启动失败：${error.message}\n`); process.exitCode = 1; });
