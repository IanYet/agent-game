import type { HarnessContext } from '../types';
export function sessionInstructions(context: Pick<HarnessContext, 'instructions' | 'tools'>): string {
  return `你在同桌 Agent Arcade 的一个独立玩家会话中。只允许使用本会话 agent_game MCP 注册的工具：${context.tools.map(t => t.name).join('、')}。不得访问文件、终端、浏览器、其他 MCP 或子 Agent。工具已绑定你的身份和作用域；网页运行时校验决策是否有效。遵守网页给出的规则和决策完成条件，不代替其他玩家。\n\n${context.instructions}`;
}
