import {createDeck,rankLabel,shuffle,sortCards} from '@agent-game/core';
import type {BaoAction,BaoCard,BaoChoice,BaoEvent,BaoState,BaoView} from './types';

export function createBaoDeck():BaoCard[]{
  return Array.from({length:4},(_,pack)=>createDeck().filter(c=>c.rank>=6).map(c=>({
    ...c,id:`${pack}:${c.id}`,...(pack===0&&c.rank>=16?{mark:c.rank===17?'emperor' as const:'guard' as const}:{}),
  }))).flat();
}
const event=(s:BaoState,type:string,text:string,seat?:number,cards?:BaoCard[])=>{
  const e:BaoEvent={seq:s.events.length+1,time:new Date().toISOString(),type,text};
  if(seat!==undefined)e.seat=seat;if(cards)e.cards=cards;s.events.push(e);
};
export function createGame(id:string,players:Array<{playerId:string;name:string;kind:'human'|'agent'}>,options:{random:()=>number;round?:number;scores?:number[];dealStart?:number;baseScore?:number}):BaoState{
  if(players.length!==5||new Set(players.map(p=>p.playerId)).size!==5)throw new Error('山东保皇需要五位身份不同的玩家');
  if(players.filter(p=>p.kind==='human').length>1)throw new Error('最多一位真人');
  if(!Number.isInteger(options.baseScore??1)||(options.baseScore??1)<1||(options.baseScore??1)>100)throw new Error('底分须为1至100的整数');
  const deck=shuffle(createBaoDeck(),options.random) as BaoCard[],start=options.dealStart??0;
  const seats=players.map((p,seat)=>({...p,seat,hand:[] as BaoCard[],score:options.scores?.[seat]??0,rank:null}));
  deck.forEach((card,i)=>seats[(start+i)%5].hand.push(card));seats.forEach(p=>p.hand=sortCards(p.hand));
  const emperor=seats.findIndex(p=>p.hand.some(c=>c.mark==='emperor')),guard=seats.findIndex(p=>p.hand.some(c=>c.mark==='guard'));
  const s:BaoState={gameId:'baohuang',id,round:options.round??1,baseScore:options.baseScore??1,createdAt:new Date().toISOString(),revision:1,
    phase:'enthrone',players:seats,turn:emperor,initialEmperor:emperor,emperor,guard,cedes:0,
    declarations:Array(5).fill(null),open:false,guardPublic:false,trick:0,lastPlay:null,responders:[],lastActions:Array(5).fill(null),order:[],played:[],events:[],result:null};
  event(s,'deal','四副牌去掉3、4、5，共168张；三家34张，两家33张。');
  event(s,'crown','拿到皇牌，选择登基或向上家让位。',emperor,[seats[emperor].hand.find(c=>c.mark==='emperor')!]);
  return s;
}

// A set may contain one ordinary rank and any number of the two joker ranks.
export function classify(cards:BaoCard[]):{label:string;ranks:number[]}|null{
  if(!cards.length||new Set(cards.map(c=>c.id)).size!==cards.length||cards.some(c=>!Number.isInteger(c.rank)||c.rank<6||c.rank>17))return null;
  const plain=[...new Set(cards.filter(c=>c.rank<16).map(c=>c.rank))];if(plain.length>1)return null;
  const big=cards.filter(c=>c.rank===17).length,small=cards.filter(c=>c.rank===16).length,normal=cards.length-big-small;
  const label=[normal?`${normal}张${rankLabel(plain[0])}`:'',small?`${small}小王`:'',big?`${big}大王`:''].filter(Boolean).join(' + ');
  return {label,ranks:cards.map(c=>c.rank).sort((a,b)=>a-b)};
}
export function beats(cards:BaoCard[],previous:BaoCard[]|null):boolean{
  const a=classify(cards);if(!a)return false;if(!previous)return true;
  const b=classify(previous);return !!b&&a.ranks.length===b.ranks.length&&a.ranks.every((rank,i)=>rank>b.ranks[i]);
}
const isPending=(s:BaoState,seat:number)=>s.phase==='declare'?s.declarations[seat]===null:s.phase!=='finished'&&s.turn===seat;
export function pendingSeats(s:BaoState):number[]{return s.phase==='finished'?[]:s.phase==='declare'?s.players.filter(p=>s.declarations[p.seat]===null).map(p=>p.seat):[s.turn];}
const nextLive=(s:BaoState,seat:number)=>{for(let n=1;n<=5;n++){const at=(seat+n)%5;if(s.players[at].rank===null)return at;}throw new Error('没有可行动玩家');};
const responding=(s:BaoState,seat:number)=>Array.from({length:4},(_,n)=>(seat+n+1)%5).filter(at=>s.players[at].rank===null);
function enterDeclaration(s:BaoState){s.phase='declare';event(s,'enthrone','登基。全体玩家同时确认开局，侍卫私下选择明保或暗保。',s.emperor);}
function settle(s:BaoState){
  const solo=s.emperor===s.guard,e=s.players[s.emperor],g=s.players[s.guard];
  let base=0,rankSum:number|undefined,reason='';
  if(solo){
    if(s.open){if(!s.order.length)return;base=s.order[0]===s.emperor?24:-24;reason=base>0?'明独保头客':'明独保未获头客';}
    else {if(e.rank!==null){base=e.rank===1?12:0;reason=e.rank===1?'暗独保头客':'暗独保二客，和局';}else if(s.order.length>=2){base=-12;reason='暗独保已有两名平民走完';}else return;}
  }else {
    const royalDone=e.rank!==null&&g.rank!==null,civDone=s.players.filter(p=>p.seat!==s.emperor&&p.seat!==s.guard).every(p=>p.rank!==null);
    if(!royalDone&&!civDone)return;
    // If all civilians finish first, unresolved royal positions are the remaining ranks.
    const missing=[e,g].filter(p=>p.rank===null).length;
    rankSum=(e.rank??0)+(g.rank??0)+Array.from({length:missing},(_,i)=>s.order.length+i+1).reduce((a,b)=>a+b,0);
    base=(6-rankSum)*(s.open?2:1);reason=`皇保名次和${rankSum}${s.open?'，明保翻倍':''}`;
  }
  const deltas=s.players.map(p=>(solo?(p.seat===s.emperor?base:-base/4):p.seat===s.emperor?base*2:p.seat===s.guard?base:-base)*s.baseScore);
  s.result={winner:base>0?'royal':base<0?'civilian':'draw',deltas,emperor:s.emperor,guard:s.guard,solo,open:s.open,reason,...(rankSum===undefined?{}:{rankSum})};
  s.phase='finished';s.guardPublic=true;s.responders=[];
  s.players.forEach((p,i)=>p.score+=deltas[i]);
  event(s,'reveal',solo?'身份揭晓：皇帝独保。':`身份揭晓：${g.name}是侍卫。`,s.guard);
  event(s,'finish',`${base>0?'保皇派获胜':base<0?'平民获胜':'和局'}；${reason}。${s.players.map(p=>`${p.name}${deltas[p.seat]>=0?'+':''}${deltas[p.seat]}`).join('，')}`);
}
function completeTrick(s:BaoState){
  const leader=s.lastPlay!.seat,wind=s.players[leader].rank!==null;s.turn=wind?nextLive(s,leader):leader;
  s.trick++;s.lastPlay=null;s.lastActions=Array(5).fill(null);s.responders=[];
  event(s,wind?'wind':'lead',wind?'上家末手无人接，下家接风，可领出任意合法套牌。':'其余玩家均让过，重新领牌。',s.turn);
}
export function applyAction(state:BaoState,seat:number,input:BaoAction):BaoState{
  if(!Number.isInteger(seat)||seat<0||seat>=5||!isPending(state,seat))throw new Error('当前没有这位玩家的待决策');
  if(!input||typeof input!=='object'||typeof input.type!=='string')throw new Error('行动格式不正确');
  const s=structuredClone(state),action=input,p=s.players[seat];
  if(s.phase==='enthrone'){
    if(action.type==='enthrone')enterDeclaration(s);
    else if(action.type==='cede'){
      const at=(seat+4)%5,card=p.hand.find(c=>c.mark==='emperor')!;
      p.hand=p.hand.filter(c=>c.id!==card.id);s.players[at].hand=sortCards([...s.players[at].hand,card]);
      s.cedes++;s.emperor=at;s.turn=at;event(s,'cede',`将皇牌让给上家${s.players[at].name}，不贴牌。`,seat,[card]);
      if(s.cedes===5)enterDeclaration(s);
    }else throw new Error('请登基或让位');
  }else if(s.phase==='declare'){
    if(action.type!=='declare'||typeof action.open!=='boolean'||(seat!==s.guard&&action.open))throw new Error('只有侍卫可以明保；其他玩家请确认准备');
    s.declarations[seat]=action.open;
    // Never publish the identity or timing of an individual secret declaration.
    if(s.declarations.every(v=>v!==null)){
      s.open=s.declarations[s.guard]===true;s.guardPublic=s.open;s.phase='playing';s.turn=s.emperor;s.trick=1;
      event(s,'declaration',s.open?(s.guard===s.emperor?'皇帝声明明独保。':'选择明保，所有胜负积分翻倍。'):'全体已准备，采用暗保。',s.open?s.guard:undefined);
      event(s,'lead','皇帝首引。',s.emperor);
    }
  }else if(s.phase==='playing'){
    if(action.type==='pass'){
      if(!s.lastPlay)throw new Error('领牌不能让过');
      s.lastActions[seat]='pass';event(s,'pass','让过。',seat);s.responders=s.responders.filter(at=>at!==seat);
    }else if(action.type==='play'){
      if(!Array.isArray(action.cards)||!action.cards.length||action.cards.some(id=>typeof id!=='string')||new Set(action.cards).size!==action.cards.length)throw new Error('请选择不同的手牌');
      const cards=action.cards.map(id=>p.hand.find(c=>c.id===id));
      if(cards.some(c=>!c))throw new Error('只能打出自己持有的牌');
      const hand=sortCards(cards as BaoCard[]) as BaoCard[],combination=classify(hand);
      if(!combination)throw new Error('只能出同点套牌、纯王或大小王挂同一种点数的套牌');
      if(!beats(hand,s.lastPlay?.cards??null))throw new Error('跟牌张数必须相同，逐张严格压过上一套牌');
      p.hand=p.hand.filter(c=>!action.cards.includes(c.id));s.played.push(...hand);
      s.lastPlay={seat,cards:hand,label:combination.label};s.lastActions[seat]=s.lastPlay;
      event(s,'play',combination.label,seat,hand);
      if(hand.some(c=>c.mark==='guard')&&!s.guardPublic){s.guardPublic=true;event(s,'reveal','打出标记侍卫牌，身份公开；仍按开局的暗保计分。',seat);}
      if(!p.hand.length){p.rank=s.order.length+1;s.order.push(seat);event(s,'rank',`走完，获得${rankName(p.rank)}。`,seat);settle(s);}
      if(!s.result)s.responders=responding(s,seat);
    }else throw new Error('现在只能出牌或让过');
    if(!s.result){if(s.responders.length)s.turn=s.responders[0];else completeTrick(s);}
  }
  s.revision++;return s;
}
export function rankName(rank:number){return ['','头客','二客','三客','二拉','大拉'][rank]??`第${rank}名`;}

// Equivalent unmarked copies are grouped. Keep both marked jokers distinct:
// the guard card reveals identity; the public crown can also disclose a remaining joker.
export function legalActions(s:BaoState,seat:number):BaoChoice[]{
  if(seat<0||seat>=5||!isPending(s,seat))return [];
  if(s.phase==='enthrone')return [{id:'enthrone',label:'登基',action:{type:'enthrone'}},{id:'cede',label:'让位给上家',action:{type:'cede'}}];
  if(s.phase==='declare')return seat===s.guard?[{id:'dark',label:s.guard===s.emperor?'暗独保':'暗保',action:{type:'declare',open:false}},{id:'open',label:s.guard===s.emperor?'明独保':'明保 · 积分翻倍',action:{type:'declare',open:true}}]:[{id:'ready',label:'确认准备',action:{type:'declare',open:false}}];
  const hand=[...s.players[seat].hand].sort((a,b)=>a.id.localeCompare(b.id)),out:BaoChoice[]=[],target=s.lastPlay?.cards??null,count=target?.length;
  if(target)out.push({id:'pass',label:'让过',action:{type:'pass'}});
  const normal=Array.from({length:10},(_,i)=>i+6).map(rank=>hand.filter(c=>c.rank===rank));
  const big=hand.filter(c=>c.rank===17&&!c.mark),crown=hand.find(c=>c.mark==='emperor'),small=hand.filter(c=>c.rank===16&&!c.mark),guard=hand.find(c=>c.mark==='guard');
  const push=(cards:BaoCard[])=>{if(!beats(cards,target))return;const ids=cards.map(c=>c.id).sort();out.push({id:`play:${ids.join(',')}`,label:classify(cards)!.label,action:{type:'play',cards:ids},cards});};
  for(let b=0;b<=big.length;b++)for(let e=0;e<=(crown?1:0);e++)for(let w=0;w<=small.length;w++)for(let g=0;g<=(guard?1:0);g++){
    const jokers=[...big.slice(0,b),...(e?[crown!]:[]),...small.slice(0,w),...(g?[guard!]:[])],n=jokers.length;
    if(n&&(!count||count===n))push(jokers);
    for(const group of normal){const min=count?count-n:1,max=count?count-n:group.length;if(min<1||max>group.length)continue;for(let k=min;k<=max;k++)push([...group.slice(0,k),...jokers]);}
  }
  // Large sets first on a fresh lead; economical covers first when following.
  return out.sort((a,b)=>a.action.type==='pass'?-1:b.action.type==='pass'?1:count?Math.max(...a.cards!.map(c=>c.rank))-Math.max(...b.cards!.map(c=>c.rank)):(b.cards!.length-a.cards!.length)||Math.min(...a.cards!.map(c=>c.rank))-Math.min(...b.cards!.map(c=>c.rank)));
}
export function viewGame(s:BaoState,viewer:number|null,revealHands=false,includeActions=true):BaoView{
  const publicGuard=s.guardPublic||s.phase==='finished',knowGuard=publicGuard||viewer===s.guard;
  return {gameId:s.gameId,id:s.id,round:s.round,baseScore:s.baseScore,revision:s.revision,phase:s.phase,viewer,
    players:s.players.map(p=>{const {hand,...other}=p;return {...other,count:hand.length,...(p.seat===viewer||revealHands?{hand}:{}),role:p.seat===s.emperor?(knowGuard&&s.emperor===s.guard?'solo':'emperor'):knowGuard?(p.seat===s.guard?'guard':'civilian'):p.seat===viewer?'civilian':null};}),
    turn:s.phase==='declare'||s.phase==='finished'?null:s.turn,emperor:s.emperor,guard:knowGuard?s.guard:null,open:s.open,guardPublic:publicGuard,cedes:s.cedes,
    ready:s.declarations.flatMap((v,i)=>v===null?[]:[i]),trick:s.trick,lastPlay:s.lastPlay,lastActions:s.lastActions,order:s.order,
    events:s.events,result:s.result,legalActions:viewer===null||!includeActions?[]:legalActions(s,viewer)};
}
