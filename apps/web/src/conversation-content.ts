import {cardLabel,type Card} from '@agent-game/core';
import type {ConversationEntry} from '@agent-game/protocol';

export interface ConversationContent extends Omit<ConversationEntry,'kind'> {kind:'instructions'|'prompt'|'message'|'reasoning'|'error'}
const cache=new WeakMap<ConversationEntry,ConversationContent|null>();
const object=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const phases:Record<string,string>={bidding:'叫分',playing:'出牌',preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌',finished:'已结束'};

function cards(value:unknown):string{
  if(!Array.isArray(value))return '';
  return value.flatMap(value=>{const card=object(value);return card&&typeof card.rank==='number'&&['S','H','C','D','J'].includes(String(card.suit))?[cardLabel(card as unknown as Card)]:[];}).join(' ');
}

function observation(value:Record<string,unknown>):string{
  const players=Array.isArray(value.players)?value.players.map(object).filter((p):p is Record<string,unknown>=>!!p):[];
  const name=(seat:unknown)=>String(players.find(p=>p.seat===seat)?.name??'玩家');
  const lines:string[]=[];
  if(typeof value.phase==='string')lines.push(`当前阶段：${phases[value.phase]??value.phase}`);
  if(typeof value.turn==='number'&&value.phase!=='finished')lines.push(`轮到${name(value.turn)}行动。`);
  for(const player of players){
    const status=[player.role==='landlord'?'地主':player.role==='farmer'?'农民':'',typeof player.count==='number'?`剩余 ${player.count} 张`:'',typeof player.chips==='number'?`${player.chips} 筹码`:'',player.folded?'已弃牌':player.allIn?'已全下':''].filter(Boolean).join('，');
    lines.push(`${String(player.name??'玩家')}：${status||'已入座'}`);
    if(Array.isArray(player.hand))lines.push(`${String(player.name??'玩家')}的${player.seat===value.viewer?'手牌':'公开手牌'}：${cards(player.hand)||'已出完'}`);
  }
  if(cards(value.board))lines.push(`公共牌：${cards(value.board)}`);
  if(cards(value.bottom))lines.push(`已公开底牌：${cards(value.bottom)}`);
  if(typeof value.pot==='number')lines.push(`底池：${value.pot} 筹码`);
  if(typeof value.highBid==='number'&&value.highBid>0)lines.push(`底分：${value.highBid}`);
  if(typeof value.multiplier==='number')lines.push(`倍数：${value.multiplier}`);
  const legal=Array.isArray(value.legalActions)?value.legalActions.map(object).flatMap(action=>typeof action?.label==='string'?[action.label]:[]):[];
  if(legal.length)lines.push(`\n可选行动：${legal.join('；')}${typeof value.legalActionCount==='number'&&value.legalActionCount>legal.length?`（共 ${value.legalActionCount} 种）`:''}`);
  const events=Array.isArray(value.events)?value.events.map(object).filter((e):e is Record<string,unknown>=>!!e&&typeof e.text==='string'):[];
  if(events.length)lines.push('\n本局记录：',...events.map(event=>`${typeof event.seq==='number'?`${event.seq}. `:''}${typeof event.seat==='number'?`${name(event.seat)} `:''}${event.text}${cards(event.cards)?` · ${cards(event.cards)}`:''}`));
  return lines.join('\n');
}

function textContent(value:unknown,depth=0):string{
  if(depth>12)return '';
  if(typeof value==='string')return value;
  if(Array.isArray(value))return value.map(v=>textContent(v,depth+1)).filter(Boolean).join('\n');
  const record=object(value);if(!record)return '';
  if(Array.isArray(record.players))return observation(record);
  return [...new Set(['text','message','content','reasoning','summary','error','details'].map(key=>textContent(record[key],depth+1)).filter(Boolean))].join('\n');
}

function jsonEnd(text:string,start:number):number{
  let depth=0,quoted=false,escaped=false;
  for(let i=start;i<text.length;i++){
    const char=text[i];
    if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
    if(char==='"')quoted=true;
    else if(char==='{'||char==='[')depth++;
    else if((char==='}'||char===']')&&--depth===0)return i+1;
  }
  return text.length;
}

function readableText(source:string):string{
  const trimmed=source.trim();
  if(trimmed.startsWith('{')||trimmed.startsWith('[')){
    try{return textContent(JSON.parse(trimmed)).trim();}catch{if(trimmed.startsWith('{')||/^\[\s*(?:[\[{"\d-]|$)/.test(trimmed))return '';}
  }
  const marker=/(初始观察|当前观察)：\s*(?=\{)/g;
  let match:RegExpExecArray|null,cursor=0,result='';
  while((match=marker.exec(source))){
    const start=marker.lastIndex,end=jsonEnd(source,start);
    result+=source.slice(cursor,match.index).trimEnd()+'\n\n收到的牌桌信息：\n';
    try{result+=textContent(JSON.parse(source.slice(start,end)));}catch{result+='这段牌桌信息暂时无法显示。';}
    cursor=end;marker.lastIndex=end;
  }
  result+=source.slice(cursor);
  return result.replace(/```json\s*\n([\s\S]*?)```/gi,(_,json:string)=>{try{return textContent(JSON.parse(json));}catch{return '';}}).trim();
}

// The stored transcript remains complete; this is the readable conversation view.
export function conversationContent(entry:ConversationEntry):ConversationContent|null{
  if(cache.has(entry))return cache.get(entry)!;
  let content:ConversationContent|null=null;
  if(entry.kind==='instructions'||entry.kind==='prompt'||entry.kind==='message'||entry.kind==='reasoning'||entry.kind==='error'){
    const source=entry.kind==='prompt'?entry.text.replace(/，决策 [^\n。]+。/g,'。'):entry.text;
    const text=readableText(source);
    if(text)content={...entry,kind:entry.kind,title:entry.kind==='error'?'本次操作未完成':entry.title,text};
  }
  cache.set(entry,content);return content;
}
