import type { GameView, PlayerKind, Seat } from '@agent-game/core';

export const CONNECTOR_PORT = 3211;
export const PROTOCOL_VERSION = 1;
export type HarnessId = 'codex' | 'codex-acp';
export type AgentStatus = 'idle' | 'connecting' | 'ready' | 'thinking' | 'error' | 'paused';
export interface SeatRuntime { seat: Seat; kind: PlayerKind; status: AgentStatus; sessionId?: string; message?: string; lastTool?: string; turns: number; tokens: number }
export interface HarnessInfo { id: 'codex' | 'codex-acp' | 'bot'; name: string; protocol: string; available: boolean; path?: string; version?: string; detail?: string }
export interface ModelInfo { id: string; name: string; isDefault: boolean }
export interface ConnectorInfo { version: string; protocolVersion: number; platform: string; port: number; harnesses: HarnessInfo[]; models: ModelInfo[]; auth: 'chatgpt' | 'missing' | 'apiKey' | 'unknown' }
export interface MatchSummary { id: string; round: number; endedAt: string; players: Array<{ name: string; kind: PlayerKind; score: number; delta: number }>; winner: string; actions: number }
export interface AppSnapshot { connector: ConnectorInfo | null; connected: boolean; game: GameView | null; seats: SeatRuntime[]; paused: boolean; error: string | null; history: MatchSummary[] }
export type GameTool = 'game_get_state' | 'game_legal_actions' | 'game_act' | 'game_rules';
export interface BrowserToolRequest { id: string; roomId: string; seat: Seat; tool: GameTool; args: Record<string, unknown> }
export interface ToolResponse { [key: string]: unknown; content: Array<{ type: 'text'; text: string }>; isError?: boolean }
export interface SessionRequest { roomId: string; seat: Seat; kind: HarnessId; name: string; model?: string }
export type ConnectorEvent =
  | { type: 'ready'; info: ConnectorInfo }
  | { type: 'tool'; request: BrowserToolRequest }
  | { type: 'activity'; seat: Seat; text: string; tool?: string }
  | { type: 'usage'; seat: Seat; tokens: number };
