import {CARDS, CARD_BY_ID, NOBLES, NOBLE_BY_ID} from './data';
import {COLORS, GEMS, GEM_NAMES, LEVELS, type Action, type Card, type Color, type Cost, type Event, type Gem, type LegalAction, type Level, type Player, type SplendorState, type SplendorView, type Tokens} from './types';

export const emptyTokens = ():Tokens => ({white:0,blue:0,green:0,red:0,black:0,gold:0});
export const emptyCost = ():Cost => ({white:0,blue:0,green:0,red:0,black:0});
export const tokenCount = (tokens:Tokens) => GEMS.reduce((n,c)=>n+tokens[c],0);
export const cardName = (card:Card) => `${card.level} 级${GEM_NAMES[card.bonus]} ${card.points} 分（${card.id}）`;
export const tokensText = (tokens:Partial<Tokens>) => GEMS.filter(c=>tokens[c]).map(c=>`${GEM_NAMES[c]}×${tokens[c]}`).join('、')||'无需 token';
export function bonuses(player:Player):Cost {
  const result=emptyCost();for(const id of player.bought)result[CARD_BY_ID[id].bonus]++;return result;
}
export const points = (player:Player) => player.bought.reduce((n,id)=>n+CARD_BY_ID[id].points,0)+player.nobles.length*3;
export function effectiveCost(player:Player,card:Card):Cost {
  const discount=bonuses(player);return Object.fromEntries(COLORS.map(c=>[c,Math.max(0,card.cost[c]-discount[c])])) as Cost;
}
export function defaultPayment(player:Player,card:Card):Tokens|null {
  const cost=effectiveCost(player,card),payment=emptyTokens();
  for(const c of COLORS){payment[c]=Math.min(cost[c],player.tokens[c]);payment.gold+=cost[c]-payment[c];}
  return payment.gold<=player.tokens.gold?payment:null;
}
function tokenInput(input:unknown):Tokens {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('token 数量必须是颜色与整数的对象');
  const result=emptyTokens();
  for(const [key,value] of Object.entries(input)){
    if(!GEMS.includes(key as Gem)||!Number.isSafeInteger(value)||(value as number)<0)throw Error('token 颜色或数量无效');
    result[key as Gem]=value as number;
  }
  return result;
}
function shuffle<T>(items:T[],random:()=>number):T[] {
  const result=items.slice();for(let i=result.length-1;i>0;i--){const value=random();if(value<0||value>=1||!Number.isFinite(value))throw Error('随机源无效');const j=Math.floor(value*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;
}
function record(state:SplendorState,event:Omit<Event,'seq'|'time'>) {
  state.events.push({...event,seq:state.events.length+1,time:new Date().toISOString()});
}
type Identity=Pick<Player,'playerId'|'name'|'kind'>;
export function createSplendor(id:string,players:Identity[],options:{random:()=>number;round?:number;firstSeat?:number;standings?:Map<string,{wins:number;totalPoints:number}>}):SplendorState {
  if(players.length<2||players.length>4||new Set(players.map(p=>p.playerId)).size!==players.length)throw Error('璀璨宝石需要 2–4 位身份不同的玩家');
  const firstSeat=options.firstSeat??0;if(!Number.isInteger(firstSeat)||firstSeat<0||firstSeat>=players.length)throw Error('先手座位无效');
  const initialTokens={white:players.length===2?4:players.length===3?5:7,blue:0,green:0,red:0,black:0,gold:5};
  for(const c of COLORS)initialTokens[c]=initialTokens.white;
  const decks={} as Record<Level,string[]>,market={} as SplendorState['market'];
  for(const level of LEVELS){decks[level]=shuffle(CARDS.filter(c=>c.level===level).map(c=>c.id),options.random);market[level]=decks[level].splice(0,4);}
  const state:SplendorState={gameId:'splendor',id,round:options.round??1,createdAt:new Date().toISOString(),revision:1,phase:'action',turn:firstSeat,firstSeat,turnsTaken:players.map(()=>0),
    players:players.map((p,seat)=>({...p,seat,tokens:emptyTokens(),bought:[],reserved:[],nobles:[],wins:options.standings?.get(p.playerId)?.wins??0,totalPoints:options.standings?.get(p.playerId)?.totalPoints??0})),
    bank:{...initialTokens},initialTokens,decks,market,nobles:shuffle(NOBLES.map(n=>n.id),options.random).slice(0,players.length+1),finalRound:false,result:null,events:[]};
  record(state,{type:'setup',text:`基础版 · ${players.length} 人 · 每色 ${initialTokens.white} 枚、黄金 5 枚 · ${players[firstSeat].name}先手；贵族 ${state.nobles.join('、')}`,cards:LEVELS.flatMap(level=>market[level].filter((id):id is string=>id!==null))});
  assertSplendor(state);return state;
}
export function nextSplendor(previous:SplendorState,id:string,players:Identity[],random:()=>number,round:number):SplendorState {
  if(previous.phase!=='finished')throw Error('当前局尚未结束');
  const nextFirstId=previous.players[(previous.firstSeat+1)%previous.players.length].playerId;
  return createSplendor(id,players,{random,round,firstSeat:Math.max(0,players.findIndex(p=>p.playerId===nextFirstId)),standings:new Map(previous.players.map(p=>[p.playerId,{wins:p.wins,totalPoints:p.totalPoints}]))});
}
export function eligibleNobles(state:SplendorState,seat:number):string[] {
  const discount=bonuses(state.players[seat]);return state.nobles.filter(id=>COLORS.every(c=>discount[c]>=NOBLE_BY_ID[id].cost[c]));
}
const marketIds = (state:SplendorState) => LEVELS.flatMap(level=>state.market[level].filter((id):id is string=>id!==null));
function combinations<T>(items:T[],count:number):T[][] {
  if(count===0)return [[]];return items.flatMap((item,i)=>combinations(items.slice(i+1),count-1).map(rest=>[item,...rest]));
}
export function actionId(action:Action):string {
  switch(action.type){
    case 'take':return 'take:'+COLORS.filter(c=>action.colors.includes(c)).join(',');
    case 'pair':return 'pair:'+action.color;
    case 'reserve':case 'buy':return action.type+':'+action.cardId;
    case 'reserveDeck':return 'reserveDeck:'+action.level;
    case 'return':return 'return:'+GEMS.map(c=>action.tokens[c]??0).join(',');
    case 'noble':return 'noble:'+action.nobleId;
    case 'pass':return 'pass';
  }
}
export function legalActions(state:SplendorState,seat:number):LegalAction[] {
  if(state.phase==='finished'||seat!==state.turn||!state.players[seat])return [];
  const player=state.players[seat],result:LegalAction[]=[];
  const add=(action:Action,label:string)=>result.push({id:actionId(action),label,action});
  if(state.phase==='return'){
    const excess=tokenCount(player.tokens)-10;
    const visit=(index:number,left:number,tokens:Tokens)=>{
      if(index===GEMS.length){if(left===0)add({type:'return',tokens:{...tokens}},'归还 '+tokensText(tokens));return;}
      const color=GEMS[index];for(let n=0;n<=Math.min(left,player.tokens[color]);n++){tokens[color]=n;visit(index+1,left-n,tokens);}tokens[color]=0;
    };
    visit(0,excess,emptyTokens());return result;
  }
  if(state.phase==='noble'){eligibleNobles(state,seat).forEach(nobleId=>add({type:'noble',nobleId},`邀请贵族 ${nobleId}`));return result;}
  const available=COLORS.filter(c=>state.bank[c]>0);
  if(available.length)combinations(available,Math.min(3,available.length)).forEach(colors=>add({type:'take',colors},'拿取 '+colors.map(c=>GEM_NAMES[c]).join('、')));
  COLORS.filter(c=>state.bank[c]>=4).forEach(color=>add({type:'pair',color},`拿取 2 枚${GEM_NAMES[color]}`));
  const visible=marketIds(state);
  for(const cardId of [...visible,...player.reserved.map(r=>r.cardId)]){
    const payment=defaultPayment(player,CARD_BY_ID[cardId]);if(payment)add({type:'buy',cardId,payment},`购买 ${cardName(CARD_BY_ID[cardId])} · ${tokensText(payment)}`);
  }
  if(player.reserved.length<3){
    visible.forEach(cardId=>add({type:'reserve',cardId},`预留 ${cardName(CARD_BY_ID[cardId])}${state.bank.gold?' · 获得 1 黄金':''}`));
    LEVELS.filter(level=>state.decks[level].length).forEach(level=>add({type:'reserveDeck',level},`暗抽 ${level} 级预留${state.bank.gold?' · 获得 1 黄金':''}`));
  }
  // A forced pass is possible only with no gems, no reserving space and no affordable card.
  if(!result.length)add({type:'pass'},'无合法行动 · 公开预留并跳过');
  return result;
}
function removeMarket(state:SplendorState,cardId:string):string|null {
  const level=CARD_BY_ID[cardId].level,index=state.market[level].indexOf(cardId);
  if(index<0)throw Error('该卡不在市场');
  const replacement=state.decks[level].shift()??null;state.market[level][index]=replacement;return replacement;
}
function revealReplacement(state:SplendorState,replacement:string|null){if(replacement)record(state,{type:'reveal',text:`市场补入 ${cardName(CARD_BY_ID[replacement])}`,cards:[replacement],level:CARD_BY_ID[replacement].level});}
function acquireNoble(state:SplendorState,nobleId:string){
  state.nobles.splice(state.nobles.indexOf(nobleId),1);state.players[state.turn].nobles.push(nobleId);
  record(state,{type:'noble',seat:state.turn,text:`贵族 ${nobleId} 来访，获得 3 分`,nobleId});
}
function finishTurn(state:SplendorState){
  const player=state.players[state.turn];state.turnsTaken[state.turn]++;
  if(!state.finalRound&&points(player)>=15){state.finalRound=true;record(state,{type:'lastRound',seat:state.turn,text:`达到 ${points(player)} 分，进入最后一轮；所有玩家行动次数相同后结算`});}
  const next=(state.turn+1)%state.players.length;
  if(state.finalRound&&next===state.firstSeat){
    state.phase='finished';
    const scores=state.players.map(points),cardCounts=state.players.map(p=>p.bought.length),best=Math.max(...scores),fewest=Math.min(...cardCounts.filter((_,i)=>scores[i]===best));
    const winners=state.players.filter((_,i)=>scores[i]===best&&cardCounts[i]===fewest).map(p=>p.seat);
    state.result={winners,scores,cardCounts};state.players.forEach((p,i)=>{p.totalPoints+=scores[i];if(winners.includes(i))p.wins++;});
    record(state,{type:'finish',text:`${winners.map(s=>state.players[s].name).join('、')}${winners.length>1?'共同获胜':'获胜'} · ${best} 分 · 已购 ${fewest} 张；先比声望，再比更少发展牌`});
  }else{state.turn=next;state.phase='action';}
}
function checkNobles(state:SplendorState){
  const eligible=eligibleNobles(state,state.turn);
  if(eligible.length>1){state.phase='noble';return;}
  if(eligible.length===1)acquireNoble(state,eligible[0]);finishTurn(state);
}
function endAction(state:SplendorState){if(tokenCount(state.players[state.turn].tokens)>10)state.phase='return';else checkNobles(state);}
export function applyAction(previous:SplendorState,seat:number,input:unknown):SplendorState {
  if(previous.phase==='finished'||seat!==previous.turn||!previous.players[seat])throw Error('当前没有这位玩家的决策');
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('行动格式无效');
  const action=input as Action,state=structuredClone(previous),player=state.players[seat];
  if(state.phase==='return'){
    if(action.type!=='return')throw Error('必须先归还超出 10 枚的 token');
    const tokens=tokenInput(action.tokens);
    if(tokenCount(tokens)!==tokenCount(player.tokens)-10||GEMS.some(c=>tokens[c]>player.tokens[c]))throw Error('必须准确归还超额 token，且不能超过持有量');
    for(const c of GEMS){player.tokens[c]-=tokens[c];state.bank[c]+=tokens[c];}
    record(state,{type:'return',seat,text:'归还 '+tokensText(tokens),tokens});checkNobles(state);
  }else if(state.phase==='noble'){
    if(action.type!=='noble'||!eligibleNobles(state,seat).includes(action.nobleId))throw Error('必须选择一位符合折扣要求的贵族');
    acquireNoble(state,action.nobleId);finishTurn(state);
  }else{
    switch(action.type){
      case 'take':{
        const available=COLORS.filter(c=>state.bank[c]>0),colors=action.colors;
        if(!Array.isArray(colors)||colors.length!==Math.min(3,available.length)||!colors.length||new Set(colors).size!==colors.length||colors.some(c=>!available.includes(c)))throw Error('需拿取 3 种不同宝石；仅在不足 3 色时拿取所有可用颜色，不能拿黄金');
        const tokens=emptyTokens();for(const c of colors){state.bank[c]--;player.tokens[c]++;tokens[c]++;}
        record(state,{type:'take',seat,text:'拿取 '+tokensText(tokens),tokens});break;
      }
      case 'pair':{
        if(!COLORS.includes(action.color)||state.bank[action.color]<4)throw Error('拿取同色 2 枚前，银行必须至少有该色 4 枚');
        state.bank[action.color]-=2;player.tokens[action.color]+=2;
        record(state,{type:'take',seat,text:`拿取 ${GEM_NAMES[action.color]}×2`,tokens:{[action.color]:2}});break;
      }
      case 'reserve':case 'reserveDeck':{
        if(player.reserved.length>=3)throw Error('最多同时预留 3 张卡，不能丢弃预留牌');
        let cardId:string,replacement:string|null=null;
        if(action.type==='reserve'){
          if(!marketIds(state).includes(action.cardId))throw Error('只能预留市场中的公开卡');
          cardId=action.cardId;replacement=removeMarket(state,cardId);
        }else{
          if(!LEVELS.includes(action.level)||!state.decks[action.level].length)throw Error('该层暗库已经用尽');
          cardId=state.decks[action.level].shift()!;
        }
        const card=CARD_BY_ID[cardId];player.reserved.push({cardId,level:card.level,source:action.type==='reserve'?'market':'deck',revealed:false});
        const gold=state.bank.gold>0?1:0;state.bank.gold-=gold;player.tokens.gold+=gold;
        record(state,{type:'reserve',seat,text:(action.type==='reserve'?`预留 ${cardName(card)}`:`暗抽 ${card.level} 级卡并预留`)+(gold?'，获得 1 黄金':'，黄金已空'),level:card.level,tokens:{gold},...(action.type==='reserve'?{cards:[cardId]}:{})});
        revealReplacement(state,replacement);break;
      }
      case 'buy':{
        const card=CARD_BY_ID[action.cardId],reserved=player.reserved.findIndex(r=>r.cardId===action.cardId);
        if(!card||(!marketIds(state).includes(action.cardId)&&reserved<0))throw Error('只能购买市场卡或自己的预留卡');
        const payment=action.payment===undefined?defaultPayment(player,card):tokenInput(action.payment);
        if(!payment)throw Error('折扣与 token 不足以购买该卡');
        const cost=effectiveCost(player,card);
        if(GEMS.some(c=>payment[c]>player.tokens[c])||COLORS.some(c=>payment[c]>cost[c])||payment.gold!==COLORS.reduce((n,c)=>n+cost[c]-payment[c],0))throw Error('支付必须准确覆盖折扣后的费用；黄金可替代任意颜色，不能超付');
        for(const c of GEMS){player.tokens[c]-=payment[c];state.bank[c]+=payment[c];}
        const replacement=reserved>=0?(player.reserved.splice(reserved,1),null):removeMarket(state,action.cardId);
        player.bought.push(card.id);record(state,{type:'buy',seat,text:`购买 ${cardName(card)}，支付 ${tokensText(payment)}`,cards:[card.id],tokens:payment});revealReplacement(state,replacement);break;
      }
      case 'pass':{
        if(!legalActions(state,seat).some(a=>a.action.type==='pass'))throw Error('仍有合法行动，不能跳过');
        player.reserved.forEach(r=>{r.revealed=true;});record(state,{type:'pass',seat,text:'无合法行动，公开预留牌并被迫跳过',cards:player.reserved.map(r=>r.cardId)});break;
      }
      default:throw Error('当前阶段不能执行此行动');
    }
    endAction(state);
  }
  state.revision++;assertSplendor(state);return state;
}

export function viewSplendor(state:SplendorState,viewer:number|null,revealHands=false):SplendorView {
  const player=viewer===null?null:state.players[viewer];
  return structuredClone({gameId:state.gameId,id:state.id,round:state.round,revision:state.revision,phase:state.phase,turn:state.turn,firstSeat:state.firstSeat,turnsTaken:state.turnsTaken,finalRound:state.finalRound,viewer,
    players:state.players.map(p=>({...p,bought:p.bought.map(id=>CARD_BY_ID[id]),reserved:p.reserved.map(r=>({level:r.level,source:r.source,card:p.seat===viewer||revealHands||r.revealed?CARD_BY_ID[r.cardId]:null})),nobles:p.nobles.map(id=>NOBLE_BY_ID[id]),bonuses:bonuses(p),points:points(p)})),
    bank:state.bank,deckCounts:Object.fromEntries(LEVELS.map(level=>[level,state.decks[level].length])) as Record<Level,number>,market:Object.fromEntries(LEVELS.map(level=>[level,state.market[level].map(id=>id?CARD_BY_ID[id]:null)])) as SplendorView['market'],
    nobles:state.nobles.map(id=>NOBLE_BY_ID[id]),events:state.events,result:state.result,legalActions:viewer===null?[]:legalActions(state,viewer),returnCount:player&&state.phase==='return'&&viewer===state.turn?tokenCount(player.tokens)-10:0,eligibleNobles:state.phase==='noble'&&viewer===state.turn?eligibleNobles(state,state.turn):[]});
}

// Domain invariants are shared by action transitions and browser-state restoration.
export function assertSplendor(state:SplendorState){
  const validInt=(n:unknown)=>Number.isSafeInteger(n)&&(n as number)>=0;
  if(state.gameId!=='splendor'||typeof state.id!=='string'||!state.id||!validInt(state.round)||state.round<1||!Number.isFinite(Date.parse(state.createdAt))||typeof state.finalRound!=='boolean'||!Array.isArray(state.players)||state.players.length<2||state.players.length>4||!['action','return','noble','finished'].includes(state.phase)||!validInt(state.revision)||state.revision<1)throw Error('璀璨宝石存档格式无效');
  if(!validInt(state.turn)||state.turn>=state.players.length||!validInt(state.firstSeat)||state.firstSeat>=state.players.length||!Array.isArray(state.turnsTaken)||state.turnsTaken.length!==state.players.length||!state.turnsTaken.every(validInt))throw Error('回合数据无效');
  if(!Array.isArray(state.events)||!state.events.length||!state.events.every((e,i)=>e.seq===i+1&&typeof e.text==='string'&&Number.isFinite(Date.parse(e.time))&&(e.seat===undefined||validInt(e.seat)&&e.seat<state.players.length)&&(!e.cards||Array.isArray(e.cards)&&e.cards.every(id=>!!CARD_BY_ID[id]))))throw Error('公开记录无效');
  if(state.phase!=='finished'){
    const count=state.players.length,completed=state.turnsTaken.reduce((n,t)=>n+t,0),rounds=Math.floor(completed/count),extra=completed%count;
    if(state.turn!==(state.firstSeat+extra)%count||state.turnsTaken.some((n,seat)=>n!==rounds+((seat-state.firstSeat+count)%count<extra?1:0)))throw Error('行动次数与当前回合不一致');
  }
  const perColor=state.players.length===2?4:state.players.length===3?5:7;
  if(!state.bank||!state.initialTokens||GEMS.some(c=>!validInt(state.bank[c])||state.initialTokens[c]!== (c==='gold'?5:perColor)))throw Error('银行配置无效');
  if(new Set(state.players.map(p=>p.playerId)).size!==state.players.length)throw Error('玩家身份重复');
  for(const [seat,p] of state.players.entries()){
    if(p.seat!==seat||typeof p.playerId!=='string'||!p.playerId||typeof p.name!=='string'||!['human','agent'].includes(p.kind)||!validInt(p.wins)||!validInt(p.totalPoints)||!p.tokens||GEMS.some(c=>!validInt(p.tokens[c]))||!Array.isArray(p.bought)||!Array.isArray(p.reserved)||p.reserved.length>3||!Array.isArray(p.nobles))throw Error('玩家资源无效');
    const count=tokenCount(p.tokens);if(count>10&&!(seat===state.turn&&state.phase==='return'&&count<=13))throw Error('玩家持有 token 超过上限');
    if(p.reserved.some(r=>!CARD_BY_ID[r.cardId]||CARD_BY_ID[r.cardId].level!==r.level||!['market','deck'].includes(r.source)||typeof r.revealed!=='boolean'))throw Error('预留卡格式无效');
  }
  for(const c of GEMS)if(state.bank[c]+state.players.reduce((n,p)=>n+p.tokens[c],0)!==state.initialTokens[c])throw Error(`${GEM_NAMES[c]}不守恒`);
  if(!state.decks||!state.market||LEVELS.some(level=>!Array.isArray(state.decks[level])||!Array.isArray(state.market[level])||state.market[level].length!==4||state.decks[level].length>0&&state.market[level].includes(null)||[...state.decks[level],...state.market[level].filter(Boolean)].some(id=>!id||CARD_BY_ID[id]?.level!==level)))throw Error('牌堆分层无效');
  const all=[...LEVELS.flatMap(level=>[...state.decks[level],...state.market[level].filter((id):id is string=>id!==null)]),...state.players.flatMap(p=>[...p.bought,...p.reserved.map(r=>r.cardId)])];
  if(all.length!==90||new Set(all).size!==90||all.some(id=>!CARD_BY_ID[id]))throw Error('90 张发展牌不守恒');
  if(!Array.isArray(state.nobles))throw Error('贵族数据无效');
  const nobles=[...state.nobles,...state.players.flatMap(p=>p.nobles)];if(nobles.length!==state.players.length+1||new Set(nobles).size!==nobles.length||nobles.some(id=>!NOBLE_BY_ID[id]))throw Error('贵族不守恒');
  if(state.phase==='return'&&tokenCount(state.players[state.turn].tokens)<=10||state.phase==='noble'&&eligibleNobles(state,state.turn).length<2)throw Error('待决策阶段无效');
  if(state.phase==='finished'){
    const scores=state.players.map(points),best=Math.max(...scores),fewest=Math.min(...state.players.filter(p=>points(p)===best).map(p=>p.bought.length));
    const winners=state.players.filter(p=>points(p)===best&&p.bought.length===fewest).map(p=>p.seat);
    if(!state.finalRound||best<15||!state.turnsTaken.every(n=>n===state.turnsTaken[0])||JSON.stringify(state.result?.winners)!==JSON.stringify(winners)||JSON.stringify(state.result?.scores)!==JSON.stringify(scores)||JSON.stringify(state.result?.cardCounts)!==JSON.stringify(state.players.map(p=>p.bought.length)))throw Error('结算数据无效');
  }else if(state.result!==null)throw Error('尚未结束的游戏不能有结算');
}
