import { discoverHarnesses } from '../apps/connector/src/harness/discovery';
import { inspectCodex } from '../apps/connector/src/harness/codex';
import { ExternalAcpAdapter } from '../apps/connector/src/harness/external-acp';

// Read/probe native interfaces only. No prompts, inference, login, or credential copying.
const discovery = await discoverHarnesses(process.cwd());
for (const harness of discovery.harnesses) {
  try {
    if (harness.id === 'codex' || harness.id === 'codex-acp') {
      if (!discovery.codexPath || (harness.id === 'codex-acp' && !discovery.acpPath)) { console.log(`${harness.name}: 未安装`); continue; }
      const inspected = await inspectCodex(discovery.codexPath);
      console.log(`${harness.name}: auth=${inspected.auth}; ${inspected.models.length} 个本机模型`);
    } else {
      const path = harness.id === 'dsh' ? discovery.dshPath : discovery.workbuddyPath;
      if (!path) { console.log(`${harness.name}: ${harness.detail}`); continue; }
      const inspected = await new ExternalAcpAdapter(harness.id, path).inspect();
      console.log(`${harness.name}: ACP/HTTP MCP 已就绪；${inspected.models.length} 个独立模型；未进行推理或确认订阅权益`);
    }
  } catch (error: any) { console.log(`${harness.name}: ${String(error.message).replace(/https?:\/\/\S+/g, '[endpoint]').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi, '[redacted]').slice(0, 500)}`); }
}
