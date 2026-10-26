import {createContext,memo,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowDown,ChevronsDownUp,ChevronsUpDown,MessageCircle} from 'lucide-react';
import type {ConversationEntry} from '@agent-game/protocol';
import type {AppSnapshot} from './runtime/types';
import {kindName} from './AgentModelFields';
import {Modal} from './Modal';
import {conversationContent,type ConversationContent} from './conversation-content';
import {ConversationBody} from './ConversationBody';
import {ConversationExpansion,useConversationExpansion} from './conversation-expansion';
import './conversations.css';

export const AgentConversationAccess=createContext<((seat:number)=>void)|null>(null);
const labels:Record<ConversationContent['kind'],string>={instructions:'初始化说明',prompt:'输入消息',message:'回复',reasoning:'思考','tool-call':'工具调用','tool-result':'工具结果',error:'错误'};
const empty:ConversationEntry[]=[];

export function AgentConversationModal({state,playerId,onPlayer,onClose}:{state:AppSnapshot;playerId:string;onPlayer:(id:string)=>void;onClose:()=>void}){
  const agents=state.room!.roster.filter(p=>p.kind!=='human'),player=agents.find(p=>p.playerId===playerId)!;
  const entries=state.conversations[playerId]??empty,thread=useRef<HTMLDivElement>(null),follow=useRef(true),[following,setFollowing]=useState(true);
  const messages=useMemo(()=>entries.map(conversationContent).filter((entry):entry is ConversationContent=>entry!==null),[entries]);
  const [expansion,setExpansion]=useState<{playerId:string;expanded:boolean}|null>(null);
  const command=useMemo(()=>({expanded:expansion?.playerId===playerId?expansion.expanded:undefined}),[expansion,playerId]);
  const expandAll=(expanded:boolean)=>{follow.current=false;setFollowing(false);setExpansion({playerId,expanded});};
  useEffect(()=>{follow.current=true;setFollowing(true);const el=thread.current;if(el)el.scrollTop=el.scrollHeight;},[playerId]);
  useLayoutEffect(()=>{const el=thread.current;if(el&&follow.current)el.scrollTop=el.scrollHeight;},[messages]);
  const latest=()=>{follow.current=true;setFollowing(true);const el=thread.current;if(el)el.scrollTop=el.scrollHeight;};
  return <Modal floating className="conversation-modal" branded={false} title={`${player.name} · 思考与对话`} subtitle="本局对话 / 实时更新" onClose={onClose} footer={<div className="conversation-footer"><span>对话保存在当前浏览器。思考内容以程序实际提供的为准。</span><button className="text-button" aria-pressed={following} onClick={latest}><ArrowDown size={13}/>{following?'跟随最新':'回到最新'}</button></div>}>
    <nav className="conversation-players" aria-label="选择 Agent 对话">{agents.map(p=><button key={p.playerId} aria-pressed={p.playerId===playerId} onClick={()=>onPlayer(p.playerId)}><strong>{p.name}</strong><small>{kindName[p.kind]}</small></button>)}</nav>
    <div className="conversation-toolbar"><span>{messages.length} 条记录</span><div><button className="text-button" disabled={!messages.length} onClick={()=>expandAll(true)}><ChevronsUpDown size={13}/>全部展开</button><button className="text-button" disabled={!messages.length} onClick={()=>expandAll(false)}><ChevronsDownUp size={13}/>全部折叠</button></div></div>
    {state.conversationError&&<p className="form-error" role="alert">{state.conversationError}</p>}
    <ConversationExpansion.Provider value={command}><div className="conversation-thread" ref={thread} role="log" aria-label={`${player.name}的对话`} aria-live="off" tabIndex={0} onScroll={()=>{const el=thread.current;if(!el)return;const near=el.scrollHeight-el.scrollTop-el.clientHeight<64;follow.current=near;setFollowing(near);}}>
      {messages.length?messages.map(entry=><ConversationMessage key={`${playerId}:${entry.id}`} entry={entry} playerName={player.name}/>):<div className="conversation-empty"><MessageCircle size={25}/><p>这位 Agent 还没有对话内容。</p><small>需要行动时，指令、回复、可见思考和工具交互会逐条出现在这里。</small></div>}
    </div></ConversationExpansion.Provider>
  </Modal>;
}

const ConversationMessage=memo(function ConversationMessage({entry,playerName}:{entry:ConversationContent;playerName:string}){
  const [expanded,setExpanded]=useConversationExpansion(entry.kind==='message'||entry.kind==='reasoning'||entry.kind==='error');
  const time=new Date(entry.time).toLocaleTimeString('zh-CN',{hour12:false});
  const payload=entry.parts[0]?.type==='json'?entry.parts[0].value:null;
  const progress=entry.kind==='tool-call'&&(entry.title==='原生工具进度'||(payload!==null&&typeof payload==='object'&&'sessionUpdate' in payload&&payload.sessionUpdate==='tool_call_update'));
  const source=entry.kind==='error'?'system':entry.kind==='instructions'||entry.kind==='prompt'||entry.kind==='tool-result'?'connector':'agent';
  const route=source==='system'?'运行系统':source==='connector'?`连接器 → ${playerName}`:`${playerName}${progress?'的程序':''} → 连接器`;
  const heading=<><span className="conversation-route">{route}</span><span className="conversation-kind">{progress?'工具进度':labels[entry.kind]}<code>{entry.kind}</code></span><time dateTime={entry.time}>{time}</time></>;
  return <article className="conversation-message" data-kind={entry.kind} data-source={source}>
    <header>{heading}</header><details className="conversation-entry" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>{entry.title}</summary>{expanded&&<ConversationBody parts={entry.parts}/>}</details>
  </article>;
});
