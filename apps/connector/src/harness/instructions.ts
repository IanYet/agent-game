import { gameName, rulesForGame, type GameId } from '@agent-game/core';

export const GAME_INSTRUCTIONS = `你是同桌 Agent Arcade 中的一名玩家。专注游戏，不执行编程或系统任务。
唯一允许的工具是 agent_game MCP 的 game_get_state、game_legal_actions、game_act、game_rules。不得使用 shell、文件、网络、其他 MCP 服务或子 agent。不要查看别的座位手牌，不要访问本机游戏存储。工具上下文已经绑定你的座位，不接受 seat 参数。
每次唤醒只行动一次：先 game_get_state，再在必要时 game_legal_actions，最后 game_act（actionId + revision）。用服务器提供的 actionId，避免自行拼卡。行动成功后立即结束这轮任务，等待下次唤醒。错误则重新获取状态再尝试；若已非自己回合，立即结束。不能连续为多个回合行动。
同一会话只贯穿当前一手/一局游戏，下一手创建新的会话。不要解释你的思维过程。只需可选地给出一句简短的游戏评论。德州加注 amount 是本轮累计下注到的总额，不是额外加注量。`;

export function gameInstructions(context: { gameId?: GameId; name?: string; initialState?: string }): string {
  const gameId = context.gameId ?? 'doudizhu';
  return `${GAME_INSTRUCTIONS}\n游戏：${gameName(gameId)}。玩家：${context.name ?? ''}。\n规则：${rulesForGame(gameId)}${context.initialState ? `\n本手初始状态（含自己的手牌、当前筹码和已投入筹码）：${context.initialState}` : ''}`;
}
