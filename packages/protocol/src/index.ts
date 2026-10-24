import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Wire contract only. Game engines, React, rules and game lists do not belong here.
export const CONNECTOR_PORT = 3211;
export const PROTOCOL_VERSION = 5;
export const CONNECTOR_CAPABILITIES = ['dynamic-tools-v1', 'json-schema-2020-12', 'player-scopes-v1', 'concurrent-decisions-v1', 'structured-results-v1', 'local-conversations-v1'] as const;
export type HarnessId = 'codex' | 'codex-acp' | 'dsh' | 'workbuddy';
export type PlayerKind = HarnessId | 'human';
export interface AgentSettings { model?: string; reasoningEffort?: string }
export interface ModelInfo { id: string; name: string; isDefault: boolean; defaultReasoningEffort?: string; supportedReasoningEfforts?: Array<{ effort: string; description: string }> }
export interface HarnessInfo { id: HarnessId; name: string; protocol: string; available: boolean; path?: string; version?: string; detail?: string; models?: ModelInfo[]; auth?: 'ready' | 'missing' | 'unknown'; ephemeral?: boolean }
export interface ConnectorInfo { version: string; protocolVersion: number; capabilities: string[]; platform: string; port: number; harnesses: HarnessInfo[]; models: ModelInfo[]; auth: 'chatgpt' | 'missing' | 'apiKey' | 'unknown' }
export function modelsForHarness(connector: ConnectorInfo | null, kind: string): ModelInfo[] {
  return connector?.harnesses.find(h => h.id === kind)?.models ?? (kind === 'codex' || kind === 'codex-acp' ? connector?.models ?? [] : []);
}
export type JsonSchema = Record<string, unknown> & { type: 'object' };
export interface ToolDefinition {
  name: string; title?: string; description: string; inputSchema: JsonSchema; outputSchema?: JsonSchema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  /** Enforced by the bridge and runtime; MCP annotations alone grant no authority. */
  requiresDecision?: boolean;
}
export type ToolResponse = CallToolResult;
export const toolResult = (value: Record<string, unknown>, isError = false): ToolResponse => ({ content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : { structuredContent: value }) });
export interface SessionRequest extends AgentSettings {
  scopeId: string; playerId: string; kind: HarnessId; name: string;
  instructions: string; tools: ToolDefinition[];
}
export type ConversationKind = 'instructions' | 'prompt' | 'message' | 'reasoning' | 'tool-call' | 'tool-result' | 'event' | 'error';
export interface ConversationEntry { id: string; time: string; kind: ConversationKind; title: string; text: string }
export interface ConversationUpdate { entry: ConversationEntry; append?: boolean }
export interface DecisionRequest extends AgentSettings { decisionId: string; prompt: string }
export interface BrowserToolRequest { id: string; scopeId: string; playerId: string; decisionId?: string; tool: string; args: Record<string, unknown> }
export type ConnectorEvent =
  | { type: 'ready'; info: ConnectorInfo }
  | { type: 'tool'; request: BrowserToolRequest }
  | ({ type: 'conversation'; scopeId: string; playerId: string } & ConversationUpdate)
  | { type: 'activity'; playerId: string; text: string; tool?: string }
  | { type: 'usage'; playerId: string; tokens: number };
