import type { Seat } from '@agent-game/core';
import type { AgentSettings } from '@agent-game/protocol';
export type { HarnessInfo, ModelInfo, ConnectorInfo } from '@agent-game/protocol';
export interface AgentSession {
  sessionId: string;
  playTurn: (prompt: string, signal: AbortSignal, settings?: AgentSettings) => Promise<void>;
  close: () => Promise<void>;
}
export interface HarnessContext extends AgentSettings {
  roomId?: string;
  round?: number;
  persistConversation?: boolean;
  seat: Seat;
  name: string;
  cwd: string;
  mcpUrl: string;
  onActivity: (text: string, tool?: string) => void;
  onUsage: (tokens: number) => void;
}
export interface HarnessAdapter { id: string; createSession: (context: HarnessContext) => Promise<AgentSession> }
