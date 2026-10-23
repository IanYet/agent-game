import {useState} from 'react';
import {ArrowRight,Link2,Loader2,Play,Plus,Sparkles,Trash2,User} from 'lucide-react';
import {modelsForHarness,type HarnessId} from '@agent-game/protocol';
import type {AppSnapshot,PlayerConfig,GameModule} from './runtime/types';
import {gameRegistry} from './games/registry';
import {AgentHarnessField,AgentModelFields} from './AgentModelFields';
import {Modal} from './Modal';
import type {GameController} from './controller';
const defaultHarness=(state:AppSnapshot):HarnessId=>state.connector?.harnesses.find(h=>h.available)?.id??'codex-acp';
const newPlayer=(state:AppSnapshot,index:number):PlayerConfig=>({playerId:crypto.randomUUID(),name:['你','Atlas','Nova','Echo','River','Sage','Luna','Orion','Iris'][index]??`玩家 ${index+1}`,kind:defaultHarness(state)});
export function RosterEditor({state,players,onChange,module,planning}:{state:AppSnapshot;players:PlayerConfig[];onChange:(players:PlayerConfig[])=>void;module:GameModule;planning?:ReturnType<GameController['planning']>}){
 const update=(index:number,patch:Partial<PlayerConfig>)=>onChange(players.map((p,i)=>i===index?{...p,...patch}:p));
 return <>
  <div className="roster-grid">{players.map((player,index)=><section className="roster-card" key={player.playerId??index}>
   <div className="roster-heading"><span className={`avatar avatar-${index%3}`}>{player.kind==='human'?<User size={20}/>:<Sparkles size={20}/>}</span><strong>座位 {index+1}</strong>{module.minPlayers<module.maxPlayers&&<button className="icon-button" disabled={players.length<=module.minPlayers} aria-label={`移除座位 ${index+1}`} onClick={()=>onChange(players.filter((_,i)=>i!==index))}><Trash2 size={15}/></button>}</div>
   {planning?.balances&&<div className="roster-balance">{planning.balances.has(player.playerId??'')?`保留 ${planning.balances.get(player.playerId!)}`:`新玩家 · ${planning.newPlayerLabel??'使用模块默认值'}`}</div>}
   <label className="roster-field">玩家名称<input aria-label={`座位 ${index+1} 名称`} value={player.name} maxLength={32} onChange={e=>update(index,{name:e.target.value})}/></label>
   <label className="roster-field">玩家类型<select aria-label={`座位 ${index+1} 玩家类型`} value={player.kind==='human'?'human':'agent'} onChange={e=>update(index,{kind:e.target.value==='human'?'human':defaultHarness(state),model:undefined,reasoningEffort:undefined})}><option value="human" disabled={players.some((p,i)=>i!==index&&p.kind==='human')}>真人</option><option value="agent">Agent</option></select></label>
   {player.kind!=='human'&&<><AgentHarnessField harnesses={state.connector?.harnesses} kind={player.kind} label={`座位 ${index+1}`} onChange={kind=>update(index,{kind,model:undefined,reasoningEffort:undefined})}/><AgentModelFields label={`座位 ${index+1}`} models={modelsForHarness(state.connector,player.kind)} settings={player} onChange={settings=>update(index,settings)}/></>}
  </section>)}</div>
  {module.minPlayers<module.maxPlayers&&<button className="button outline" disabled={players.length>=module.maxPlayers} onClick={()=>onChange([...players,newPlayer(state,players.length)])}><Plus size={15}/>增加玩家 <small>{players.length}/{module.maxPlayers}</small></button>}
  <p className="roster-note">最多一位真人，也可以全部由 Agent 游玩。每位 Agent 独立选择 Harness、模型与思考强度。</p>
 </>;
}
function validateRoster(state:AppSnapshot,players:PlayerConfig[]){
 for(const player of players)if(player.kind!=='human'){const harness=state.connector?.harnesses.find(h=>h.id===player.kind);if(!harness?.available)throw new Error(`${player.name} 的 Harness 尚未就绪。${harness?.detail??'请先连接本机'}`);}
}
export function SetupModal({state,initialGame,onClose,onConnect,onStart}:{state:AppSnapshot;initialGame:string;onClose:()=>void;onConnect:()=>void;onStart:(players:PlayerConfig[],persist:boolean,gameId:string,config:any)=>Promise<void>}){
 const [gameId,setGameId]=useState(initialGame),module=gameRegistry.get(gameId),Fields=module.ui?.ConfigFields;
 const [players,setPlayers]=useState<PlayerConfig[]>(Array.from({length:module.defaultPlayers},(_,i)=>({...newPlayer(state,i),...(i===0?{kind:'human' as const}:{})})));
 const [config,setConfig]=useState(structuredClone(module.defaultConfig)),[persist,setPersist]=useState(state.persistConversations),[pending,setPending]=useState(false),[error,setError]=useState('');
 const switchModule=(next:GameModule)=>{setGameId(next.id);setConfig(structuredClone(next.defaultConfig));setPlayers(p=>Array.from({length:Math.max(next.minPlayers,Math.min(next.maxPlayers,p.length))},(_,i)=>p[i]??newPlayer(state,i)));};
 const start=async()=>{setPending(true);setError('');try{validateRoster(state,players);await onStart(players,persist,gameId,config);}catch(e:any){setError(e.message);}finally{setPending(false);}};
 return <Modal title="凑齐搭档，准备开桌" subtitle="本机游戏 · 每位 Agent 独立会话" onClose={onClose} wide>
  <div className="mode-switch">{gameRegistry.list().map(m=><button key={m.id} className={gameId===m.id?'selected':''} onClick={()=>switchModule(m)}><strong>{m.name}</strong><small>{m.tagline} · {m.minPlayers===m.maxPlayers?m.minPlayers:`${m.minPlayers}–${m.maxPlayers}`} 人</small></button>)}</div>
  {Fields&&<Fields value={config} onChange={setConfig}/>}
  <div className="mode-switch"><button className={players.some(p=>p.kind==='human')?'selected':''} onClick={()=>setPlayers(all=>all.map((p,i)=>i===0?{...p,kind:'human',model:undefined,reasoningEffort:undefined}:p.kind==='human'?{...p,kind:defaultHarness(state)}:p))}><User size={16}/><strong>我也要玩</strong><small>1 位真人，其余 Agent</small></button><button className={players.every(p=>p.kind!=='human')?'selected':''} onClick={()=>setPlayers(all=>all.map(p=>p.kind==='human'?{...p,kind:defaultHarness(state)}:p))}><Sparkles size={16}/><strong>全 Agent 观战</strong><small>每位玩家独立会话</small></button></div>
  <RosterEditor state={state} players={players} onChange={setPlayers} module={module}/>
  <label className="conversation-option"><input type="checkbox" checked={persist} onChange={e=>setPersist(e.target.checked)}/><span><strong>保留玩家对话到各自 Harness 的本机历史</strong><small>默认关闭。历史保留与新会话策略独立；是否显示在客户端由对应 Harness 决定。</small></span></label>
  {!state.connected&&<div className="inline-notice"><Link2 size={17}/><span>启动本机连接器后连接，即可获取各 Harness 的模型目录。</span><button onClick={onConnect}>连接本机 <ArrowRight size={13}/></button></div>}
  {state.connectorUpdateRequired&&<p className="form-error">{state.error}</p>}
  {state.room&&<p className="setup-warning">新牌桌将替换当前牌桌，进度按所选游戏的初始设置重新开始。</p>}
  {error&&<div className="form-error" role="alert">{error}</div>}
  <div className="modal-footer"><small>开始前确认玩家与游戏设置。</small><button className="button primary" disabled={pending||!state.connected} onClick={start}>{pending?<Loader2 size={15} className="spin"/>:<Play size={15}/>}开桌</button></div>
 </Modal>;
}
export function NextRunModal({state,controller,onClose,onConnect,onStart}:{state:AppSnapshot;controller:GameController;onClose:()=>void;onConnect:()=>void;onStart:(players:PlayerConfig[])=>Promise<void>}){
 const room=state.room!,module=gameRegistry.get(room.moduleId),planning=controller.planning();
 const [players,setPlayers]=useState<PlayerConfig[]>(room.roster.map(p=>({...p}))),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const start=async()=>{setPending(true);setError('');try{validateRoster(state,players);await onStart(players);}catch(e:any){setError(e.message);}finally{setPending(false);}};
 return <Modal title={`准备第 ${room.index+1} ${module.runNoun}`} subtitle={planning?.subtitle} onClose={onClose} wide>
  <RosterEditor state={state} players={players} onChange={setPlayers} module={module} planning={planning}/>
  {!state.connected&&<div className="inline-notice"><Link2 size={17}/><span>重新连接本机后，即可读取模型目录并继续。</span><button onClick={onConnect}>连接本机 <ArrowRight size={13}/></button></div>}
  {error&&<div className="form-error" role="alert">{error}</div>}
  <div className="modal-footer"><small>确认后开始下一{module.runNoun}，进行中固定阵容。</small><button className="button primary" onClick={start} disabled={pending||!state.connected}>{pending?<Loader2 size={15} className="spin"/>:<Play size={15}/>}开始下一{module.runNoun}</button></div>
 </Modal>;
}
