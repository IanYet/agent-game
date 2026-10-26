import type {ConversationEntry} from '@agent-game/protocol';

export type ConversationPart={type:'text';text:string}|{type:'json';value:unknown};
export interface ConversationContent extends Omit<ConversationEntry,'kind'> {
  kind:Exclude<ConversationEntry['kind'],'event'>;
  parts:ConversationPart[];
}
const cache=new WeakMap<ConversationEntry,ConversationContent|null>();

// Decode serialized JSON strings as well as ordinary objects and arrays.
function structuredJson(source:string):{value:unknown}|null {
  let value:unknown=source;
  for(let depth=0;depth<8&&typeof value==='string';depth++){
    const text=value.trim();
    if(!/^[\[{"]/.test(text))return null;
    try{value=JSON.parse(text);}catch{return null;}
    if(value!==null&&typeof value==='object')return {value};
  }
  return null;
}

function jsonEnd(source:string,start:number):number {
  const stack:string[]=[];
  let quoted=source[start]==='"',escaped=false;
  for(let i=start+(quoted?1:0);i<source.length;i++){
    const char=source[i];
    if(quoted){
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char==='"'){quoted=false;if(!stack.length)return i+1;}
      continue;
    }
    if(char==='"')quoted=true;
    else if(char==='{'||char==='[')stack.push(char);
    else if(char==='}'||char===']'){
      if(stack.pop()!==(char==='}'?'{':'['))return -1;
      if(!stack.length)return i+1;
    }
  }
  return -1;
}

// Keep all prose and fields; split embedded observations and JSON code fences
// into structured blocks. Incomplete streaming JSON remains visible as text.
export function conversationParts(source:string):ConversationPart[] {
  const whole=structuredJson(source);
  if(whole)return [{type:'json',value:whole.value}];
  const parts:ConversationPart[]=[];
  let cursor=0;
  for(let i=0;i<source.length;i++){
    let start=i,end=-1,next=-1;
    const fence=source.startsWith('```',i)?/^```(?:json)?[ \t]*\r?\n/.exec(source.slice(i)):null;
    if(fence){
      start=i+fence[0].length;
      end=source.indexOf('```',start);
      if(end<0)break;
      next=end+3;
    }else{
      if(source[i]!=='{'&&source[i]!=='['&&source[i]!=='"')continue;
      end=jsonEnd(source,i);
      if(end<0)continue;
      next=end;
    }
    const parsed=structuredJson(source.slice(start,end));
    if(parsed){
      const text=source.slice(cursor,i);
      if(text.trim())parts.push({type:'text',text});
      parts.push({type:'json',value:parsed.value});
      cursor=next;
    }
    i=next-1;
  }
  const text=source.slice(cursor);
  if(text.trim())parts.push({type:'text',text});
  return parts;
}

export function conversationContent(entry:ConversationEntry):ConversationContent|null {
  if(cache.has(entry))return cache.get(entry)!;
  const content=entry.kind==='event'?null:{...entry,kind:entry.kind,parts:conversationParts(entry.text)};
  cache.set(entry,content);
  return content;
}
