import { discoverHarnesses } from '../apps/connector/src/harness/discovery';
import { inspectCodex } from '../apps/connector/src/harness/codex';

const discovery = await discoverHarnesses(process.cwd());
console.log('Codex installed:', !!discovery.codexPath);
console.log('ACP adapter installed:', !!discovery.acpPath);
if (!discovery.codexPath) process.exitCode = 1;
else {
  const info = await inspectCodex(discovery.codexPath);
  console.log('Authentication:', info.auth);
  console.log('Unrelated MCP servers to disable for game players:', info.mcpServers.join(', ') || '(none)');
  console.log('Model catalog:', info.models.map(m => m.name).join(', '));
  console.log('This check performs no inference and consumes no game turns.');
}
