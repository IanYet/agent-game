import type { AgentSettings, ConversationUpdate, SessionRequest } from '@agent-game/protocol';
import type { RateLimitNotice } from './harness/rate-limit';
export type { HarnessInfo, ModelInfo, ConnectorInfo } from '@agent-game/protocol';
export interface AgentSession { sessionId: string; playTurn: (prompt: string, signal: AbortSignal, settings?: AgentSettings) => Promise<void>; close: () => Promise<void> }
export interface HarnessContext extends SessionRequest { cwd: string; mcpUrl: string; onActivity: (text: string, tool?: string) => void; onUsage: (tokens: number) => void; onConversation: (update: ConversationUpdate) => void; onRateLimit: (notice: RateLimitNotice) => void }
export interface HarnessAdapter { id: string; createSession: (context: HarnessContext) => Promise<AgentSession> }
