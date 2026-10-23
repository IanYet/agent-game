import type { Seat } from '@agent-game/core';
export type { HarnessInfo, ModelInfo, ConnectorInfo } from '@agent-game/protocol';
export interface AgentSession {
  sessionId: string;
  playTurn: (prompt: string, signal: AbortSignal) => Promise<void>;
  close: () => Promise<void>;
}
export interface HarnessContext {
  seat: Seat;
  name: string;
  model?: string;
  cwd: string;
  mcpUrl: string;
  onActivity: (text: string, tool?: string) => void;
  onUsage: (tokens: number) => void;
}
export interface HarnessAdapter { id: string; createSession: (context: HarnessContext) => Promise<AgentSession> }
