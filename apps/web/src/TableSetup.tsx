import {useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,Loader2,Plus,Trash2} from 'lucide-react';
import {modelsForHarness,type HarnessId} from '@agent-game/protocol';
import type {AppSnapshot,PlayerConfig,GameModule} from './runtime/types';
import {gameRegistry} from './games/registry';
import {AgentHarnessField,AgentModelFields,kindName} from './AgentModelFields';
import {Modal} from './Modal';
import {Select} from './Select';
import {CuriosityToggle} from './CuriosityToggle';
import {Avatar,PrimaryButton} from './UiBits';
import type {GameController} from './controller';

export interface SetupDraft {players:PlayerConfig[];config:any;curiosityMode:boolean}
export const defaultHarness=(state:AppSnapshot):HarnessId=>state.connector?.harnesses.find(h=>h.available)?.id??'codex-acp';
export const newPlayer=(state:AppSnapshot,index:number):PlayerConfig=>({playerId:crypto.randomUUID(),name:['你','北河','观澜','回声','远山','知更','山雀','启明','白露'][index]??'玩家 '+(index+1),kind:defaultHarness(state)});
export function createDraft(state:AppSnapshot,module:GameModule):SetupDraft{return {players:Array.from({length:module.defaultPlayers},(_,i)=>({...newPlayer(state,i),...(i===0?{kind:'human' as const}:{})})),config:structuredClone(module.defaultConfig),curiosityMode:state.curiosityMode};}
export function playerProblem(state:AppSnapshot,p:PlayerConfig):string|undefined{
  if(!p.name.trim())return '请填写玩家名称';if(p.name.length>100)return '名称最长 100 字';if(p.kind==='human')return;
  const harness=state.connector?.harnesses.find(h=>h.id===p.kind);if(!harness?.available)return harness?.detail??'请连接本机并确认程序就绪';
  const models=modelsForHarness(state.connector,p.kind),model=p.model?models.find(m=>m.id===p.model):models.find(m=>m.isDefault)??models[0];
  if(!model)return '该程序暂未提供可用模型，请刷新连接或重新选择模型';
  if(p.reasoningEffort&&!model.supportedReasoningEfforts?.some(e=>e.effort===p.reasoningEffort))return '所选模型不支持此思考强度，请重新选择';
}

type Planning=ReturnType<GameController['planning']>;
export function RosterEditor({state,players,onChange,module,planning,errors,active,onActive,onRemove,onAdd,participation,allowBelowMinimum=false}:{state:AppSnapshot;players:PlayerConfig[];onChange:(p:PlayerConfig[])=>void;module:GameModule;planning?:Planning;errors:Array<string|undefined>;active:number;onActive:(i:number)=>void;onRemove?:(i:number)=>void;onAdd?:()=>void;participation?:{mode:string;onChange:(value:string)=>void};allowBelowMinimum?:boolean}){
  const index=Math.max(0,Math.min(active,players.length-1)),player=players[index];
  const entries=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const list=entries.current,row=list?.querySelector('[aria-pressed="true"]')?.parentElement;if(!list||!row)return;const bounds=list.getBoundingClientRect(),item=row.getBoundingClientRect();if(item.bottom>bounds.bottom)list.scrollTop+=item.bottom-bounds.bottom;else if(item.top<bounds.top)list.scrollTop-=bounds.top-item.top;},[index,players.length]);
  const update=(patch:Partial<PlayerConfig>)=>onChange(players.map((p,i)=>i===index?{...p,...patch}:p));
  const variable=module.minPlayers<module.maxPlayers,minimum=allowBelowMinimum?1:module.minPlayers;
  return <>{participation&&<div className="participation-field"><span className="eyebrow">参与方式</span><Select showDetails label="参与方式" value={participation.mode} options={[{value:'play',label:'亲自入座',detail:'你与 Agent 一起玩'},{value:'watch',label:'只看他们过招',detail:'交给 Agent，你来观战'}]} onChange={participation.onChange}/></div>}<div className="roster-editor"><nav className="roster-list" aria-label="完整玩家名单">
    <div className="roster-list-heading"><span>玩家名单</span><small>{players.length} / {module.maxPlayers}</small></div>
    <div ref={entries} className="roster-entries">
    {players.map((p,i)=><div className="roster-row" key={p.playerId??i}>
      <button aria-pressed={i===index} className={errors[i]?'has-error':''} onClick={()=>onActive(i)}><Avatar seat={i} kind={p.kind}/><span><b>{p.name||'未命名'}</b><small>{p.kind==='human'?'真人':kindName[p.kind]}</small></span><em>{errors[i]?'!':'↗'}</em></button>
      {onRemove&&variable&&<button className="roster-remove" disabled={players.length<=minimum} title={players.length<=minimum?'至少保留 '+minimum+' 位玩家':'移除玩家'} aria-label={'移除第 '+(i+1)+' 位玩家 '+(p.name||'未命名')} onClick={()=>onRemove(i)}><Trash2 size={13}/></button>}
    </div>)}
    </div>{onAdd&&variable&&<button className="roster-add" disabled={players.length>=module.maxPlayers} onClick={onAdd}><Plus size={14}/>{players.length>=module.maxPlayers?'已达到人数上限':'新增玩家'}</button>}
    <p className="roster-limit">{variable?module.minPlayers+'–'+module.maxPlayers+' 位参与者':'固定 '+module.minPlayers+' 位参与者'}</p>
  </nav><section className="player-editor">{player?<><div className="player-editor-heading"><span className="eyebrow">PLAYER / {String(index+1).padStart(2,'0')}</span><strong>{player.name||'未命名'}</strong></div>{planning?.balances&&<p className="resource-note">{planning.balances.has(player.playerId??'')?'继承资源 '+planning.balances.get(player.playerId!):'新玩家 · '+(planning.newPlayerLabel??'使用模块默认值')}</p>}<div className="field-pair"><label className="field"><span>玩家名称</span><input aria-label={'第 '+(index+1)+' 位玩家名称'} value={player.name} maxLength={100} aria-invalid={!player.name.trim()} onChange={e=>update({name:e.target.value})}/></label><div className="field"><span>玩家类型</span><Select label={'第 '+(index+1)+' 位玩家类型'} value={player.kind==='human'?'human':'agent'} options={[{value:'human',label:'真人',disabled:players.some((p,i)=>i!==index&&p.kind==='human'),detail:'一桌最多一位真人'},{value:'agent',label:'Agent'}]} onChange={v=>update({kind:v==='human'?'human':defaultHarness(state),model:undefined,reasoningEffort:undefined})}/></div></div>{player.kind!=='human'?<><AgentHarnessField harnesses={state.connector?.harnesses} kind={player.kind} label={player.name||'第 '+(index+1)+' 位'} onChange={kind=>update({kind,model:undefined,reasoningEffort:undefined})}/><AgentModelFields label={player.name||'第 '+(index+1)+' 位'} models={modelsForHarness(state.connector,player.kind)} settings={player} onChange={update}/></>:<p className="quiet-note">你将直接操作这位参与者。其他 Agent 只会读取游戏允许它们看到的信息。</p>}{errors[index]&&<p className="form-error" role="alert">{errors[index]}</p>}</>:<p className="quiet-note">点击「新增玩家」开始配置。</p>}</section></div></>;
}
export function SetupModal({state,gameId,draft,onDraft,onClose,onBack,onStart,onConnect}:{state:AppSnapshot;gameId:string;draft:SetupDraft;onDraft:(d:SetupDraft)=>void;onClose:()=>void;onBack:()=>void;onConnect:()=>void;onStart:(players:PlayerConfig[],curiosityMode:boolean,gameId:string,config:any)=>Promise<void>}){
  const module=gameRegistry.get(gameId),Fields=module.ui?.ConfigFields;
  const [active,setActive]=useState(0),[pending,setPending]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
  const players=draft.players,errors=players.map(p=>playerProblem(state,p));let configError='';try{module.validateConfig?.(draft.config);}catch(e){configError=(e as Error).message;}
  const errorIndex=errors.findIndex(Boolean),reason=!state.connected?'请先连接本机连接器':configError|| (players.length<module.minPlayers?'至少需要 '+module.minPlayers+' 位玩家':errorIndex>=0?'第 '+(errorIndex+1)+' 位 · '+errors[errorIndex]:'');
  const updatePlayers=(players:PlayerConfig[])=>onDraft({...draft,players});
  const add=()=>{if(players.length>=module.maxPlayers)return;updatePlayers([...players,newPlayer(state,players.length)]);setActive(players.length);};
  const remove=(i:number)=>{if(players.length<=module.minPlayers)return;updatePlayers(players.filter((_,at)=>at!==i));setActive(at=>at>i?at-1:Math.min(at,players.length-2));};
  const start=async()=>{if(reason||pending)return;if(state.room&&!confirm){setConfirm(true);return;}setPending(true);setError('');try{await onStart(players,draft.curiosityMode,gameId,draft.config);}catch(e){setError((e as Error).message);}finally{setPending(false);}};
  return <Modal wide symbol={module.presentation.symbol} dismissible={!pending} title={confirm?'替换当前游戏桌？':'创建对局 · '+module.name} subtitle={confirm?'请确认最后一步':'配置搭档 / CONFIGURE'} onClose={onClose} footer={<><div className="footer-reason" role="status">{error?<span className="form-error">{error}</span>:reason?<button onClick={()=>errorIndex>=0&&setActive(errorIndex)} disabled={errorIndex<0}>{reason}</button>:<span>{confirm?'已完成的记录会保留。':'确认后开始游戏，Agent 将按游戏需要行动。'}</span>}</div><div className="footer-actions"><button className="text-button" disabled={pending} onClick={confirm?()=>setConfirm(false):onBack}><ArrowLeft size={14}/>{confirm?'取消替换':'返回选游戏'}</button>{!state.connected&&<button className="text-button" disabled={pending} onClick={onConnect}>连接本机 ↗</button>}<PrimaryButton disabled={pending||!!reason} onClick={start}>{pending?<Loader2 size={15} className="spin"/>:null}{confirm?'确认替换并开始':'开始对局'}<ArrowUpRight size={20}/></PrimaryButton></div></>}>
    {confirm?<div className="replace-confirm"><span className="large-symbol">↗</span><h3>{state.room&&gameRegistry.get(state.room.moduleId).name} → {module.name}</h3><p>{state.room?.finished?'当前结果已完成。新桌将使用这次配置，资源按新桌规则初始化。':'当前桌尚未结束，替换后无法继续这次进度。你也可以取消，回到当前桌。'}</p><p>已配置的 {players.length} 位玩家将进入新桌。取消不会清空配置。</p></div>:<><RosterEditor state={state} module={module} players={players} onChange={updatePlayers} errors={errors} active={active} onActive={setActive} onRemove={remove} onAdd={add} participation={{mode:players.some(p=>p.kind==='human')?'play':'watch',onChange:v=>updatePlayers(players.map((p,i)=>v==='play'&&i===0?{...p,kind:'human',model:undefined,reasoningEffort:undefined}:p.kind==='human'?{...p,kind:defaultHarness(state),model:undefined,reasoningEffort:undefined}:p))}}/><details className="advanced-settings"><summary>游戏参数与好奇模式 <Plus size={14}/></summary>{Fields?<Fields value={draft.config} onChange={config=>onDraft({...draft,config})}/>:<p>本游戏使用固定规则，无需额外参数。</p>}{configError&&<p className="form-error">{configError}</p>}<CuriosityToggle enabled={draft.curiosityMode} onChange={curiosityMode=>onDraft({...draft,curiosityMode})}/></details><p className="quiet-note">在名单中选择玩家进行配置。返回选游戏会保留本页草稿。</p></>}
  </Modal>;
}
export function NextRunModal({state,controller,onClose,onConnect,onStart,players,onPlayers}:{state:AppSnapshot;controller:GameController;onClose:()=>void;onConnect:()=>void;onStart:(players:PlayerConfig[])=>Promise<void>;players:PlayerConfig[];onPlayers:(players:PlayerConfig[])=>void}){
  const room=state.room!,module=gameRegistry.get(room.moduleId),planning=controller.planning();
  const [active,setActive]=useState(0),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const errors=players.map(p=>planning?.blockedPlayers?.find(v=>v.playerId===p.playerId)?.reason??playerProblem(state,p)),at=errors.findIndex(Boolean),reason=!state.connected?'请重新连接本机':players.length<module.minPlayers?'至少需要 '+module.minPlayers+' 位玩家，请加入新玩家':at>=0?'第 '+(at+1)+' 位 · '+errors[at]:'';
  return <Modal wide symbol={module.presentation.symbol} dismissible={!pending} title={'准备第 '+(room.index+1)+' '+module.runNoun} subtitle={planning?.subtitle} onClose={onClose} footer={<><div className="footer-reason" role="status">{error||reason||'确认玩家后，按模块规则继承本桌资源。'}{at>=0&&<button className="text-button" onClick={()=>setActive(at)}>定位玩家 ↗</button>}{!state.connected&&<button onClick={onConnect}>连接本机 ↗</button>}</div><div className="footer-actions"><button className="text-button" onClick={onClose}>取消</button><PrimaryButton disabled={pending||!!reason} onClick={async()=>{setPending(true);try{await onStart(players);}catch(e){setError((e as Error).message);}finally{setPending(false);}}}>开始下一{module.runNoun}<ArrowUpRight size={18}/></PrimaryButton></div></>}><p className="quiet-note">{planning?.subtitle}</p><RosterEditor allowBelowMinimum state={state} players={players} onChange={onPlayers} module={module} planning={planning} errors={errors} active={active} onActive={setActive} onRemove={i=>{if(players.length<=1)return;onPlayers(players.filter((_,at)=>i!==at));setActive(at=>at>i?at-1:Math.max(0,Math.min(at,players.length-2)));}} onAdd={()=>{if(players.length>=module.maxPlayers)return;onPlayers([...players,newPlayer(state,players.length)]);setActive(players.length);}}/></Modal>;
}
