import {CONNECTOR_VERSION} from './version';
import { dirname, join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { discoverHarnesses } from './harness/discovery';
import { CodexAdapter, inspectCodex } from './harness/codex';
import { AcpAdapter } from './harness/acp';
import { ExternalAcpAdapter } from './harness/external-acp';
import { LocalBridge } from './bridge';
import { createConnectorServer } from './server';
import type { ConnectorInfo, HarnessAdapter } from './types';
import { PROTOCOL_VERSION, CONNECTOR_CAPABILITIES } from '@agent-game/protocol';
import { dataDirectory, preparePlatformEnvironment } from './platform';

// Private launcher framing. Native windows consume JSON events, never translated
// log messages. No account credentials, session tokens or RPC payloads go here.
function launcherEvent(event: Record<string, unknown>) {
  if (process.env.AGENT_GAME_LAUNCHER === '1') console.log(`TONGZHUO_UI:${JSON.stringify(event)}`);
}

async function main() {
  launcherEvent({ event: 'starting' });
  await preparePlatformEnvironment();
  const port = Number(process.env.AGENT_GAME_PORT ?? 3211);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('AGENT_GAME_PORT 必须是 1024–65535 的端口');
  const root = process.env.AGENT_GAME_ROOT ? resolve(process.env.AGENT_GAME_ROOT) : process.argv[1].endsWith('.cjs') ? resolve(dirname(process.argv[1]), '../..') : process.cwd();
  const directory = dataDirectory();
  let allowedOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173'];
  try { const config = JSON.parse(await readFile(process.env.AGENT_GAME_CONFIG ?? join(root, 'connector.config.json'), 'utf8')); if (Array.isArray(config.allowedOrigins)) allowedOrigins = config.allowedOrigins; } catch { /* Development origins above. */ }
  if (process.env.AGENT_GAME_WEB_ORIGINS) allowedOrigins = process.env.AGENT_GAME_WEB_ORIGINS.split(',').map(v => new URL(v.trim()).origin);
  const discovery = await discoverHarnesses(root);
  const connector: ConnectorInfo = { version: CONNECTOR_VERSION, protocolVersion: PROTOCOL_VERSION, capabilities: [...CONNECTOR_CAPABILITIES], platform: process.platform, port, harnesses: discovery.harnesses, models: [], auth: 'unknown' };
  let otherMcpServers: string[] = [];
  let codexInspectionError: string | undefined;
  if (discovery.codexPath) {
    try {
      const inspection = await inspectCodex(discovery.codexPath);
      connector.models = inspection.models; connector.auth = inspection.auth; otherMcpServers = inspection.mcpServers;
      for (const harness of connector.harnesses) if (harness.id === 'codex' || harness.id === 'codex-acp') harness.models = inspection.models;
    } catch (error: any) {
      connector.auth = 'unknown';
      codexInspectionError = `Codex 检测失败：${String(error.message ?? '未知错误').replace(/https?:\/\/\S+/g, '[endpoint]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi, '[redacted]').slice(0, 350)}`;
      console.error(codexInspectionError);
    }
  } else connector.auth = 'missing';
  const adapters = new Map<string, HarnessAdapter>();
  for (const harness of connector.harnesses.filter(h => h.id === 'codex' || h.id === 'codex-acp')) {
    harness.available = harness.available && connector.auth === 'chatgpt';
    harness.auth = connector.auth === 'chatgpt' ? 'ready' : connector.auth === 'unknown' ? 'unknown' : 'missing'; harness.ephemeral = true;
    if (!discovery.codexPath) harness.detail = process.env.CODEX_PATH ? 'CODEX_PATH 指向的文件不存在，请修正路径后重新打开连接器' : '未找到本机 Codex，请安装 Codex，或用 CODEX_PATH 指定程序路径';
    else if (codexInspectionError) harness.detail = `${codexInspectionError}；程序路径：${discovery.codexPath}`;
    else if (connector.auth !== 'chatgpt') harness.detail = connector.auth === 'apiKey' ? '当前 Codex 使用 API Key 登录，请在 Codex 中改用已有 ChatGPT 订阅登录' : 'Codex 尚未登录，请在 Codex 中用已有 ChatGPT 订阅登录';
    else if (harness.id === 'codex-acp' && !discovery.acpPath) harness.detail = '已检测到 Codex 登录，但缺少 ACP 适配器，请更新连接器；也可选择 Codex · App Server';
  }
  if (discovery.codexPath && connector.auth === 'chatgpt') adapters.set('codex', new CodexAdapter(discovery.codexPath, otherMcpServers));
  if (discovery.acpPath && discovery.codexPath && connector.auth === 'chatgpt') adapters.set('codex-acp', new AcpAdapter(discovery.acpPath, discovery.codexPath, otherMcpServers));
  for (const id of ['dsh', 'workbuddy'] as const) {
    const path = id === 'dsh' ? discovery.dshPath : discovery.workbuddyPath, harness = connector.harnesses.find(h => h.id === id)!;
    if (!path) continue;
    const adapter = new ExternalAcpAdapter(id, path);
    try {
      const inspected = await adapter.inspect();
      Object.assign(harness, inspected, { available: true, auth: 'unknown', detail: '已验证公开 ACP 接口与独立模型目录；使用此 Harness 自己的登录，实际推理时确认权益' });
      adapters.set(id, adapter);
    } catch (error: any) {
      harness.available = false; harness.detail = String(error.message ?? '接口检测失败').replace(/https?:\/\/\S+/g, '[endpoint]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi, '[redacted]').slice(0, 350);
    }
  }
  const bridge = new LocalBridge(connector, adapters, directory);
  const service = createConnectorServer(bridge, allowedOrigins);
  bridge.on('connected', () => launcherEvent({ event: 'connection', connected: true }));
  bridge.on('disconnect', () => launcherEvent({ event: 'connection', connected: false }));
  try { await service.listen(); } catch (error: any) {
    if (error.code === 'EADDRINUSE') throw new Error(`端口 ${port} 已被占用。请在连接器窗口的「端口与进程」中重新检测，确认占用者后选择退出或清理。`);
    throw error;
  }
  console.log(`\n  同桌 · Agent Arcade 本地连接器 v${CONNECTOR_VERSION}\n\n  状态：已就绪，等待网页连接\n  监听：127.0.0.1:${port}\n  Harness：${connector.harnesses.filter(h => h.available).map(h => h.name).join('、') || '暂未找到可用 Harness，请查看网页本地连接说明'}\n  Codex：${connector.auth === 'chatgpt' ? '已使用 ChatGPT 订阅登录' : '未就绪；其他 Harness 使用各自登录'}\n\n  现在回到游戏网页，点击「连接本机」。\n  请从${process.platform === 'darwin' ? '菜单栏「同桌」' : '窗口或托盘菜单'}选择「退出连接器」来退出。\n`);
  launcherEvent({ event: 'ready', pid: process.pid, port, version: CONNECTOR_VERSION,
    harnesses: connector.harnesses.map(({ id, name, available, detail, version }) => ({ id, name, available, detail, version })) });
  let stopping = false;
  const shutdown = async () => { if (stopping) return; stopping = true; await service.close(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  if (process.env.AGENT_GAME_LAUNCHER === '1' && process.platform === 'win32') {
    const { createInterface } = await import('node:readline');
    createInterface({ input: process.stdin }).on('line', line => {
      try { if (JSON.parse(line).command === 'stop') void shutdown(); } catch { /* Ignore malformed private input. */ }
    }).on('close', () => void shutdown());
  }
}
main().catch(error => {
  const message = String(error.message ?? error).replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi, '[redacted]').slice(0, 2000);
  launcherEvent({ event: 'error', message });
  console.error(`\n连接器启动失败：${message}\n`); process.exitCode = 1;
});
