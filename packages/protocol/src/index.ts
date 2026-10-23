import type { ArcadeView, GameId, PlayerKind, Seat } from '@agent-game/core';

export const CONNECTOR_PORT = 3211;
export const APP_VERSION = '0.3.0';
export const PROTOCOL_VERSION = 3;
export type HarnessId = Exclude<PlayerKind, 'human'>;
export type AgentStatus = 'idle' | 'connecting' | 'ready' | 'thinking' | 'error' | 'paused';
export interface SeatRuntime { seat: Seat; kind: PlayerKind; status: AgentStatus; sessionId?: string; conversationId?: string; message?: string; lastTool?: string; turns: number; tokens: number }
export interface HarnessInfo { id: HarnessId; name: string; protocol: string; available: boolean; path?: string; version?: string; detail?: string; models?: ModelInfo[]; auth?: 'ready' | 'missing' | 'unknown'; ephemeral?: boolean }
export interface ModelInfo { id: string; name: string; isDefault: boolean; defaultReasoningEffort?: string; supportedReasoningEfforts?: Array<{ effort: string; description: string }> }
export interface AgentSettings { model?: string; reasoningEffort?: string }
export interface ConnectorInfo { version: string; protocolVersion: number; platform: string; port: number; harnesses: HarnessInfo[]; models: ModelInfo[]; auth: 'chatgpt' | 'missing' | 'apiKey' | 'unknown' }
export function modelsForHarness(connector: ConnectorInfo | null, kind: PlayerKind): ModelInfo[] {
  const models = connector?.harnesses.find(h => h.id === kind)?.models;
  return models ?? (kind === 'codex' || kind === 'codex-acp' ? connector?.models ?? [] : []);
}
export interface MatchSummary { id: string; gameId: GameId; round: number; endedAt: string; players: Array<{ name: string; kind: PlayerKind; score: number; delta: number }>; winner: string; actions: number }
export interface AppSnapshot { connector: ConnectorInfo | null; connected: boolean; connectorUpdateRequired: boolean; game: ArcadeView | null; seats: SeatRuntime[]; paused: boolean; persistConversations: boolean; error: string | null; history: MatchSummary[] }
export type GameTool = 'game_get_state' | 'game_legal_actions' | 'game_act' | 'game_rules';
export interface BrowserToolRequest { id: string; roomId: string; handId?: string; seat: Seat; tool: GameTool; args: Record<string, unknown> }
export interface ToolResponse { [key: string]: unknown; content: Array<{ type: 'text'; text: string }>; isError?: boolean }
export interface SessionRequest extends AgentSettings { roomId: string; gameId?: GameId; handId?: string; initialState?: string; round?: number; persistConversation?: boolean; seat: Seat; kind: HarnessId; name: string }
export type ConnectorEvent =
  | { type: 'ready'; info: ConnectorInfo }
  | { type: 'tool'; request: BrowserToolRequest }
  | { type: 'activity'; seat: Seat; text: string; tool?: string }
  | { type: 'usage'; seat: Seat; tokens: number };
