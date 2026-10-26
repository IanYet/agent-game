import type {Card,PlayerConfig} from '@agent-game/core';
import {beats,candidatePlays,classify,declaration} from './combinations';
import {cardsText,isWild,label,makeDeck,shuffledDeck,sortHand,strength,teamName} from './cards';
import type {Action,GameEvent,GameView,GuandanState,LegalAction,Result,Team} from './types';

const now=()=>new Date().toISOString();
export function addEvent(state:GuandanState,type:GameEvent['type'],text:string,seat?:number,cards?:Card[],combination?:GameEvent['combination']){
  state.events.push({seq:state.events.length+1,time:now(),type,text,...(seat===undefined?{}:{seat}),...(cards?{cards:[...cards]}:{}),...(combination?{combination}: {})});
}
const partner=(seat:number)=>(seat+2)%4;
const team=(seat:number)=>seat%2 as Team;
const active=(state:GuandanState)=>state.players.filter(p=>p.hand.length>0).map(p=>p.seat);
function nextActive(state:GuandanState,seat:number){
  for(let n=1;n<=4;n++){const next=(seat+n)%4;if(state.players[next].hand.length)return next;}
  throw new Error('没有可行动的玩家');
}
function requireSeat(state:GuandanState,seat:number){if(!Number.isInteger(seat)||seat<0||seat>3)throw new Error('无效的玩家身份');}

export function createGame(id:string,players:PlayerConfig[],options:{random:()=>number;round?:number;previous?:GuandanState}):GuandanState {
  if(players.length!==4||players.some(p=>!p.name.trim())||players.filter(p=>p.kind==='human').length>1)throw new Error('掼蛋固定四人，最多一位真人；1、3 座同队，2、4 座同队');
  const previous=options.previous,prior=previous?.result;
  if(previous&&!prior)throw new Error('本副尚未结束');
  if(previous&&prior?.matchWinner===null&&players.some((p,i)=>p.playerId!==previous.players[i].playerId))throw new Error('本盘尚未过 A，四个座位与队伍必须保持；更换阵容请开新桌');
  const newMatch=!!prior&&prior.matchWinner!==null;
  const levels:[number,number]=prior&&!newMatch?[...prior.levelsAfter]:[2,2];
  const levelTeam:Team=prior&&!newMatch?prior.winner:0,level=levels[levelTeam];
  const deck=shuffledDeck(options.random),createdAt=now();
  const state:GuandanState={gameId:'guandan',id,round:options.round??1,revision:1,createdAt,
    phase:'playing',players:players.map((p,seat)=>({...p,seat,team:team(seat),hand:sortHand(deck.slice(seat*27,(seat+1)*27),level)})),
    turn:Math.min(3,Math.floor(options.random()*4)),level,levelTeam,levels,
    matchNumber:(previous?.matchNumber??1)+(newMatch?1:0),matchWins:[...(previous?.matchWins??[0,0])],
    tribute:null,lastPlay:null,lastActions:[null,null,null,null],passed:[],finishOrder:[],played:[],events:[],result:null};
  addEvent(state,'deal',`第 ${state.matchNumber} 盘 · 第 ${state.round} 副，${teamName(levelTeam)}打 ${label(level)}；每人 27 张，对家同队。`);
  if(prior&&!newMatch){
    const donors=prior.doubleDown?prior.order.slice(2):[prior.order[3]],receivers=prior.doubleDown?prior.order.slice(0,2):[prior.order[0]];
    state.tribute={donors,receivers,offers:[],exchanges:[],leader:prior.order[0],anti:false};
    const kings=donors.flatMap(seat=>state.players[seat].hand.filter(c=>c.rank===17).map(card=>({seat,card})));
    if(kings.length===2){
      state.tribute.anti=true;state.turn=prior.order[0];
      for(const entry of kings)addEvent(state,'anti','亮出大王；应贡方合计两张大王，抗贡，本副免贡还。',entry.seat,[entry.card]);
    }else{state.phase='tribute';state.turn=donors[0];}
  }
  if(state.phase==='playing')addEvent(state,'start',`${state.tribute?.anti?'抗贡后由上副头游':'首副随机确定'}领出。`,state.turn);
  return state;
}

export function tributeChoices(state:GuandanState,seat:number):Card[]{
  const cards=state.players[seat].hand.filter(c=>!isWild(c,state.level));
  const max=Math.max(...cards.map(c=>strength(c.rank,state.level)));
  return cards.filter(c=>strength(c.rank,state.level)===max);
}
export function returnChoices(state:GuandanState,seat:number):Card[]{
  const cards=state.players[seat].hand.filter(c=>!isWild(c,state.level));
  const low=cards.filter(c=>c.rank<=10&&c.rank!==state.level);
  if(low.length)return low;
  const min=Math.min(...cards.map(c=>strength(c.rank,state.level)));
  return cards.filter(c=>strength(c.rank,state.level)===min);
}
function moveCard(state:GuandanState,from:number,to:number,card:Card){
  const index=state.players[from].hand.findIndex(c=>c.id===card.id);if(index<0)throw new Error('交换的牌不在手中');
  state.players[from].hand.splice(index,1);state.players[to].hand=sortHand([...state.players[to].hand,card],state.level);
}
function resolveTribute(state:GuandanState){
  const tribute=state.tribute!;
  const offers=[...tribute.offers].sort((a,b)=>strength(b.card.rank,state.level)-strength(a.card.rank,state.level));
  const tied=offers.length===2&&strength(offers[0].card.rank,state.level)===strength(offers[1].card.rank,state.level);
  // For equal tribute, the upper player's next seat pays the upper player.
  if(tied)offers.sort((a,b)=>((a.seat-tribute.receivers[0]+4)%4)-((b.seat-tribute.receivers[0]+4)%4));
  tribute.exchanges=offers.map((offer,i)=>({from:offer.seat,to:tribute.receivers[i],tribute:offer.card}));
  tribute.leader=offers[0].seat;
  tribute.exchanges.forEach(exchange=>moveCard(state,exchange.from,exchange.to,exchange.tribute));
  state.phase='return';state.turn=tribute.receivers[0];
  addEvent(state,'tribute',`${tribute.exchanges.map(e=>`${state.players[e.from].name} → ${state.players[e.to].name}：${cardsText([e.tribute])}`).join('；')}。${tied?'同点贡按头游下家优先；':''}等待受贡者还牌。`);
}

function finish(state:GuandanState){
  const first=state.finishOrder[0],winner=team(first),doubleDown=state.finishOrder.length===2;
  const rest=state.players.map(p=>p.seat).filter(s=>!state.finishOrder.includes(s));
  const order=[...state.finishOrder,...rest],partnerPlace=order.indexOf(partner(first))+1;
  const advance=partnerPlace===2?3:partnerPlace===3?2:1;
  const levelsAfter:[number,number]=[...state.levels];levelsAfter[winner]=Math.min(14,levelsAfter[winner]+advance);
  const passedA=state.level===14&&state.levelTeam===winner&&partnerPlace<4;
  if(passedA)state.matchWins[winner]++;
  const result:Result={order,doubleDown,winner,advance,levelsBefore:[...state.levels],levelsAfter,matchWinner:passedA?winner:null};
  state.phase='finished';state.result=result;
  addEvent(state,'finish',`${teamName(winner)}获得头游，${doubleDown?'对手双下':`搭档${partnerPlace===3?'三游':'末游'}`}，升 ${advance} 级至 ${label(levelsAfter[winner])}。${passedA?`成功过 A，本盘获胜；本桌盘分 ${state.matchWins.join(' : ')}。`:'下副继续同盘，按本副名次贡还牌。'}`);
}

export function applyAction(current:GuandanState,seat:number,input:unknown):GuandanState {
  requireSeat(current,seat);
  if(current.phase==='finished')throw new Error('本副已结束');
  if(current.turn!==seat)throw new Error('还没有轮到你');
  if(!input||typeof input!=='object')throw new Error('无效的掼蛋行动');
  const action=input as Action;
  if(current.phase==='tribute'||current.phase==='return'){
    if(action.type!==current.phase||!('card' in action)||typeof action.card!=='string')throw new Error(`当前必须${current.phase==='tribute'?'进贡':'还牌'}`);
    const choices=current.phase==='tribute'?tributeChoices(current,seat):returnChoices(current,seat);
    const card=choices.find(c=>c.id===action.card);if(!card)throw new Error(current.phase==='tribute'?'进贡须选除逢人配外最大的单张':'还牌须选非级牌的 10 及以下；没有时选除逢人配外最小单张');
    const state=structuredClone(current),tribute=state.tribute!;state.revision++;
    if(action.type==='tribute'){
      tribute.offers.push({seat,card});addEvent(state,'tribute','选定贡牌。',seat,[card]);
      const next=tribute.donors.find(s=>!tribute.offers.some(o=>o.seat===s));
      if(next===undefined)resolveTribute(state);else state.turn=next;
    }else{
      const exchange=tribute.exchanges.find(e=>e.to===seat&&!e.returned);if(!exchange)throw new Error('你没有待还的贡牌');
      moveCard(state,seat,exchange.from,card);exchange.returned=card;addEvent(state,'return',`向 ${state.players[exchange.from].name} 还牌。`,seat,[card]);
      const next=tribute.exchanges.find(e=>!e.returned);
      if(next)state.turn=next.to;
      else{state.phase='playing';state.turn=tribute.leader;addEvent(state,'start','贡还完成，由进贡大牌者领出；同点贡由头游下家领出。',state.turn);}
    }
    return state;
  }
  if(action.type==='pass'){
    if(!current.lastPlay)throw new Error('领出时不能不出');
    const state=structuredClone(current);state.revision++;state.passed.push(seat);state.lastActions[seat]={type:'pass',cards:[],label:'不出'};addEvent(state,'pass','不出。',seat);
    if(active(state).filter(s=>s!==state.lastPlay!.seat).every(s=>state.passed.includes(s))){
      const owner=state.lastPlay!.seat;
      state.turn=state.players[owner].hand.length?owner:state.players[partner(owner)].hand.length?partner(owner):nextActive(state,owner);
      const wind=state.turn!==owner;
      state.lastPlay=null;state.passed=[];state.lastActions=[null,null,null,null];
      addEvent(state,'wind',wind?`搭档最后一手无人压，接风领出。`:'本圈无人再压，重新领出。',state.turn);
    }else state.turn=nextActive(state,seat);
    return state;
  }
  if(action.type!=='play'||!Array.isArray(action.cards)||!action.cards.length||action.cards.some(id=>typeof id!=='string')||new Set(action.cards).size!==action.cards.length)throw new Error('请选择不重复的实体手牌并声明牌型');
  const declared=action.combination;
  if(!declared||typeof declared!=='object'||Array.isArray(declared)||typeof declared.kind!=='string'||!Number.isInteger(declared.rank)||Object.keys(declared).some(k=>!['kind','rank','suit','pairRank'].includes(k)))throw new Error('牌型声明须包含 kind、rank；三带对另填 pairRank，同花顺另填 suit');
  const cards=action.cards.map(id=>{const card=current.players[seat].hand.find(c=>c.id===id);if(!card)throw new Error('所选牌不在你的手中');return card;});
  const combination=classify(cards,current.level).find(c=>c.kind===declared.kind&&c.rank===declared.rank&&c.suit===declared.suit&&c.pairRank===declared.pairRank);
  if(!combination)throw new Error('所选牌无法组成声明的牌型；逢人配不能代替大小王');
  if(!beats(combination,current.lastPlay?.combination??null,current.level))throw new Error('必须出更大的同类牌型或更大的炸弹');
  const state=structuredClone(current);state.revision++;
  state.players[seat].hand=state.players[seat].hand.filter(c=>!action.cards.includes(c.id));state.played.push(...cards);
  state.lastPlay={seat,cards,combination};state.lastActions[seat]={type:'play',cards,label:combination.label};state.passed=[];
  addEvent(state,'play',`${combination.label}。${state.players[seat].hand.length<=10?`余 ${state.players[seat].hand.length} 张。`:''}`,seat,cards,combination);
  if(!state.players[seat].hand.length){
    state.finishOrder.push(seat);addEvent(state,'rank',`出完手牌，${['头游','二游','三游'][state.finishOrder.length-1]}。`,seat);
    if(state.finishOrder.length===3||(state.finishOrder.length===2&&team(state.finishOrder[0])===team(state.finishOrder[1]))){finish(state);return state;}
  }
  state.turn=nextActive(state,seat);return state;
}

export function getLegalActions(state:GuandanState,seat:number):LegalAction[]{
  requireSeat(state,seat);if(state.phase==='finished'||state.turn!==seat)return [];
  if(state.phase==='tribute'||state.phase==='return'){
    const type=state.phase,choices=type==='tribute'?tributeChoices(state,seat):returnChoices(state,seat);
    return choices.map(card=>({id:`${type}:${card.id}`,action:{type,card:card.id},label:`${type==='tribute'?'进贡':'还牌'} ${cardsText([card])}`,cards:[card]}));
  }
  const result:LegalAction[]=candidatePlays(state.players[seat].hand,state.level,state.lastPlay?.combination??null).map(({cards,combination})=>({
    id:`play:${cards.map(c=>c.id).sort().join(',')}|${combination.key}`,action:{type:'play',cards:cards.map(c=>c.id),combination:declaration(combination)},label:combination.label,cards,combination,
  }));
  if(state.lastPlay)result.unshift({id:'pass',action:{type:'pass'},label:'不出',cards:[]});
  return result;
}

export function viewGame(state:GuandanState,viewer:number|null,revealHands=false,includeActions=true):GameView {
  if(viewer!==null)requireSeat(state,viewer);
  const {players,played:_,...publicState}=structuredClone(state);
  return {...publicState,players:players.map(p=>{
    const {hand,...rest}=p;
    const knownIds=new Set(state.events.filter(e=>e.type==='anti'&&e.seat===p.seat).flatMap(e=>e.cards?.map(c=>c.id)??[]));
    state.tribute?.exchanges.forEach(e=>{if(e.to===p.seat)knownIds.add(e.tribute.id);if(e.from===p.seat&&e.returned)knownIds.add(e.returned.id);});
    // An offered card is public before the simultaneous exchange is resolved.
    state.tribute?.offers.filter(o=>o.seat===p.seat).forEach(o=>knownIds.add(o.card.id));
    const at=state.finishOrder.indexOf(p.seat),double=state.result?.doubleDown&&!state.finishOrder.includes(p.seat);
    return {...rest,count:hand.length,knownCards:hand.filter(c=>knownIds.has(c.id)),place:double?'双下':at>=0?['头游','二游','三游'][at]:state.phase==='finished'?'末游':'',...(viewer===p.seat||revealHands?{hand}: {})};
  }),viewer,legalActions:viewer===null||!includeActions?[]:getLegalActions(state,viewer)};
}

export function restoreState(data:unknown,version:number):GuandanState {
  const fail=()=>{throw new Error('掼蛋存档格式或版本不受支持，请新建游戏');};
  if(version!==1||!data||typeof data!=='object')return fail();
  const s=data as GuandanState,deck=makeDeck(),canonical=new Map(deck.map(c=>[c.id,c]));
  const validCard=(c:Card)=>c&&canonical.get(c.id)?.rank===c.rank&&canonical.get(c.id)?.suit===c.suit;
  const validSeat=(n:number)=>Number.isInteger(n)&&n>=0&&n<4;
  const validLevels=(v:number[])=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>=2&&n<=14);
  if(s.gameId!=='guandan'||typeof s.id!=='string'||!Number.isInteger(s.revision)||s.revision<1||!Number.isInteger(s.round)||s.round<1||!['tribute','return','playing','finished'].includes(s.phase)||!Array.isArray(s.players)||s.players.length!==4||!Array.isArray(s.played)||!Array.isArray(s.events)||!Array.isArray(s.finishOrder)||new Set(s.finishOrder).size!==s.finishOrder.length||s.finishOrder.some(n=>!Number.isInteger(n)||n<0||n>3)||!Array.isArray(s.lastActions)||s.lastActions.length!==4||!Array.isArray(s.passed)||s.passed.some(n=>!Number.isInteger(n)||n<0||n>3))return fail();
  if(s.players.some((p,i)=>!p||p.seat!==i||p.team!==team(i)||typeof p.playerId!=='string'||!p.playerId||typeof p.name!=='string'||!p.name.trim()||!['human','agent'].includes(p.kind)||!Array.isArray(p.hand))||new Set(s.players.map(p=>p.playerId)).size!==4||s.players.filter(p=>p.kind==='human').length>1)return fail();
  const cards=[...s.played,...s.players.flatMap(p=>p.hand)];
  if(cards.length!==108||new Set(cards.map(c=>c.id)).size!==108||!cards.every(validCard))return fail();
  if(!Array.isArray(s.levels)||s.levels.length!==2||s.levels.some(l=>!Number.isInteger(l)||l<2||l>14)||![0,1].includes(s.levelTeam)||s.level!==s.levels[s.levelTeam]||!Number.isInteger(s.turn)||s.turn<0||s.turn>3||!Array.isArray(s.matchWins)||s.matchWins.length!==2||s.matchWins.some(n=>!Number.isInteger(n)||n<0)||!Number.isInteger(s.matchNumber)||s.matchNumber<1||typeof s.createdAt!=='string')return fail();
  if(s.events.some((e,i)=>!e||e.seq!==i+1||!['deal','tribute','return','anti','start','play','pass','wind','rank','finish'].includes(e.type)||typeof e.text!=='string'||typeof e.time!=='string'||(e.seat!==undefined&&!validSeat(e.seat))||(e.cards&&(!Array.isArray(e.cards)||!e.cards.every(validCard)))))return fail();
  if(s.finishOrder.some(seat=>s.players[seat].hand.length!==0)||new Set(s.passed).size!==s.passed.length||s.lastActions.some(a=>a!==null&&(!['play','pass'].includes(a.type)||!Array.isArray(a.cards)||!a.cards.every(validCard)||typeof a.label!=='string')))return fail();
  if(s.phase==='finished'){
    const r=s.result;if(!r||!Array.isArray(r.order)||r.order.length!==4||new Set(r.order).size!==4||!r.order.every(validSeat)||![0,1].includes(r.winner)||![1,2,3].includes(r.advance)||!validLevels(r.levelsBefore)||!validLevels(r.levelsAfter)||typeof r.doubleDown!=='boolean'||!(r.matchWinner===null||r.matchWinner===r.winner))return fail();
    const first=s.finishOrder[0],partnerPlace=r.order.indexOf(partner(first))+1;
    if(s.finishOrder.length!==(r.doubleDown?2:3)||s.finishOrder.some((seat,i)=>r.order[i]!==seat)||r.winner!==team(first)||r.doubleDown!==(partnerPlace===2)||r.advance!==(partnerPlace===2?3:partnerPlace===3?2:1)||r.levelsBefore.some((n,i)=>n!==s.levels[i])||r.levelsAfter.some((n,i)=>n!==(i===r.winner?Math.min(14,s.levels[i]+r.advance):s.levels[i]))||(r.matchWinner!==null)!==(s.level===14&&s.levelTeam===r.winner&&partnerPlace<4))return fail();
  }else if(s.result!==null||!s.players[s.turn].hand.length)return fail();
  if(s.lastPlay){
    const p=s.lastPlay;
    if(!validSeat(p.seat)||!Array.isArray(p.cards)||!p.cards.length||!p.cards.every(c=>validCard(c)&&s.played.some(p=>p.id===c.id)))return fail();
    const combo=classify(p.cards,s.level).find(c=>c.key===p.combination?.key);
    if(!combo||['kind','rank','size','suit','pairRank','label'].some(k=>combo[k as keyof typeof combo]!==p.combination[k as keyof typeof combo]))return fail();
  }
  if(s.tribute!==null){
    const t=s.tribute;
    if(!t||!Array.isArray(t.donors)||!Array.isArray(t.receivers)||![1,2].includes(t.donors.length)||t.donors.length!==t.receivers.length||![...t.donors,...t.receivers].every(validSeat)||new Set([...t.donors,...t.receivers]).size!==t.donors.length+t.receivers.length||!Array.isArray(t.offers)||!Array.isArray(t.exchanges)||typeof t.anti!=='boolean'||!validSeat(t.leader)||t.offers.some(o=>!o||!t.donors.includes(o.seat)||!validCard(o.card))||new Set(t.offers.map(o=>o.seat)).size!==t.offers.length||t.exchanges.some(e=>!e||!t.donors.includes(e.from)||!t.receivers.includes(e.to)||!validCard(e.tribute)||(e.returned&&!validCard(e.returned))))return fail();
    if(t.anti&&(t.offers.length||t.exchanges.length||s.phase==='tribute'||s.phase==='return'))return fail();
    if(s.phase==='tribute'&&(!t.donors.includes(s.turn)||t.offers.some(o=>o.seat===s.turn)||t.offers.length>=t.donors.length||t.exchanges.length))return fail();
    if(!t.anti&&s.phase!=='tribute'&&(t.offers.length!==t.donors.length||t.exchanges.length!==t.donors.length||new Set(t.exchanges.map(e=>e.from)).size!==t.donors.length||new Set(t.exchanges.map(e=>e.to)).size!==t.receivers.length))return fail();
    if(s.phase==='return'&&!t.exchanges.some(e=>e.to===s.turn&&!e.returned))return fail();
    if(!t.anti&&s.phase!=='return'&&s.phase!=='tribute'&&t.exchanges.some(e=>!e.returned))return fail();
  }else if(s.phase==='tribute'||s.phase==='return'){
    return fail();
  }
  return structuredClone(s);
}
