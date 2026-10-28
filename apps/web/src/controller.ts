import {toolResult,type BrowserToolRequest,type ConnectorInfo,type PlayerKind,type ToolResponse} from '@agent-game/protocol';
import {ToolRegistry} from '../../../packages/protocol/src/validation';
import {ConnectorClient,ConnectorVersionError} from './connector';
import {gameRegistry} from './games/registry';
import {ConversationStore} from './conversations';
import {GameRegistry,type AppSnapshot,type CreateOptions,type PendingDecision,type PlayerConfig,type SeatRuntime,type StablePlayer,type StoredRun} from './runtime/types';

export type {CreateOptions} from './runtime/types';
export interface LocalStore {getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void;removeItem:(key:string)=>void}
interface SavedGames {version:4;current:StoredRun|null;archives:StoredRun[];curiosityMode:boolean}
interface Binding {scopeId:string;registry:ToolRegistry;contextKey:string;history:{runId:string;seq:number}}
const STORE_KEY='agent-arcade.games.v4';
const harnesses=new Set<PlayerKind>(['human','codex','codex-acp','dsh','workbuddy']);
const secureRandom=()=>{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;};
export class GameController {
  private data:SavedGames={version:4,current:null,archives:[],curiosityMode:false};
  private conversations:ConversationStore;
  private listeners=new Set<()=>void>();
  private snapshot!:AppSnapshot;
  private seats:SeatRuntime[]=[];
  private bindings=new Map<string,Binding>();
  private active=new Map<string,PendingDecision>();
  private info:ConnectorInfo|null=null;
  private connected=false;
  private connectorUpdateRequired=false;
  private paused=true;
  private error:string|null=null;
  private generation=0;
  private pumpTask:Promise<void>|null=null;
  private cleanupTask:Promise<void>|null=null;
  private closedRunId:string|null=null;
  private deadlineTimer:ReturnType<typeof setTimeout>|null=null;
  constructor(private store:LocalStore,private client=new ConnectorClient(),readonly registry:GameRegistry=gameRegistry) {
    this.conversations=new ConversationStore(store,()=>this.refresh());
    const raw=store.getItem(STORE_KEY);
    if(raw)try{
      const saved=JSON.parse(raw);
      if(saved.version!==4||!Array.isArray(saved.archives))throw new Error('不支持的平台存档版本，请新建游戏');
      const restore=(value:StoredRun|null):StoredRun|null=>{
        if(!value)return null;
        const module=registry.get(value.moduleId);
        if(typeof value.roomId!=='string'||typeof value.runId!=='string'||!Number.isSafeInteger(value.index)||value.index<1)throw new Error('存档标识不完整');
        if(value.stateVersion!==module.stateVersion)throw new Error('游戏模块的存档版本已改变，请新建游戏');
        return {...value,roster:this.normalizePlayers(value.roster,module.minPlayers,module.maxPlayers),state:module.restore(value.state,value.stateVersion)};
      };
      this.data={version:4,current:restore(saved.current),archives:saved.archives.map(restore).filter(Boolean) as StoredRun[],curiosityMode:saved.curiosityMode===true};
    }catch(e:any){this.error=`存档未载入：${e.message}。开发阶段不迁移旧存档。`;}
    this.recordFinish();this.resetSeats();this.refresh();
    client.onTool=request=>this.handleTool(request);
    client.onEvent=event=>{
      if(event.type==='ready')this.info=event.info;
      if(event.type==='conversation'){
        const run=[this.data.current,...this.data.archives].find(r=>r&&this.scope(r)===event.scopeId&&r.roster.some(p=>p.playerId===event.playerId&&p.kind!=='human'));
        if(run)this.conversations.record(run.runId,event.playerId,event);
      }
      if(event.type==='activity'||event.type==='usage'){
        const seat=this.seats.find(s=>s.playerId===event.playerId);
        if(seat&&event.type==='activity'){seat.message=event.text;seat.lastTool=event.tool;}
        if(seat&&event.type==='usage')seat.tokens=event.tokens;
      }
      this.refresh();
    };
    client.onDisconnect=()=>{
      this.connected=false;this.generation++;this.active.clear();this.bindings.clear();this.clearDeadline();
      this.seats.forEach(s=>{delete s.sessionId;s.status='paused';});
      if(this.data.current&&!this.module().finished(this.data.current.state)){this.paused=true;this.error='连接器已断开，游戏已暂停。重新连接后可以继续。';}
      this.refresh();
    };
  }
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=()=>this.snapshot;
  private module(){return this.registry.get(this.data.current!.moduleId);}
  private scope(run:StoredRun){return this.registry.get(run.moduleId).lifecycle.sessionScope==='room'?run.roomId:run.runId;}
  private normalizePlayers(players:PlayerConfig[],min:number,max:number):StablePlayer[]{
    if(!Array.isArray(players)||players.length<min||players.length>max)throw new Error(`需要 ${min}–${max} 位玩家`);
    if(players.filter(p=>p.kind==='human').length>1)throw new Error('同一桌最多一位真人');
    const result=players.map(p=>{
      if(!p||!harnesses.has(p.kind)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100)throw new Error('玩家名称或控制方式无效');
      if(p.playerId!==undefined&&(typeof p.playerId!=='string'||!p.playerId||p.playerId.length>200))throw new Error('玩家标识无效');
      return{...p,name:p.name.trim(),playerId:p.playerId??crypto.randomUUID()};
    });
    if(new Set(result.map(p=>p.playerId)).size!==result.length)throw new Error('玩家标识重复');
    return result;
  }
  private resetSeats(previous:SeatRuntime[]=[]){
    this.seats=this.data.current?.roster.map((p,seat)=>({...previous.find(s=>s.playerId===p.playerId),playerId:p.playerId,seat,kind:p.kind,status:'idle',turns:0,tokens:0}))??[];
  }
  private refresh(){
    const run=this.data.current,viewer=run?.roster.find(p=>p.kind==='human')?.playerId??null;
    const {state:_state,...room}=run??({} as StoredRun);
    this.snapshot={connector:this.info,connected:this.connected,connectorUpdateRequired:this.connectorUpdateRequired,game:run?this.module().tableView(run,viewer,{revealHands:viewer===null||(this.data.curiosityMode&&this.module().finished(run.state))}):null,room:run?{...room,finished:this.module().finished(run.state)}:null,seats:structuredClone(this.seats),paused:this.paused,curiosityMode:this.data.curiosityMode,conversations:run?this.conversations.forRun(run.runId):{},conversationError:this.conversations.error,error:this.error,activity:run?{...this.module().activity(run),actors:[...new Set(this.pending().map(d=>d.actorId))]}:null,history:[...this.data.archives].reverse().map(r=>this.registry.get(r.moduleId).summary(r))};
    this.listeners.forEach(listener=>listener());
  }
  private save(){
    this.conversations.retain(new Set([this.data.current,...this.data.archives].filter((r):r is StoredRun=>!!r).map(r=>r.runId)));
    // The current run already has its own slot, including after it finishes.
    // Rebuild that history entry on load instead of storing a second full copy.
    const archives=this.data.archives.filter(run=>run.runId!==this.data.current?.runId);
    try{this.store.setItem(STORE_KEY,JSON.stringify({...this.data,archives}));}
    catch{this.error='浏览器存储空间不足；本次变更可能无法恢复，请导出记录或释放空间。';}
  }
  async connect(){
    if(this.connected){this.info=await this.client.inspect();this.refresh();return;}
    try{this.info=await this.client.connect();this.connected=true;this.connectorUpdateRequired=false;this.error=null;this.refresh();}
    catch(e){if(e instanceof ConnectorVersionError){this.info=e.connector;this.connected=false;this.connectorUpdateRequired=true;this.error=e.message;this.refresh();}throw e;}
  }
  async disconnect(){await this.pause();await this.client.disconnect();this.connected=false;this.refresh();}
  async create(players:PlayerConfig[],options:CreateOptions={}){
    const module=this.registry.get(options.gameId??this.registry.list()[0].id);
    const meta={moduleId:module.id,moduleVersion:module.version,stateVersion:module.stateVersion,roomId:crypto.randomUUID(),runId:crypto.randomUUID(),index:1,roster:this.normalizePlayers(players,module.minPlayers,module.maxPlayers),config:structuredClone(options.config??module.defaultConfig)};
    module.validateConfig?.(meta.config);
    const run:StoredRun={...meta,state:module.create(meta,secureRandom)};
    if(!this.connected)throw new Error('请先启动并连接本地连接器');
    await this.pause();await this.client.stopSessions();this.bindings.clear();
    if(!this.connected)throw new Error('连接已断开，请重新连接本机后开始');
    this.data.current=run;this.data.curiosityMode=options.curiosityMode??this.data.curiosityMode;this.paused=false;this.error=null;this.resetSeats();this.recordFinish();this.save();this.refresh();this.schedule();
  }
  async nextRound(configs?:PlayerConfig[]){
    const old=this.data.current;if(!old||!this.module().finished(old.state))throw new Error('当前游戏尚未结束，不能变更阵容');
    if(!this.connected)throw new Error('请先重新连接本地连接器');
    const module=this.module(),meta={...old,runId:crypto.randomUUID(),index:old.index+1,roster:this.normalizePlayers(configs??old.roster,module.minPlayers,module.maxPlayers),moduleVersion:module.version,stateVersion:module.stateVersion};
    const next={...meta,state:module.next(old,meta,secureRandom)};
    await this.pause();
    // Room-scoped sessions survive only if their identity, control and fixed registry still match.
    const preserved=module.lifecycle.sessionScope==='room'?this.seats.filter(s=>{
      const before=old.roster.find(p=>p.playerId===s.playerId),after=meta.roster.find(p=>p.playerId===s.playerId);
      return before&&after&&before.kind===after.kind&&before.name===after.name&&JSON.stringify(this.bindings.get(s.playerId)?.registry.definitions)===JSON.stringify(module.tools(next,s.playerId));
    }):[];
    const closing=this.seats.filter(s=>!preserved.includes(s)&&s.sessionId).map(s=>s.sessionId!);
    if(closing.length)await this.client.stopSessions(closing);
    if(!this.connected)throw new Error('连接已断开，请重新连接本机后继续');
    for(const s of this.seats)if(!preserved.includes(s))this.bindings.delete(s.playerId);
    this.data.current=next;this.paused=false;this.error=null;this.resetSeats(preserved);this.recordFinish();this.save();this.refresh();this.schedule();
  }
  humanAction(input:unknown){
    if(!this.connected)throw new Error('请先连接本地连接器');
    const run=this.data.current,player=run?.roster.find(p=>p.kind==='human');
    if(!run||!player||this.paused||this.module().finished(run.state))throw new Error('当前不能操作');
    if(!this.pending().some(d=>d.actorId===player.playerId))throw new Error('当前没有你的决策');
    this.commit(this.module().humanAction(run,player.playerId,input));this.schedule();
  }
  private recordFinish(){
    const run=this.data.current;
    if(run&&this.module().finished(run.state)&&!this.data.archives.some(r=>r.runId===run.runId)){this.data.archives.push(structuredClone(run));this.data.archives=this.data.archives.slice(-20);}
  }
  private commit(state:unknown){
    if(this.paused)throw new Error('游戏已暂停');
    this.data.current={...this.data.current!,state};this.recordFinish();this.save();this.refresh();this.armDeadline();
  }
  private pending():PendingDecision[]{
    const run=this.data.current;if(!run||this.module().finished(run.state))return[];
    const result=this.module().decisions(run);
    const keys=new Set<string>();
    for(const d of result){
      if(!d.decisionId||keys.has(d.decisionId)||!run.roster.some(p=>p.playerId===d.actorId))throw new Error('游戏模块返回了重复或无效的决策');
      keys.add(d.decisionId);
    }
    return result;
  }
  async pause(){
    this.paused=true;this.generation++;this.active.clear();this.clearDeadline();
    this.seats.forEach(s=>{if(s.status!=='error')s.status='paused';});this.refresh();
    await this.client.pauseTurn();await this.pumpTask;await this.cleanupTask;this.refresh();
  }
  async resume(){
    const run=this.data.current;if(!run||this.module().finished(run.state))return;
    if(!this.connected)throw new Error('请先连接本地连接器');
    if(!this.paused)return;
    this.error=null;this.paused=false;this.seats.forEach(s=>{s.status=s.sessionId?'ready':'idle';s.message=undefined;});this.refresh();this.armDeadline();this.schedule();
  }
  configurePlayers(players:PlayerConfig[]){
    const run=this.data.current;
    if(!run||!this.paused||this.module().finished(run.state))throw new Error('请先暂停当前游戏，再调整玩家设置');
    if(players.length!==run.roster.length||players.some((p,i)=>p.kind!==run.roster[i].kind||p.name!==run.roster[i].name||(p.playerId&&p.playerId!==run.roster[i].playerId)))throw new Error('进行中不变更阵容或 Harness，请在下一局开始前调整');
    run.roster=run.roster.map((p,i)=>({...p,model:players[i].model||undefined,reasoningEffort:players[i].reasoningEffort||undefined}));this.save();this.refresh();
  }
  replay(id:string,round:number){const run=this.data.archives.find(r=>r.roomId===id&&r.index===round);return run?structuredClone(run):undefined;}
  planning(){const run=this.data.current;return run?this.module().planning?.(run):undefined;}
  rules(){return this.data.current?this.module().rules(this.data.current):this.registry.list()[0].rules();}
  setCuriosityMode(enabled:boolean){this.data.curiosityMode=enabled;this.save();this.refresh();}
  conversation(runId:string,playerId:string){return structuredClone(this.conversations.forRun(runId)[playerId]??[]);}
  flushConversations(){this.conversations.flush();}
  clearError(){this.error=null;this.refresh();}
  handleTool(request:BrowserToolRequest):ToolResponse{
    try{
      const run=this.data.current,binding=this.bindings.get(request.playerId);
      if(!run||request.scopeId!==this.scope(run)||!binding||binding.scopeId!==request.scopeId||!run.roster.some(p=>p.playerId===request.playerId&&p.kind!=='human'))throw new Error('玩家凭据不属于当前游戏会话');
      const definition=binding.registry.definition(request.tool);binding.registry.validateInput(request.tool,request.args);
      if(definition.requiresDecision){
        if(this.paused)throw new Error('游戏已暂停');
        const active=request.decisionId?this.active.get(request.decisionId):undefined;
        const decision=this.pending().find(d=>d.decisionId===request.decisionId&&d.actorId===request.playerId);
        if(!active||active.actorId!==request.playerId||!decision)throw new Error('决策已过期、已完成或不属于此玩家');
        if(decision.allowedTools&&!decision.allowedTools.includes(request.tool))throw new Error('本次决策未授权该操作');
      }
      // No await in this section: input checks, module transition and publication are one serial commit.
      const change=this.module().handleTool(structuredClone(run),structuredClone(request));
      binding.registry.validateOutput(request.tool,change.result);
      if(change.state!==undefined){
        if(!definition.requiresDecision)throw new Error('改变状态的工具必须要求决策授权');
        if(change.result.isError)throw new Error('失败的工具调用不能提交状态');
        this.commit(change.state);
      }
      return change.result;
    }catch(e:any){return toolResult({error:e.message},true);}
  }
  private schedule(){
    this.armDeadline();
    if(this.pumpTask||this.paused||!this.connected||!this.data.current||this.closedRunId===this.data.current.runId)return;
    this.pumpTask=this.pump(this.generation).finally(()=>{
      this.pumpTask=null;
      if(!this.paused&&this.data.current&&this.closedRunId!==this.data.current.runId&&this.pending().some(d=>this.data.current!.roster.find(p=>p.playerId===d.actorId)?.kind!=='human'))this.schedule();
    });
  }
  private contextKey(player:StablePlayer){return JSON.stringify([this.scope(this.data.current!),player.kind,player.name,player.model??null,player.reasoningEffort??null]);}
  private historyAfter(playerId:string){
    const run=this.data.current!,binding=this.bindings.get(playerId),player=run.roster.find(p=>p.playerId===playerId)!;
    return binding?.contextKey===this.contextKey(player)&&binding.history.runId===run.runId?binding.history.seq:0;
  }
  private async releaseSession(playerId:string,sessionId:string){
    const runtime=this.seats.find(s=>s.playerId===playerId);
    if(runtime?.sessionId===sessionId){delete runtime.sessionId;this.bindings.delete(playerId);}
    await this.client.stopSessions([sessionId]);
  }
  private async ensureSession(playerId:string,generation:number){
    const run=this.data.current!,player=run.roster.find(p=>p.playerId===playerId)!,runtime=this.seats.find(s=>s.playerId===playerId)!;
    if(player.kind==='human')return;
    const contextKey=this.contextKey(player);
    if(runtime.sessionId){
      if(this.bindings.get(playerId)?.contextKey===contextKey)return;
      await this.releaseSession(playerId,runtime.sessionId);
      if(this.paused||generation!==this.generation)return;
    }
    const module=this.module(),scopeId=this.scope(run),registry=new ToolRegistry(module.tools(run,playerId));
    runtime.status='connecting';runtime.message='创建独立玩家会话';this.refresh();
    const binding:Binding={scopeId,registry,contextKey,history:{runId:run.runId,seq:0}};
    this.bindings.set(playerId,binding);
    try{
      const {sessionId}=await this.client.createSession({scopeId,playerId,kind:player.kind,name:player.name,instructions:module.initializePrompt(run,playerId),tools:registry.definitions,model:player.model,reasoningEffort:player.reasoningEffort});
      if(generation!==this.generation||this.bindings.get(playerId)!==binding){
        if(this.bindings.get(playerId)===binding)this.bindings.delete(playerId);
        await this.client.stopSessions([sessionId]);return;
      }
      runtime.sessionId=sessionId;runtime.status=this.paused||generation!==this.generation?'paused':'ready';
      this.refresh();
    }catch(e){if(this.bindings.get(playerId)===binding)this.bindings.delete(playerId);throw e;}
  }
  private async pump(generation:number){
    const running=new Map<string,Promise<void>>();
    const launch=(decision:PendingDecision)=>{
      const playerId=decision.actorId;
      const task=(async()=>{
        const runtime=this.seats.find(s=>s.playerId===playerId)!,player=this.data.current!.roster.find(p=>p.playerId===playerId)!;
        let sessionId:string|undefined;
        try{
          await this.ensureSession(player.playerId,generation);
          if(this.paused||generation!==this.generation||!this.pending().some(d=>d.decisionId===decision.decisionId))return;
          const run=this.data.current!,module=this.module(),binding=this.bindings.get(playerId)!,afterEvent=this.historyAfter(playerId),through=module.historyCursor(run);
          const prompt=module.decisionPrompt(run,decision,afterEvent);
          sessionId=runtime.sessionId!;
          runtime.status='thinking';runtime.message='正在思考';
          this.active.set(decision.decisionId,decision);this.refresh();
          const settings={model:player.model,reasoningEffort:player.reasoningEffort};
          await this.client.playTurn(sessionId,prompt,decision.decisionId,settings);
          if(this.paused||generation!==this.generation)return;
          if(this.pending().some(d=>d.decisionId===decision.decisionId&&d.actorId===player.playerId))throw new Error('Agent 结束了任务，但当前决策尚未完成。点击继续可重试。');
          // A tool call can advance the game during delivery. Acknowledge only
          // the immutable snapshot actually sent, never the later live state.
          if(this.bindings.get(playerId)===binding)binding.history={runId:run.runId,seq:through};
          runtime.status='ready';runtime.message=undefined;runtime.turns++;this.refresh();
        }catch(e:any){
          if(sessionId)await this.releaseSession(playerId,sessionId).catch(()=>{});
          // A human can finish the game while an agent is still returning from
          // its already committed action. Session disposal then rejects that
          // task; the completed game must keep its successful result.
          if(generation!==this.generation||this.paused||(this.data.current&&this.module().finished(this.data.current.state)))return;
          runtime.status='error';runtime.message=`${player.name}：${e.message}`;this.error=runtime.message;
          this.paused=true;this.clearDeadline();this.active.clear();this.refresh();
          await this.client.pauseTurn().catch(()=>{});
        }finally{this.active.delete(decision.decisionId);}
      })().finally(()=>running.delete(playerId));
      running.set(playerId,task);
    };
    try{
      if(this.module().lifecycle.eagerAgents)for(const player of this.data.current!.roster){if(this.paused||generation!==this.generation)return;await this.ensureSession(player.playerId,generation);}
      while(!this.paused&&generation===this.generation){
        for(const d of this.pending())if(!running.has(d.actorId)&&this.data.current!.roster.find(p=>p.playerId===d.actorId)?.kind!=='human')launch(d);
        if(!running.size)break;
        await Promise.race(running.values());
      }
    }catch(e:any){if(generation===this.generation){this.paused=true;this.error=e.message;this.clearDeadline();this.refresh();}}
    finally{
      await Promise.allSettled(running.values());
      if(!this.paused&&generation===this.generation&&this.data.current&&this.module().finished(this.data.current.state))await this.closeFinishedSessions();
      this.refresh();
    }
  }
  private closeFinishedSessions():Promise<void>{
    this.closedRunId=this.data.current!.runId;
    if(this.module().lifecycle.sessionScope==='room')return Promise.resolve();
    if(this.cleanupTask)return this.cleanupTask;
    const seats=this.seats;
    this.cleanupTask=this.client.stopSessions().catch(()=>{}).then(()=>{
      if(this.seats===seats){seats.forEach(s=>{s.status='ready';delete s.sessionId;});this.bindings.clear();}this.refresh();
    }).finally(()=>{this.cleanupTask=null;});return this.cleanupTask;
  }
  private clearDeadline(){if(this.deadlineTimer)clearTimeout(this.deadlineTimer);this.deadlineTimer=null;}
  private armDeadline(){
    this.clearDeadline();if(this.paused||!this.data.current||!this.module().timeout)return;
    const next=this.pending().filter(d=>d.deadline!==undefined).sort((a,b)=>a.deadline!-b.deadline!)[0];if(!next)return;
    this.deadlineTimer=setTimeout(()=>{
      this.deadlineTimer=null;
      const current=this.pending().find(d=>d.decisionId===next.decisionId&&d.actorId===next.actorId);
      if(this.paused||!current)return;
      try{this.commit(this.module().timeout!(this.data.current!,current));this.schedule();}catch(e:any){this.paused=true;this.error=e.message;this.clearDeadline();this.refresh();}
    },Math.min(2_147_483_647,Math.max(0,next.deadline!-Date.now())));
  }
}
