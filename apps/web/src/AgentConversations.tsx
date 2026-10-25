import {createContext,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowDown,MessageCircle} from 'lucide-react';
import type {ConversationEntry} from '@agent-game/protocol';
import type {AppSnapshot} from './runtime/types';
import {kindName} from './AgentModelFields';
import {Modal} from './Modal';
import {conversationContent,type ConversationContent} from './conversation-content';
import './conversations.css';

export const AgentConversationAccess=createContext<((seat:number)=>void)|null>(null);
const labels:Record<ConversationContent['kind'],string>={instructions:'连接器指令',prompt:'发给 Agent',message:'Agent 回复',reasoning:'Agent 思考',error:'提示'};
const empty:ConversationEntry[]=[];

export function AgentConversationModal({state,playerId,onPlayer,onClose}:{state:AppSnapshot;playerId:string;onPlayer:(id:string)=>void;onClose:()=>void}){
  const agents=state.room!.roster.filter(p=>p.kind!=='human'),player=agents.find(p=>p.playerId===playerId)!;
  const entries=state.conversations[playerId]??empty,thread=useRef<HTMLDivElement>(null),follow=useRef(true),[following,setFollowing]=useState(true);
  const messages=useMemo(()=>entries.map(conversationContent).filter((entry):entry is ConversationContent=>entry!==null),[entries]);
  useEffect(()=>{follow.current=true;setFollowing(true);const el=thread.current;if(el)el.scrollTop=el.scrollHeight;},[playerId]);
  useLayoutEffect(()=>{const el=thread.current;if(el&&follow.current)el.scrollTop=el.scrollHeight;},[messages]);
  const latest=()=>{follow.current=true;setFollowing(true);const el=thread.current;if(el)el.scrollTop=el.scrollHeight;};
  return <Modal floating className="conversation-modal" branded={false} title={`${player.name} · 思考与对话`} subtitle="本局对话 / 实时更新" onClose={onClose} footer={<div className="conversation-footer"><span>对话保存在当前浏览器。思考内容以程序实际提供的为准。</span><button className="text-button" aria-pressed={following} onClick={latest}><ArrowDown size={13}/>{following?'跟随最新':'回到最新'}</button></div>}>
    <nav className="conversation-players" aria-label="选择 Agent 对话">{agents.map(p=><button key={p.playerId} aria-pressed={p.playerId===playerId} onClick={()=>onPlayer(p.playerId)}><strong>{p.name}</strong><small>{kindName[p.kind]}</small></button>)}</nav>
    {state.conversationError&&<p className="form-error" role="alert">{state.conversationError}</p>}
    <div className="conversation-thread" ref={thread} role="log" aria-label={`${player.name}的对话`} aria-live="off" tabIndex={0} onScroll={()=>{const el=thread.current;if(!el)return;const near=el.scrollHeight-el.scrollTop-el.clientHeight<64;follow.current=near;setFollowing(near);}}>
      {messages.length?messages.map(entry=><ConversationMessage key={entry.id} entry={entry}/>):<div className="conversation-empty"><MessageCircle size={25}/><p>这位 Agent 还没有对话内容。</p><small>需要行动时，连接器指令、回复和可见思考会出现在这里。</small></div>}
    </div>
  </Modal>;
}

function ConversationMessage({entry}:{entry:ConversationContent}){
  const time=new Date(entry.time).toLocaleTimeString('zh-CN',{hour12:false});
  const heading=<><span>{labels[entry.kind]}</span>{entry.title!==labels[entry.kind]&&<strong>{entry.title}</strong>}<time dateTime={entry.time}>{time}</time></>;
  const content=<p className="conversation-text">{entry.text}</p>;
  return entry.kind==='message'||entry.kind==='reasoning'||entry.kind==='error'?<article className="conversation-message" data-kind={entry.kind}><header>{heading}</header>{content}</article>:<details className="conversation-message" data-kind={entry.kind}><summary>{heading}</summary>{content}</details>;
}
