import {COLORS,ROLES,cardName,district,makeDeck,roleName,type BuiltDistrict,type Color,type District} from './cards';

export interface PlayerInput {playerId:string;name:string;kind:'human'|'agent'}
export interface Player extends PlayerInput {seat:number;gold:number;hand:District[];city:BuiltDistrict[];roles:number[];revealed:number[];totalScore:number;wins:number}
export type Phase='draft'|'income'|'keep'|'main'|'graveyard'|'finished';
export interface Event {seq:number;round:number;time:string;text:string;seat?:number;role?:number;cards?:District[];kind?:'build'|'destroy';target?:number}
export interface Score {seat:number;districts:number;colors:number;completion:number;special:number;total:number;gold:number;hauntedColor:Color}
export interface Config {firstCrown:number}
export const DEFAULT_CONFIG:Config={firstCrown:1};
export interface CitadelsState {
  gameId:'citadels';id:string;round:number;gameNumber:number;revision:number;createdAt:string;phase:Phase;turn:number;
  players:Player[];deck:District[];rng:number;config:Config;crown:number;draftCrown:number;draftIndex:number;
  available:number[];faceUp:number[];faceDown:number[];called:number;assassinated:number|null;robbed:number|null;
  collected:boolean;powerUsed:boolean;taxUsed:boolean;built:number;labUsed:boolean;smithyUsed:boolean;
  pendingCards:District[];keepCount:number;graveyard:District|null;firstCompleted:number|null;
  bankFlow:number;events:Event[];scores:Score[]|null;winners:number[];endedAt?:string;
}
export type Action=
  |{type:'choose';role:number}|{type:'income';source:'gold'|'cards'}|{type:'keep';cards:string[]}
  |{type:'assassinate'|'steal';role:number}|{type:'tax'}|{type:'magic_swap';target:number}|{type:'magic_cycle';cards:string[]}
  |{type:'build'|'laboratory';card:string}|{type:'smithy'}|{type:'destroy';target:number;card:string}
  |{type:'recover';take:boolean}|{type:'end'};
export interface LegalAction {id:string;label:string;action:Action;group:string}
function requireRule(valid:unknown,text:string):asserts valid {if(!valid)throw new Error(text);}
export function validateConfig(c:Config){if(!c||!Number.isInteger(c.firstCrown)||c.firstCrown<1||c.firstCrown>7)throw new Error('初始王冠座位须为 1–7');}
function random(s:CitadelsState){let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
function shuffle<T>(s:CitadelsState,items:T[]){for(let i=items.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
function event(s:CitadelsState,text:string,seat?:number,role?:number,cards?:District[]){s.events.push({seq:s.events.length+1,round:s.round,time:new Date().toISOString(),text,...(seat!==undefined?{seat}:{}),...(role?{role}:{}),...(cards?.length?{cards:cards.map(c=>({id:c.id,key:c.key}))}:{})});}
function rolePlayer(s:CitadelsState,seat=s.turn,role=s.called){return `${s.players[seat].name}（${roleName(role)}）`;}
function has(p:Player,key:string){return p.city.some(c=>c.key===key);}
function gain(s:CitadelsState,seat:number,amount:number){s.players[seat].gold+=amount;s.bankFlow+=amount;}
function pay(s:CitadelsState,seat:number,amount:number){requireRule(s.players[seat].gold>=amount,`金币不足：需要 ${amount}，当前持有 ${s.players[seat].gold}`);s.players[seat].gold-=amount;s.bankFlow-=amount;}
function draw(s:CitadelsState,n:number){return s.deck.splice(0,n);}
function owner(s:CitadelsState,rank:number){return s.players.find(p=>p.roles.includes(rank));}
function draftCount(s:CitadelsState){return s.players.length===3?6:s.players.length;}
function startRound(s:CitadelsState){
  s.phase='draft';s.draftIndex=0;s.draftCrown=s.crown;s.turn=s.crown;s.called=0;s.assassinated=null;s.robbed=null;
  s.players.forEach(p=>{p.roles=[];p.revealed=[];});
  const roles=shuffle(s,ROLES.map(r=>r.rank));s.faceDown=[roles.shift()!];s.faceUp=[];
  const n=s.players.length===4?2:s.players.length===5?1:0;
  for(let i=0;i<n;i++){const index=roles.findIndex(r=>r!==4);s.faceUp.push(...roles.splice(index,1));}
  s.available=roles;
  event(s,`第 ${s.round} 轮选角：暗弃一张${n?`，明弃 ${s.faceUp.map(roleName).join('、')}`:''}；王冠持有人${s.players[s.crown].name}率先秘密选角。`);
}
export function createCitadels(id:string,players:PlayerInput[],config=DEFAULT_CONFIG,randomSource:()=>number=Math.random,gameNumber=1):CitadelsState {
  validateConfig(config);requireRule(players.length>=3&&players.length<=7,'本桌支持经典基础版 3–7 人');
  requireRule(config.firstCrown<=players.length,'初始王冠座位超出本桌人数');
  requireRule(new Set(players.map(p=>p.playerId)).size===players.length&&players.every(p=>p.playerId&&p.name),'玩家身份重复或缺失');
  requireRule(players.filter(p=>p.kind==='human').length<=1,'同一桌最多一位真人');
  const s:CitadelsState={gameId:'citadels',id,gameNumber,round:1,revision:1,createdAt:new Date().toISOString(),phase:'draft',turn:config.firstCrown-1,
    players:players.map((p,seat)=>({...p,seat,gold:2,hand:[],city:[],roles:[],revealed:[],totalScore:0,wins:0})),
    deck:makeDeck(),rng:Math.floor(randomSource()*4294967296)||0x91e10da5,config:{...config},crown:config.firstCrown-1,draftCrown:config.firstCrown-1,draftIndex:0,
    available:[],faceUp:[],faceDown:[],called:0,assassinated:null,robbed:null,collected:false,powerUsed:false,taxUsed:false,built:0,labUsed:false,smithyUsed:false,
    pendingCards:[],keepCount:0,graveyard:null,firstCompleted:null,bankFlow:players.length*2,events:[],scores:null,winners:[]};
  shuffle(s,s.deck);s.players.forEach(p=>p.hand=draw(s,4));event(s,'每人领取四张建筑牌与两枚金币；使用 FFG 经典八身份、66 张基础建筑、八建筑终局。');startRound(s);assertCitadels(s);return s;
}
export function nextCitadels(previous:CitadelsState,id:string,players:PlayerInput[],randomSource:()=>number){
  requireRule(previous.phase==='finished','本局尚未结束');
  const nextCrown=(previous.crown+1)%previous.players.length,stable=previous.players[nextCrown].playerId;
  const found=players.findIndex(p=>p.playerId===stable),s=createCitadels(id,players,{firstCrown:found<0?1:found+1},randomSource,previous.gameNumber+1);
  s.players.forEach(p=>{const old=previous.players.find(o=>o.playerId===p.playerId);p.totalScore=old?.totalScore??0;p.wins=old?.wins??0;});return s;
}
function afterIncome(s:CitadelsState){
  s.phase='main';s.collected=true;
  if(s.called===6){gain(s,s.turn,1);event(s,`${rolePlayer(s)}在正常收入后额外获得 1 金币。`,s.turn,6);}
  if(s.called===7){const cards=draw(s,2);s.players[s.turn].hand.push(...cards);event(s,`${rolePlayer(s)}在正常收入后额外抽取 ${cards.length} 张建筑牌，全部收入手牌（牌面保密）。`,s.turn,7);}
}
function endRound(s:CitadelsState){
  if(s.assassinated){const killed=owner(s,s.assassinated);if(killed){killed.revealed.push(s.assassinated);event(s,`轮末公开：${killed.name}本轮持有${roleName(s.assassinated)}，该身份因被刺杀跳过整个回合。`,killed.seat,s.assassinated);if(s.assassinated===4){s.crown=killed.seat;event(s,`${rolePlayer(s,killed.seat,4)}虽被刺杀，仍在轮末继承王冠，下轮率先选角。`,killed.seat,4);}}}
  if(s.firstCompleted!==null){
    s.phase='finished';s.scores=scoreCitadels(s);const order=[...s.scores].sort((a,b)=>b.total-a.total||b.districts-a.districts||b.gold-a.gold),best=order[0];
    s.winners=order.filter(a=>a.total===best.total&&a.districts===best.districts&&a.gold===best.gold).map(a=>a.seat);
    s.players.forEach(p=>{p.totalScore+=s.scores![p.seat].total;if(s.winners.includes(p.seat))p.wins++;});
    s.endedAt=new Date().toISOString();event(s,`本局结束：${s.winners.map(i=>s.players[i].name).join('、')}获胜${s.winners.length>1?'（平分胜利）':''}。`);return;
  }
  s.round++;startRound(s);
}
function callNext(s:CitadelsState){
  for(let rank=s.called+1;rank<=8;rank++){
    s.called=rank;const p=owner(s,rank);
    if(rank===s.assassinated){event(s,`叫号 ${rank} · ${roleName(rank)}：被刺杀，跳过；持有人轮末公开。`,undefined,rank);continue;}
    if(!p){event(s,`叫号 ${rank} · ${roleName(rank)}：无人应答。`,undefined,rank);continue;}
    s.turn=p.seat;p.revealed.push(rank);s.phase='income';s.collected=false;s.powerUsed=false;s.taxUsed=false;s.built=0;s.labUsed=false;s.smithyUsed=false;
    event(s,`叫号 ${rank} · ${roleName(rank)}：${p.name}应答，公开该身份并开始回合。`,p.seat,rank);
    if(rank===s.robbed){const thief=owner(s,2);if(thief){const amount=p.gold;p.gold=0;thief.gold+=amount;event(s,`${rolePlayer(s,thief.seat,2)}在${rolePlayer(s,p.seat,rank)}正常收入前，拿走其全部 ${amount} 金币。`,p.seat,rank);}}
    if(rank===4){s.crown=p.seat;event(s,`${rolePlayer(s,p.seat,4)}获得王冠，下轮率先选角。`,p.seat,4);}return;
  }
  endRound(s);
}
function taxAmount(s:CitadelsState){const color=({4:'yellow',5:'blue',6:'green',8:'red'} as Record<number,Color>)[s.called];return color?s.players[s.turn].city.filter(c=>district(c).color===color||c.key==='school-of-magic').length:0;}
function destroyCost(s:CitadelsState,target:number,card:BuiltDistrict){return district(card).cost-1+(card.key!=='great-wall'&&has(s.players[target],'great-wall')?1:0);}
function destroyable(s:CitadelsState,target:number,card:BuiltDistrict){const p=s.players[target];return p.city.length<8&&card.key!=='keep'&&!(p.roles.includes(5)&&s.assassinated!==5)&&destroyCost(s,target,card)<=s.players[s.turn].gold;}
function validateCards(ids:string[],cards:District[]){requireRule(Array.isArray(ids)&&ids.every(id=>typeof id==='string')&&new Set(ids).size===ids.length&&ids.every(id=>cards.some(c=>c.id===id)),'选牌必须是自己拥有且不重复的牌');}

export function applyCitadels(s:CitadelsState,seat:number,action:Action):CitadelsState {
  requireRule(s.phase!=='finished'&&seat===s.turn,'当前不是你的决策');requireRule(action&&typeof action.type==='string','行动格式无效');
  const n=structuredClone(s),p=n.players[seat],a=action;
  if(n.phase==='draft'){
    requireRule(a.type==='choose','当前须秘密选角');requireRule(n.available.includes(a.role),'该身份不在你收到的候选牌中');
    p.roles.push(a.role);n.available=n.available.filter(r=>r!==a.role);
    event(n,`${p.name}完成第 ${p.roles.length} 次秘密选角，所选身份保密。`,seat);
    n.draftIndex++;
    if(n.draftIndex===draftCount(n)){n.faceDown.push(...n.available);n.available=[];n.called=0;callNext(n);}
    else {n.turn=(n.draftCrown+n.draftIndex)%n.players.length;if(n.players.length===7&&n.draftIndex===6)n.available.push(n.faceDown.shift()!);}
  }else if(n.phase==='graveyard'){
    requireRule(a.type==='recover'&&typeof a.take==='boolean'&&n.graveyard,'当前须决定是否用墓地收回被拆建筑');
    if(a.take){pay(n,seat,1);p.hand.push(n.graveyard);event(n,`${p.name}使用墓地支付 1 金币，将被拆除的${cardName(n.graveyard)}收入手牌。`,seat,undefined,[n.graveyard]);}
    else {n.deck.push(n.graveyard);event(n,`${p.name}放弃使用墓地收回${cardName(n.graveyard)}，该建筑放回牌库底。`,seat);}
    n.graveyard=null;callNext(n);
  }else if(n.phase==='keep'){
    requireRule(a.type==='keep','先选择保留的收入牌');validateCards(a.cards,n.pendingCards);requireRule(a.cards.length===n.keepCount,`须保留 ${n.keepCount} 张牌`);
    p.hand.push(...n.pendingCards.filter(c=>a.cards.includes(c.id)));n.deck.push(...n.pendingCards.filter(c=>!a.cards.includes(c.id)));
    event(n,`${rolePlayer(n)}完成正常收入选牌：保留 ${a.cards.length} 张建筑牌，其余 ${n.pendingCards.length-a.cards.length} 张放回牌库底（牌面保密）。`,seat);n.pendingCards=[];n.keepCount=0;afterIncome(n);
  }else {
    requireRule(n.phase==='income'||n.phase==='main','当前阶段不能行动');
    switch(a.type){
      case 'income':{
        requireRule(!n.collected&&n.phase==='income'&&(a.source==='gold'||a.source==='cards'),'正常收入每个身份回合一次');
        if(a.source==='gold'){gain(n,seat,2);event(n,`${rolePlayer(n)}正常收入：领取 2 金币。`,seat);afterIncome(n);}
        else {n.pendingCards=draw(n,has(p,'observatory')?3:2);n.keepCount=Math.min(n.pendingCards.length,has(p,'library')?2:1);event(n,`${rolePlayer(n)}正常收入：抽取 ${n.pendingCards.length} 张建筑牌，${n.keepCount===n.pendingCards.length?'全部收入手牌':`须选择保留 ${n.keepCount} 张，其余放回牌库底`}（牌面保密）。`,seat);
          if(n.keepCount===n.pendingCards.length){p.hand.push(...n.pendingCards);n.pendingCards=[];n.keepCount=0;afterIncome(n);}else n.phase='keep';}
        break;
      }
      case 'assassinate':case 'steal':{
        requireRule(!n.powerUsed&&n.called===(a.type==='assassinate'?1:2),'当前身份不能使用该技能或已使用');
        requireRule(Number.isInteger(a.role)&&a.role>=(a.type==='assassinate'?2:3)&&a.role<=8,'不能选择该目标身份');
        requireRule(a.type==='assassinate'||a.role!==n.assassinated,'不能偷窃被刺杀的身份');n.powerUsed=true;
        if(a.type==='assassinate')n.assassinated=a.role;else n.robbed=a.role;
        event(n,`${rolePlayer(n)}指定本轮${roleName(a.role)}为${a.type==='assassinate'?'刺杀':'偷窃'}目标，${a.type==='assassinate'?'该身份将跳过整个回合，持有人轮末公开':'待该身份应答时拿走其全部金币'}。`,seat,a.role);break;
      }
      case 'tax':requireRule([4,5,6,8].includes(n.called)&&!n.taxUsed,'当前不能再次领取身份税收');{const gold=taxAmount(n);gain(n,seat,gold);n.taxUsed=true;event(n,`${rolePlayer(n)}领取建筑税收 ${gold} 金币。`,seat,n.called);}break;
      case 'magic_swap':{
        requireRule(n.called===3&&!n.powerUsed,'魔术师技能当前不可用');requireRule(Number.isInteger(a.target)&&a.target>=0&&a.target<n.players.length&&a.target!==seat,'换牌目标须为另一玩家');
        const other=n.players[a.target];[p.hand,other.hand]=[other.hand,p.hand];n.powerUsed=true;event(n,`${rolePlayer(n)}与${other.name}交换全部手牌：${p.name}收到 ${p.hand.length} 张，${other.name}收到 ${other.hand.length} 张（牌面保密）。`,seat,3);break;
      }
      case 'magic_cycle':{
        requireRule(n.called===3&&!n.powerUsed,'魔术师技能当前不可用');validateCards(a.cards,p.hand);
        const discarded=p.hand.filter(c=>a.cards.includes(c.id));p.hand=p.hand.filter(c=>!a.cards.includes(c.id));n.deck.push(...discarded);p.hand.push(...draw(n,discarded.length));
        n.powerUsed=true;event(n,`${rolePlayer(n)}将 ${discarded.length} 张手牌放回牌库底，重新抽取 ${discarded.length} 张建筑牌（牌面保密）。`,seat,3);break;
      }
      case 'build':{
        requireRule(n.collected,'须先完成正常收入');requireRule(n.built<(n.called===7?3:1),'已用完本身份的建造次数');
        const card=p.hand.find(c=>c.id===a.card);requireRule(card,'这张牌不在手中');requireRule(!p.city.some(c=>c.key===card.key),'城市内不能建造同名建筑');
        pay(n,seat,district(card).cost);p.hand=p.hand.filter(c=>c.id!==card.id);p.city.push({...card,builtRound:n.round});n.built++;
        event(n,`${rolePlayer(n)}支付 ${district(card).cost} 金币建造${cardName(card)}，自己的城区现有 ${p.city.length} 座建筑。`,seat,n.called,[card]);
        n.events.at(-1)!.kind='build';n.events.at(-1)!.target=seat;
        if(p.city.length>=8&&n.firstCompleted===null){n.firstCompleted=seat;event(n,`${rolePlayer(n)}率先完成八座建筑，触发终局；本轮所有身份回合结束后结算。`,seat);}break;
      }
      case 'laboratory':{
        requireRule(has(p,'laboratory')&&!n.labUsed,'实验室当前不可用');const card=p.hand.find(c=>c.id===a.card);requireRule(card,'须选择自己的手牌');
        p.hand=p.hand.filter(c=>c.id!==card.id);n.deck.push(card);gain(n,seat,1);n.labUsed=true;event(n,`${rolePlayer(n)}使用实验室，将 1 张手牌放回牌库底，获得 1 金币（牌面保密）。`,seat);break;
      }
      case 'smithy':requireRule(has(p,'smithy')&&!n.smithyUsed,'铁匠铺当前不可用');pay(n,seat,2);{const cards=draw(n,3);p.hand.push(...cards);n.smithyUsed=true;event(n,`${rolePlayer(n)}使用铁匠铺，支付 2 金币，抽取 ${cards.length} 张建筑牌并全部收入手牌（牌面保密）。`,seat);}break;
      case 'destroy':{
        requireRule(n.called===8&&n.collected,'军阀拆除在正常收入后的回合末进行');requireRule(Number.isInteger(a.target)&&a.target>=0&&a.target<n.players.length,'目标玩家无效');
        const target=n.players[a.target],card=target.city.find(c=>c.id===a.card);requireRule(card,'目标建筑不在该玩家的城市中');
        requireRule(target.city.length<8,'不能拆除已有至少八座建筑的完工城市');
        requireRule(card.key!=='keep','堡垒不能被军阀拆除');
        requireRule(!(target.roles.includes(5)&&n.assassinated!==5),'该城市受未被刺杀的主教保护，不能拆除');
        const cost=destroyCost(n,a.target,card);pay(n,seat,cost);target.city=target.city.filter(c=>c.id!==card.id);
        const removed={id:card.id,key:card.key};event(n,`${rolePlayer(n)}支付 ${cost} 金币，拆除${target.name}城区中的${cardName(card)}并结束本身份回合；${target.name}的城区剩余 ${target.city.length} 座建筑。`,seat,8,[removed]);
        n.events.at(-1)!.kind='destroy';n.events.at(-1)!.target=a.target;
        const keeper=n.players.find(q=>q.seat!==seat&&has(q,'graveyard')&&q.gold>=1);
        if(keeper){n.graveyard=removed;n.phase='graveyard';n.turn=keeper.seat;event(n,`${keeper.name}可以使用墓地支付 1 金币，将刚被拆除的${cardName(removed)}收入手牌。`,keeper.seat);}else {n.deck.push(removed);callNext(n);}break;
      }
      case 'end':requireRule(n.collected,'须先完成正常收入');event(n,`${rolePlayer(n)}结束本身份回合。`,seat,n.called);callNext(n);break;
      default:throw new Error('当前阶段没有此行动');
    }
  }
  n.revision++;assertCitadels(n);return n;
}
function combinations<T>(items:T[],n:number):T[][] {if(n===0)return [[]];return items.flatMap((a,i)=>combinations(items.slice(i+1),n-1).map(rest=>[a,...rest]));}
export function legalCitadels(s:CitadelsState,seat:number):LegalAction[]{
  if(s.phase==='finished'||seat!==s.turn)return [];
  const result:LegalAction[]=[],p=s.players[seat];const add=(id:string,label:string,action:Action,group:string)=>result.push({id,label,action,group});
  if(s.phase==='draft'){
    s.available.slice().sort((a,b)=>a-b).forEach(role=>add(`choose:${role}`,`选择 ${role} · ${roleName(role)}`,{type:'choose',role},'选角'));return result;
  }
  if(s.phase==='graveyard'){add('recover','付 1 金币收回建筑',{type:'recover',take:true},'墓地');add('decline','放弃收回',{type:'recover',take:false},'墓地');return result;}
  if(s.phase==='keep'){combinations(s.pendingCards,s.keepCount).forEach(cards=>add(`keep:${cards.map(c=>c.id).join(',')}`,`保留 ${cards.map(cardName).join('、')}`,{type:'keep',cards:cards.map(c=>c.id)},'选牌'));return result;}
  if(!s.collected){add('income:gold','领取 2 金币',{type:'income',source:'gold'},'收入');add('income:cards',`抽${has(p,'observatory')?3:2}留${has(p,'library')?2:1}`,{type:'income',source:'cards'},'收入');}
  if(!s.powerUsed&&(s.called===1||s.called===2))for(let role=s.called===1?2:3;role<=8;role++)if(s.called===1||role!==s.assassinated)add(`${s.called===1?'kill':'steal'}:${role}`,`${s.called===1?'刺杀':'偷窃'} ${roleName(role)}`,{type:s.called===1?'assassinate':'steal',role},'身份技能');
  if([4,5,6,8].includes(s.called)&&!s.taxUsed)add('tax',`领取身份税收 · ${taxAmount(s)} 金币`,{type:'tax'},'身份技能');
  if(s.called===3&&!s.powerUsed){s.players.filter(q=>q.seat!==seat).forEach(q=>add(`swap:${q.seat}`,`与 ${q.name} 交换全部手牌（${q.hand.length} 张）`,{type:'magic_swap',target:q.seat},'身份技能'));add('magic-cycle','选择手牌置底重抽（可多选）',{type:'magic_cycle',cards:[]},'换牌');}
  if(has(p,'laboratory')&&!s.labUsed)p.hand.forEach(c=>add(`lab:${c.id}`,`实验室：弃${cardName(c)}换 1 金币`,{type:'laboratory',card:c.id},'建筑技能'));
  if(has(p,'smithy')&&!s.smithyUsed&&p.gold>=2)add('smithy','铁匠铺：付 2 金币抽三张',{type:'smithy'},'建筑技能');
  if(s.collected){
    if(s.built<(s.called===7?3:1))p.hand.filter(c=>district(c).cost<=p.gold&&!p.city.some(q=>q.key===c.key)).forEach(c=>add(`build:${c.id}`,`建造${cardName(c)} · ${district(c).cost} 金币`,{type:'build',card:c.id},'建造'));
    if(s.called===8)s.players.forEach(q=>q.city.filter(c=>destroyable(s,q.seat,c)).forEach(c=>add(`destroy:${q.seat}:${c.id}`,`拆 ${q.name} · ${cardName(c)}（${destroyCost(s,q.seat,c)} 金币，结束回合）`,{type:'destroy',target:q.seat,card:c.id},'军阀拆除')));
    add('end','结束身份回合',{type:'end'},'结束');
  }return result;
}
export function scoreCitadels(s:Pick<CitadelsState,'round'|'firstCompleted'>&{players:readonly Pick<Player,'seat'|'gold'|'city'>[]}):Score[]{return s.players.map(p=>{
  const districts=p.city.reduce((sum,c)=>sum+district(c).cost,0),special=p.city.filter(c=>['university','dragon-gate'].includes(c.key)).length*2;
  const haunted=p.city.find(c=>c.key==='haunted-city'),normal=p.city.filter(c=>c!==haunted).map(c=>district(c).color);
  const options:Color[]=haunted&&haunted.builtRound<s.round?['purple','yellow','blue','green','red']:['purple'];
  const hauntedColor=options.find(c=>new Set([...normal,...(haunted?[c]:[])]).size===5)??'purple';
  const colors=new Set([...normal,...(haunted?[hauntedColor]:[])]).size===5?3:0,completion=p.city.length>=8?(s.firstCompleted===p.seat?4:2):0;
  return {seat:p.seat,districts,colors,completion,special,total:districts+colors+completion+special,gold:p.gold,hauntedColor};
});}
export function assertCitadels(s:CitadelsState){
  const cards=[...s.deck,...s.players.flatMap(p=>[...p.hand,...p.city]),...s.pendingCards,...(s.graveyard?[s.graveyard]:[])],original=makeDeck();
  requireRule(cards.length===original.length&&new Set(cards.map(c=>c.id)).size===original.length&&cards.every(c=>original.some(o=>o.id===c.id&&o.key===c.key)),'建筑牌数量、身份或唯一性不守恒');
  requireRule(s.players.every((p,i)=>p.seat===i&&Number.isInteger(p.gold)&&p.gold>=0&&new Set(p.city.map(c=>c.key)).size===p.city.length),'金币或城市建筑无效');
  requireRule(s.players.reduce((sum,p)=>sum+p.gold,0)===s.bankFlow,'金币收支不守恒');
  const roles=[...s.available,...s.faceUp,...s.faceDown,...s.players.flatMap(p=>p.roles)];
  requireRule(roles.length===8&&new Set(roles).size===8&&roles.every(r=>Number.isInteger(r)&&r>=1&&r<=8),'身份牌不守恒');
}
export function viewCitadels(s:CitadelsState,viewer:number|null,revealHands=false,includeActions=true){
  return {gameId:s.gameId,id:s.id,round:s.round,gameNumber:s.gameNumber,revision:s.revision,phase:s.phase,turn:s.turn,viewer,crown:s.crown,draftCrown:s.draftCrown,
    called:s.called,assassinated:s.assassinated,robbed:s.robbed,firstCompleted:s.firstCompleted,faceUp:[...s.faceUp],faceDownCount:s.faceDown.length,
    available:s.phase==='draft'&&(viewer===s.turn||revealHands)?[...s.available].sort((a,b)=>a-b):[],
    draftIndex:s.draftIndex,draftTotal:draftCount(s),deckCount:s.deck.length,collected:s.collected,built:s.built,buildLimit:s.called===7?3:1,
    powerUsed:s.powerUsed,taxUsed:s.taxUsed,labUsed:s.labUsed,smithyUsed:s.smithyUsed,
    pendingCards:s.phase==='keep'&&(viewer===s.turn||revealHands)?s.pendingCards.map(c=>({...c})):[],keepCount:s.keepCount,graveyard:s.graveyard?{...s.graveyard}:null,
    players:s.players.map(p=>({playerId:p.playerId,name:p.name,kind:p.kind,seat:p.seat,gold:p.gold,city:p.city.map(c=>({...c})),handCount:p.hand.length,
      hand:viewer===p.seat||revealHands?p.hand.map(c=>({...c})):undefined,roles:viewer===p.seat||revealHands?[...p.roles]:[...p.revealed],roleCount:p.roles.length,revealed:[...p.revealed],totalScore:p.totalScore,wins:p.wins})),
    legalActions:viewer===null||!includeActions?[]:legalCitadels(s,viewer),events:s.events.map(e=>({...e,cards:e.cards?.map(c=>({...c}))})),scores:s.scores,winners:[...s.winners]};
}
export type CitadelsView=ReturnType<typeof viewCitadels>;
