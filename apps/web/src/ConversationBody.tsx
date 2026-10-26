import {memo,useMemo} from 'react';
import {conversationParts,type ConversationPart} from './conversation-content';
import {useConversationExpansion} from './conversation-expansion';

export const ConversationBody=memo(function ConversationBody({parts}:{parts:ConversationPart[]}){
  return <div className="conversation-body">{parts.length?parts.map((part,i)=>part.type==='text'
    ?<p className="conversation-text" key={i}>{part.text}</p>
    :<div className="conversation-json" key={i}><JsonValue value={part.value}/></div>)
    :<p className="conversation-empty-content">空内容</p>}</div>;
});

function JsonValue({value,label,depth=0}:{value:unknown;label?:string;depth?:number}){
  const [expanded,setExpanded]=useConversationExpansion(depth===0);
  const parts=useMemo(()=>typeof value==='string'?conversationParts(value):null,[value]);
  const key=label===undefined?null:<span className="conversation-json-key">{label}<span>: </span></span>;
  if(value!==null&&typeof value==='object'){
    const array=Array.isArray(value),entries=Object.entries(value),open=array?'[':'{',close=array?']':'}';
    if(!entries.length)return <div className="conversation-json-leaf">{key}<span className="conversation-json-empty">{open}{close}</span></div>;
    return <details className="conversation-json-branch" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
      <summary>{key}<span className="conversation-json-bracket">{open}</span><span className="conversation-json-count">{entries.length} {array?'项':'个字段'}</span>{!expanded&&<span className="conversation-json-bracket">{close}</span>}</summary>
      {expanded&&<><div className="conversation-json-children">{entries.map(([name,child])=><JsonValue key={name} label={name} value={child} depth={depth+1}/>)}</div><div className="conversation-json-close">{close}</div></>}
    </details>;
  }
  // A JSON string can itself contain a tool result or a whole prompt. Render
  // those contents recursively, without dropping the containing field.
  if(parts?.some(part=>part.type==='json'))return <div className="conversation-json-embedded">{key}<ConversationBody parts={parts}/></div>;
  return <div className="conversation-json-leaf">{key}<span className="conversation-json-scalar" data-type={value===null?'null':typeof value}>{typeof value==='string'?value:String(value)}</span></div>;
}
