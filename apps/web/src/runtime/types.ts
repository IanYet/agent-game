import type { ComponentType } from 'react';
import type { AgentSettings, BrowserToolRequest, ConnectorInfo, PlayerKind, ToolDefinition, ToolResponse } from '@agent-game/protocol';
import type { GameController } from '../controller';

export interface PlayerConfig extends AgentSettings { playerId?: string; name: string; kind: PlayerKind }
export interface StablePlayer extends PlayerConfig { playerId: string }
export type ControlledView<V extends {players:any[]}> = Omit<V,'players'> & {players:Array<Omit<V['players'][number],keyof StablePlayer>&StablePlayer>};
export interface StoredRun<S = any> {
  moduleId: string; moduleVersion: string; stateVersion: number; roomId: string; runId: string; index: number;
  roster: StablePlayer[]; config: any; state: S;
}
export interface PendingDecision { decisionId: string; actorId: string; allowedTools?: string[]; deadline?: number }
export interface MatchSummary { id: string; gameId: string; round: number; endedAt: string; title: string; subtitle: string; entries: Array<{ label: string; value: string; positive?: boolean }> }
export interface SeatRuntime { playerId: string; seat: number; kind: PlayerKind; status: 'idle'|'connecting'|'ready'|'thinking'|'error'|'paused'; sessionId?:string; conversationId?:string; message?:string; lastTool?:string; turns:number; tokens:number }
export interface AppSnapshot<V = any> { connector:ConnectorInfo|null; connected:boolean; connectorUpdateRequired:boolean; game:V|null; room:Omit<StoredRun,'state'> & {finished:boolean} | null; seats:SeatRuntime[]; paused:boolean; persistConversations:boolean; error:string|null; history:MatchSummary[] }
export interface CreateOptions { gameId?:string; config?:any; persistConversations?:boolean }
export interface GameUiProps { state:AppSnapshot; controller:GameController; busy:boolean; onRules:()=>void; onSetup:()=>void; onBack:()=>void; onError:(message:string)=>void; run:(action:()=>Promise<void>)=>Promise<void> }
export interface GameModule<S = any,V = any> {
  id:string; version:string; stateVersion:number; name:string; description:string; tagline:string;
  minPlayers:number; maxPlayers:number; defaultPlayers:number; defaultConfig:any; runNoun:string;
  rules:(run?:StoredRun<S>)=>string;
  lifecycle:{sessionScope:'run'|'room';eagerAgents:boolean};
  create:(run:Omit<StoredRun<S>,'state'>,random:()=>number)=>S;
  next:(previous:StoredRun<S>,run:Omit<StoredRun<S>,'state'>,random:()=>number)=>S;
  finished:(state:S)=>boolean;
  observe:(run:StoredRun<S>,playerId:string|null)=>V;
  decisions:(run:StoredRun<S>)=>PendingDecision[];
  tools:(run:StoredRun<S>,playerId:string)=>ToolDefinition[];
  initializePrompt:(run:StoredRun<S>,playerId:string)=>string;
  decisionPrompt:(run:StoredRun<S>,decision:PendingDecision)=>string;
  handleTool:(run:StoredRun<S>,request:BrowserToolRequest)=>{state?:S;result:ToolResponse};
  humanAction:(run:StoredRun<S>,playerId:string,input:unknown)=>S;
  timeout?:(run:StoredRun<S>,decision:PendingDecision)=>S;
  restore:(data:unknown,version:number)=>S;
  summary:(run:StoredRun<S>)=>MatchSummary;
  planning?:(run:StoredRun<S>)=>{subtitle:string;balances?:Map<string,number>;newPlayerLabel?:string};
  ui?:{Table:ComponentType<GameUiProps>;ConfigFields?:ComponentType<{value:any;onChange:(value:any)=>void}>;Replay:ComponentType<{run:StoredRun<S>}>;Cover?:ComponentType;cardClass?:string};
}
export class GameRegistry {
  private modules=new Map<string,GameModule>();
  constructor(modules:GameModule[]=[]){ for(const module of modules)this.register(module); }
  register(module:GameModule){ if(this.modules.has(module.id))throw new Error('游戏模块 ID 重复'); this.modules.set(module.id,module); }
  get(id:string):GameModule { const module=this.modules.get(id); if(!module)throw new Error(`未安装游戏模块：${id}`); return module; }
  list(){return [...this.modules.values()];}
}
