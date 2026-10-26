import {describe,expect,it} from 'vitest';
import type {StoredRun} from '../../runtime/types';
import {CARDS,CARD_BY_ID,NOBLES} from './data';
import {splendorModule} from './definition';
import {applyAction,assertSplendor,bonuses,cardName,createSplendor,defaultPayment,eligibleNobles,emptyTokens,legalActions,nextSplendor,points,tokenCount,viewSplendor} from './engine';
import {COLORS,GEMS,LEVELS,type Action,type Card,type Color,type Level,type SplendorState,type SplendorView,type Tokens} from './types';

const rng=(seed=1)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const identities=(n=2)=>Array.from({length:n},(_,i)=>({playerId:'p'+i,name:'玩家'+i,kind:i===0?'human' as const:'agent' as const}));
const game=(n=2,firstSeat=0)=>createSplendor('game',identities(n),{random:rng(24),firstSeat});
function takeOut(s:SplendorState,id:string){
  const level=CARD_BY_ID[id].level,deck=s.decks[level].indexOf(id);if(deck>=0){s.decks[level].splice(deck,1);return;}
  const market=s.market[level].indexOf(id);if(market>=0){s.market[level][market]=s.decks[level].shift()??null;return;}
  throw Error('Fixture card already owned: '+id);
}
function buyFixture(s:SplendorState,seat:number,ids:string[]){for(const id of ids){takeOut(s,id);s.players[seat].bought.push(id);}}
function giveBonuses(s:SplendorState,seat:number,amounts:Partial<Record<Color,number>>){for(const c of COLORS)buyFixture(s,seat,CARDS.filter(card=>card.bonus===c&&card.points===0).slice(0,amounts[c]??0).map(card=>card.id));}
function giveTokens(s:SplendorState,seat:number,tokens:Partial<Tokens>){for(const c of GEMS){const n=tokens[c]??0;if(n>s.bank[c])throw Error('Fixture bank insufficient');s.bank[c]-=n;s.players[seat].tokens[c]+=n;}}
function marketCard(s:SplendorState,id:string,index=0){
  const level=CARD_BY_ID[id].level;if(s.market[level][index]===id)return;
  takeOut(s,id);const previous=s.market[level][index];if(previous)s.decks[level].push(previous);s.market[level][index]=id;
}
const primary=(s:SplendorState)=>legalActions(s,s.turn).find(a=>a.action.type==='take')!.action;
function finishFixture(tie=false){
  let s=game();buyFixture(s,0,['3-white-04','3-blue-02','3-green-02','3-red-01']);
  if(tie)buyFixture(s,1,['3-blue-04','3-green-03','3-red-02','3-black-01']);
  s=applyAction(s,0,primary(s));s=applyAction(s,1,primary(s));return s;
}
const runFor=(state:SplendorState):StoredRun<SplendorState>=>({moduleId:'splendor',moduleVersion:'1.0.0',stateVersion:1,roomId:'room',runId:'game',index:1,config:{edition:'base-2024'},roster:identities(state.players.length).map(p=>({...p,kind:p.kind==='human'?'human':'codex'})),state});

describe('璀璨宝石固定基础牌组与开局',()=>{
  it('完整固定的 40/30/20 张卡，每色的声望分布与真实单色成本',()=>{
    expect(new Set(CARDS.map(c=>c.id)).size).toBe(90);
    for(const [level,count] of [[1,40],[2,30],[3,20]])expect(CARDS.filter(c=>c.level===level)).toHaveLength(count);
    for(const c of COLORS){expect(CARDS.filter(x=>x.level===1&&x.bonus===c).map(x=>x.points).sort()).toEqual([0,0,0,0,0,0,0,1]);expect(CARDS.filter(x=>x.level===2&&x.bonus===c).map(x=>x.points).sort()).toEqual([1,1,2,2,2,3]);expect(CARDS.filter(x=>x.level===3&&x.bonus===c).map(x=>x.points).sort()).toEqual([3,4,4,5]);}
    expect(CARD_BY_ID['1-green-07'].cost.black).toBe(4);expect(CARD_BY_ID['2-red-06'].cost.red).toBe(6);expect(CARD_BY_ID['3-white-04'].cost).toEqual({white:3,blue:0,green:0,red:0,black:7});
  });
  it('贵族有五种双 4、五种三色 3，不使用相似版本的替代贵族',()=>{
    expect(NOBLES).toHaveLength(10);expect(new Set(NOBLES.map(n=>JSON.stringify(n.cost))).size).toBe(10);
    expect(NOBLES.filter(n=>Object.values(n.cost).filter(Boolean).join(',')==='4,4')).toHaveLength(5);
    expect(NOBLES.find(n=>n.id==='N08')?.cost).toEqual({white:0,blue:0,green:0,red:4,black:4});
  });
  it.each([[2,4],[3,5],[4,7]])('%i 人按每色 %i 枚配置，黄金不减、贵族为人数加一', (n,count)=>{
    const s=game(n);expect(COLORS.map(c=>s.bank[c])).toEqual(Array(5).fill(count));expect(s.bank.gold).toBe(5);expect(s.nobles).toHaveLength(n+1);for(const level of LEVELS){expect(s.market[level]).toHaveLength(4);expect(s.decks[level]).toHaveLength((level===1?40:level===2?30:20)-4);}expect(()=>assertSplendor(s)).not.toThrow();
  });
  it('拒绝错误人数、重复身份和无效先手',()=>{expect(()=>game(1)).toThrow();expect(()=>game(5)).toThrow();expect(()=>createSplendor('x',[identities()[0],identities()[0]],{random:rng()})).toThrow();expect(()=>game(2,2)).toThrow();});
});
describe('拿取、支付与资源守恒',()=>{
  it('非法自主行动不扣宝石、不补市场、不泄露或移动暗库牌，也不推进贵族与回合',()=>{
    const s=game();marketCard(s,'1-white-01');giveTokens(s,0,{red:2,black:1,gold:1});
    const reserved=applyAction(game(),0,{type:'reserveDeck',level:3}),secret=reserved.players[0].reserved[0].cardId;
    const cases:Array<[SplendorState,number,unknown]>=[
      [s,1,{type:'take',colors:['blue','green','black']}],[s,0,{type:'take',colors:['blue','blue','green']}],
      [s,0,{type:'pair',color:'red'}],[s,0,{type:'reserve',cardId:s.decks[1][0]}],
      [s,0,{type:'reserveDeck',level:4}],[s,0,{type:'buy',cardId:s.decks[1][0]}],
      [reserved,1,{type:'buy',cardId:secret}],[s,0,{type:'buy',cardId:'1-white-01',payment:{red:2,black:1,gold:1}}],
      [s,0,{type:'return',tokens:{red:1}}],[s,0,{type:'noble',nobleId:s.nobles[0]}],[s,0,{type:'pass'}],
    ];
    for(const [state,seat,action] of cases){const before=structuredClone(state);expect(()=>applyAction(state,seat,action)).toThrow();expect(state).toEqual(before);assertSplendor(state);}
    expect(viewSplendor(reserved,1).players[0].reserved[0].card).toBeNull();
  });
  it('必须拿三种不同颜色，不能重复、少拿或拿黄金',()=>{
    const s=game();for(const colors of [['white'],['white','white','blue'],['white','blue','gold'],['white','blue','purple']])expect(()=>applyAction(s,0,{type:'take',colors})).toThrow();
    const next=applyAction(s,0,{type:'take',colors:['white','blue','red']});expect(next.players[0].tokens).toEqual({white:1,blue:1,green:0,red:1,black:0,gold:0});expect(next.turn).toBe(1);expect(s.bank.white).toBe(4);
  });
  it('拿同色两枚严格检查拿取前至少四枚',()=>{
    let s=applyAction(game(),0,{type:'pair',color:'green'});expect(s.bank.green).toBe(2);expect(()=>applyAction(s,1,{type:'pair',color:'green'})).toThrow();expect(()=>applyAction(s,1,{type:'pair',color:'gold'})).toThrow();
    s=game(3);giveTokens(s,1,{green:2});expect(s.bank.green).toBe(3);expect(()=>applyAction(s,0,{type:'pair',color:'green'})).toThrow();
  });
  it('银行不足三色时，必须尽取可用的两色或一色',()=>{
    const s=game();giveTokens(s,0,{white:4,blue:4});giveTokens(s,1,{green:4});expect(()=>applyAction(s,0,{type:'take',colors:['red']})).toThrow();const next=applyAction(s,0,{type:'take',colors:['red','black']});expect(tokenCount(next.players[0].tokens)).toBe(10);
    const one=game();giveTokens(one,0,{white:4,blue:4});giveTokens(one,1,{green:4,red:4});expect(applyAction(one,0,{type:'take',colors:['black']}).players[0].tokens.black).toBe(1);
  });
  it('购买扣除永久折扣，支付入银行并立即同层补牌',()=>{
    const s=game();marketCard(s,'1-white-01');giveBonuses(s,0,{red:1});giveTokens(s,0,{red:1,black:1});const before=s.decks[1].length;
    const next=applyAction(s,0,{type:'buy',cardId:'1-white-01'});expect(next.players[0].bought).toContain('1-white-01');expect(bonuses(next.players[0]).red).toBe(1);expect(bonuses(next.players[0]).white).toBe(1);expect(next.players[0].tokens.red).toBe(0);expect(next.bank.red).toBe(4);expect(next.market[1].filter(Boolean)).toHaveLength(4);expect(next.decks[1]).toHaveLength(before-1);
  });
  it('黄金可替代已持有的颜色，且保留未支付的彩色 token',()=>{
    const s=game();marketCard(s,'1-white-01');giveTokens(s,0,{red:2,black:1,gold:2});
    expect(defaultPayment(s.players[0],CARD_BY_ID['1-white-01'])).toEqual({white:0,blue:0,green:0,red:2,black:1,gold:0});
    const next=applyAction(s,0,{type:'buy',cardId:'1-white-01',payment:{black:1,gold:2}});expect(next.players[0].tokens.red).toBe(2);expect(next.players[0].tokens.gold).toBe(0);expect(next.bank.gold).toBe(5);
  });
  it('拒绝不足、超付、非法数量和将同一黄金重复计算',()=>{
    const s=game();marketCard(s,'1-white-01');giveTokens(s,0,{red:2,black:1,gold:1});
    for(const payment of [{red:1,black:1},{red:2,black:1,gold:1},{red:3},{gold:3},{red:-1},{red:1.5},{ruby:1},{red:NaN}])expect(()=>applyAction(s,0,{type:'buy',cardId:'1-white-01',payment})).toThrow();
    const poor=game();marketCard(poor,'1-white-01');giveTokens(poor,0,{gold:2});expect(defaultPayment(poor.players[0],CARD_BY_ID['1-white-01'])).toBeNull();expect(()=>applyAction(poor,0,{type:'buy',cardId:'1-white-01'})).toThrow();
  });
  it('折扣足够时可免费购买，仍占一个主要行动',()=>{
    const s=game();marketCard(s,'1-white-01');giveBonuses(s,0,{red:3,black:2});const next=applyAction(s,0,{type:'buy',cardId:'1-white-01'});expect(next.players[0].tokens).toEqual(emptyTokens());expect(next.turn).toBe(1);expect(()=>applyAction(next,0,{type:'buy',cardId:'1-blue-01'})).toThrow();
  });
  it('超十后保留行动者，只允许准确归还，可归还刚拿的和黄金',()=>{
    const s=game();giveTokens(s,0,{white:2,blue:2,green:2,red:2,black:1,gold:1});
    const pending=applyAction(s,0,{type:'take',colors:['white','blue','black']});expect(pending.phase).toBe('return');expect(pending.turn).toBe(0);expect(pending.turnsTaken).toEqual([0,0]);expect(legalActions(pending,0).every(a=>a.action.type==='return')).toBe(true);
    for(const input of [{type:'pair',color:'red'},{type:'return',tokens:{white:2}},{type:'return',tokens:{red:3}},{type:'return',tokens:{gold:-1,white:4}}])expect(()=>applyAction(pending,0,input)).toThrow();
    const next=applyAction(pending,0,{type:'return',tokens:{gold:1,white:1,black:1}});expect(tokenCount(next.players[0].tokens)).toBe(10);expect(next.turn).toBe(1);expect(next.bank.gold).toBe(5);
  });
  it('正常阶段不能主动丢弃 token',()=>{expect(()=>applyAction(game(),0,{type:'return',tokens:{}})).toThrow();});
});
describe('预留、暗库和信息可见范围',()=>{
  it('公开预留获得黄金，市场立即补牌，并可在以后购买',()=>{
    const s=game();marketCard(s,'1-white-01');giveTokens(s,0,{red:2,black:1});let next=applyAction(s,0,{type:'reserve',cardId:'1-white-01'});expect(next.players[0].reserved[0].cardId).toBe('1-white-01');expect(next.players[0].tokens.gold).toBe(1);expect(next.market[1]).not.toContain('1-white-01');expect(next.events.find(e=>e.type==='reserve')?.cards).toEqual(['1-white-01']);
    for(const viewer of [0,1,null])expect(viewSplendor(next,viewer).players[0].reserved[0].card).toEqual(CARD_BY_ID['1-white-01']);
    const run=runFor(next);expect((splendorModule.observe(run,'p1') as SplendorView).players[0].reserved[0].card?.id).toBe('1-white-01');
    expect(()=>applyAction(next,1,{type:'buy',cardId:'1-white-01'})).toThrow();next=applyAction(next,1,primary(next));next=applyAction(next,0,{type:'buy',cardId:'1-white-01'});expect(next.players[0].reserved).toHaveLength(0);expect(next.players[0].bought).toContain('1-white-01');
  });
  it('暗抽不换市场，不公开卡或剩余暗库顺序；牌桌揭示不能污染 Agent 观察',()=>{
    const s=game(),secret=s.decks[3][0],market=s.market[3].slice(),next=applyAction(s,0,{type:'reserveDeck',level:3});
    expect(next.market[3]).toEqual(market);expect(next.decks[3]).toHaveLength(s.decks[3].length-1);
    const self=viewSplendor(next,0),other=viewSplendor(next,1),pub=viewSplendor(next,null),table=viewSplendor(next,null,true);
    expect(next.events.find(e=>e.type==='reserveDeck')?.cards).toEqual([secret]);
    expect(other.events.find(e=>e.type==='reserveDeck')).toMatchObject({text:'暗抽 3 级卡并预留，获得 1 黄金',level:3});
    expect(other.events.find(e=>e.type==='reserveDeck')?.cards).toBeUndefined();
    expect(table.events.find(e=>e.type==='reserveDeck')).toMatchObject({cards:[secret],text:expect.stringContaining(`暗抽 ${cardName(CARD_BY_ID[secret])}`)});
    expect(self.players[0].reserved[0].card?.id).toBe(secret);expect(other.players[0].reserved[0].card).toBeNull();expect(pub.players[0].reserved[0].card).toBeNull();expect(table.players[0].reserved[0].card?.id).toBe(secret);expect(JSON.stringify(other)).not.toContain(secret);expect('decks' in pub).toBe(false);expect(other.legalActions.every(a=>a.action.type!=='buy'||a.action.cardId!==secret)).toBe(true);
    const run=runFor(next);expect(splendorModule.decisionPrompt(run,{decisionId:'view',actorId:'p1'})).not.toContain(secret);expect(splendorModule.decisionPrompt(run,{decisionId:'view',actorId:'p0'})).toContain(secret);expect(JSON.stringify(splendorModule.observe(run,null))).not.toContain(secret);expect(JSON.stringify(splendorModule.tableView(run,null,{revealHands:true}))).toContain(secret);
  });
  it('市场与暗抽预留混合时，真人和 Agent 只见公开牌；观战显示暗抽牌面及完整记录',()=>{
    let s=game();const publicCard=s.market[1][0]!,secret=s.decks[3][0];
    s=applyAction(s,0,{type:'reserve',cardId:publicCard});s=applyAction(s,1,primary(s));s=applyAction(s,0,{type:'reserveDeck',level:3});
    const run=runFor(s);
    for(const view of [viewSplendor(s,1),viewSplendor(s,null),splendorModule.tableView(run,'p1',{revealHands:false}),splendorModule.observe(run,'p1')] as SplendorView[]){
      expect(view.players[0].reserved.map(r=>r.card?.id??null)).toEqual([publicCard,null]);expect(JSON.stringify(view)).not.toContain(secret);
      expect(view.events.find(e=>e.type==='reserve')?.cards).toEqual([publicCard]);expect(view.events.find(e=>e.type==='reserveDeck')?.cards).toBeUndefined();
    }
    const spectator=splendorModule.tableView(run,null,{revealHands:true}) as SplendorView;
    expect(spectator.players[0].reserved.map(r=>[r.source,r.card?.id])).toEqual([['market',publicCard],['deck',secret]]);
    expect(spectator.events.find(e=>e.type==='reserveDeck')?.text).toContain(secret);expect(spectator.events.find(e=>e.type==='reserveDeck')?.text).toContain('暗抽');
    expect(splendorModule.decisionPrompt(run,splendorModule.decisions(run)[0])).not.toContain(secret);
    const after=s.events.find(e=>e.type==='reserve')!.seq;
    const delta=JSON.parse(splendorModule.decisionPrompt(run,splendorModule.decisions(run)[0],after).split('当前观察：')[1]);
    expect(delta.events.every((e:any)=>e.seq>after)).toBe(true);expect(delta.events.some((e:any)=>e.type==='reserveDeck')).toBe(true);expect(JSON.stringify(delta)).not.toContain(secret);
    const observation=splendorModule.handleTool(run,{id:'read',scopeId:run.runId,playerId:'p1',tool:'game_get_state',args:{}});
    expect(JSON.stringify(observation)).not.toContain(secret);expect(JSON.stringify(splendorModule.observe(run,'p1'))).not.toContain(secret);
    const agents=structuredClone(run);agents.roster.forEach(player=>{player.kind='codex';});agents.state.players.forEach(player=>{player.kind='agent';});
    expect((splendorModule.tableView(agents,null,{revealHands:true}) as SplendorView).events.find(e=>e.type==='reserveDeck')?.cards).toEqual([secret]);
    expect(JSON.stringify(splendorModule.observe(agents,'p1'))).not.toContain(secret);expect(splendorModule.decisionPrompt(agents,{decisionId:'view',actorId:'p1'})).not.toContain(secret);
  });
  it('暗抽购买后，公开记录只在购买时显示牌名，观战仍保留暗抽来源',()=>{
    const s=game();giveTokens(s,0,{red:2,black:1});takeOut(s,'1-white-01');s.decks[1].unshift('1-white-01');
    let next=applyAction(s,0,{type:'reserveDeck',level:1});next=applyAction(next,1,primary(next));next=applyAction(next,0,{type:'buy',cardId:'1-white-01'});
    const publicView=viewSplendor(next,1),spectator=viewSplendor(next,null,true);
    expect(publicView.players[0].reserved).toHaveLength(0);expect(publicView.events.find(e=>e.type==='reserveDeck')?.cards).toBeUndefined();
    expect(publicView.events.find(e=>e.type==='reserveDeck')?.text).not.toContain('1-white-01');expect(publicView.events.find(e=>e.type==='buy')?.cards).toEqual(['1-white-01']);
    expect(spectator.events.find(e=>e.type==='reserveDeck')?.cards).toEqual(['1-white-01']);
  });
  it('预留上限三张且不可丢弃；黄金空仍可预留',()=>{
    let s=game();for(let i=0;i<3;i++){s=applyAction(s,0,{type:'reserveDeck',level:3});s=applyAction(s,1,primary(s));}
    expect(s.players[0].reserved).toHaveLength(3);expect(legalActions(s,0).some(a=>a.action.type==='reserve'||a.action.type==='reserveDeck')).toBe(false);expect(()=>applyAction(s,0,{type:'reserveDeck',level:1})).toThrow();
    const noGold=game();giveTokens(noGold,1,{gold:5});const next=applyAction(noGold,0,{type:'reserveDeck',level:2});expect(next.players[0].reserved).toHaveLength(1);expect(next.players[0].tokens.gold).toBe(0);
  });
  it('暗库耗尽不补牌、不结束整局，不能暗抽空牌堆',()=>{
    const s=game();buyFixture(s,1,s.decks[1].slice());const card=s.market[1][0]!;const next=applyAction(s,0,{type:'reserve',cardId:card});expect(next.market[1][0]).toBeNull();expect(next.phase).toBe('action');expect(next.decks[1]).toHaveLength(0);expect(()=>applyAction(next,1,{type:'reserveDeck',level:1})).toThrow();
  });
  it('公开事件完整递增，观察是副本，不可改写规则状态或牌组',()=>{
    let s=game();for(let i=0;i<8;i++)s=applyAction(s,s.turn,primary(s));expect(viewSplendor(s,0).events).toHaveLength(s.events.length);expect(s.events.map(e=>e.seq)).toEqual(s.events.map((_,i)=>i+1));
    const view=viewSplendor(s,0);view.bank.white=999;view.market[1][0]!.cost.white=999;view.events.length=0;expect(s.bank.white).not.toBe(999);expect(CARD_BY_ID[s.market[1][0]!].cost.white).not.toBe(999);expect(s.events.length).toBeGreaterThan(0);
  });
});
describe('贵族、最后一轮与跨局',()=>{
  it('单位贵族自动来访，token 不等于折扣',()=>{
    const s=game();s.nobles=['N04','N01','N08'];giveBonuses(s,0,{white:3,blue:3,green:3});const next=applyAction(s,0,primary(s));expect(next.players[0].nobles).toEqual(['N04']);expect(points(next.players[0])).toBe(3);expect(next.turn).toBe(1);
    const tokens=game();tokens.nobles=['N05','N01','N08'];giveTokens(tokens,0,{white:4,blue:4});expect(eligibleNobles(tokens,0)).toEqual([]);
  });
  it('同时符合多位时必须选一位，不额外行动、不连拿贵族',()=>{
    const s=game();s.nobles=['N05','N06','N07'];giveBonuses(s,0,{white:4,blue:4,black:4});const pending=applyAction(s,0,primary(s));expect(pending.phase).toBe('noble');expect(pending.turnsTaken).toEqual([0,0]);expect(legalActions(pending,0)).toHaveLength(3);expect(()=>applyAction(pending,0,{type:'noble',nobleId:'N01'})).toThrow();expect(()=>applyAction(pending,0,{type:'pair',color:'red'})).toThrow();const next=applyAction(pending,0,{type:'noble',nobleId:'N05'});expect(next.players[0].nobles).toEqual(['N05']);expect(next.nobles).toEqual(['N06','N07']);expect(next.turn).toBe(1);
  });
  it('归还先于贵族，贵族可触发十五分，全部等轮后才结束',()=>{
    const s=game(3,2);s.nobles=['N04','N01','N08','N02'];giveBonuses(s,2,{white:3,blue:3,green:3});buyFixture(s,2,['3-white-04','3-blue-02','2-green-06']);expect(points(s.players[2])).toBe(12);giveTokens(s,2,{white:2,blue:2,green:2,red:2,black:1,gold:1});let next=applyAction(s,2,primary(s));expect(next.phase).toBe('return');expect(next.finalRound).toBe(false);next=applyAction(next,2,legalActions(next,2)[0].action);expect(next.phase).toBe('action');expect(next.finalRound).toBe(true);expect(points(next.players[2])).toBe(15);expect(next.turn).toBe(0);next=applyAction(next,0,primary(next));expect(next.phase).not.toBe('finished');next=applyAction(next,1,primary(next));expect(next.phase).toBe('finished');expect(next.turnsTaken).toEqual([1,1,1]);expect(next.result?.winners).toEqual([2]);expect(legalActions(next,2)).toEqual([]);
  });
  it('相同声望按较少已购卡取胜，未购买预留和剩余 token 不计分',()=>{
    let s=game();buyFixture(s,0,['3-white-04','3-blue-04','3-green-04']);buyFixture(s,1,['3-white-02','3-blue-02','3-red-02','3-black-01']);expect(points(s.players[0])).toBe(15);expect(points(s.players[1])).toBe(15);s=applyAction(s,0,primary(s));s=applyAction(s,1,{type:'reserveDeck',level:3});expect(s.result?.winners).toEqual([0]);expect(s.result?.cardCounts).toEqual([3,4]);expect(s.result?.scores).toEqual([15,15]);
  });
  it('同声望同购牌数共享胜利；最高声望优先于牌数',()=>{
    const tied=finishFixture(true);expect(tied.result?.winners).toEqual([0,1]);expect(tied.players.map(p=>p.wins)).toEqual([1,1]);expect(finishFixture().result?.winners).toEqual([0]);
    let s=game();buyFixture(s,0,['3-white-04','3-blue-04','3-green-04']);buyFixture(s,1,['3-white-02','3-blue-02','3-red-02','3-black-02']);s=applyAction(s,0,primary(s));s=applyAction(s,1,primary(s));expect(s.result?.winners).toEqual([1]);
  });
  it('下一局重置牌和 token，按稳定身份保留积分、轮换先手、新人从零开始',()=>{
    const old=finishFixture(),players=[identities()[1],identities()[0],{playerId:'new',name:'新人',kind:'agent' as const}];
    const next=nextSplendor(old,'newGame',players,rng(44),2);expect(next.firstSeat).toBe(0);expect(next.players[1].wins).toBe(1);expect(next.players[1].totalPoints).toBe(16);expect(next.players[2].totalPoints).toBe(0);expect(next.players.every(p=>!p.bought.length&&!p.reserved.length&&tokenCount(p.tokens)===0)).toBe(true);expect(next.bank.white).toBe(5);expect(next.round).toBe(2);expect(()=>nextSplendor(game(),'x',identities(),rng(),2)).toThrow();
  });
  it('仅当完全无合法主要行动时被迫跳过，并公开预留牌以证明',()=>{
    const s=game();giveTokens(s,0,{white:4,blue:4,green:2});giveTokens(s,1,{green:2,red:4,black:4});
    for(const id of ['3-white-02','3-white-03','3-white-04']){takeOut(s,id);s.players[0].reserved.push({cardId:id,level:3,source:'deck',revealed:false});}
    for(const level of LEVELS){const ids=CARDS.filter(c=>c.level===level&&!defaultPayment(s.players[0],c)&&!s.players[0].reserved.some(r=>r.cardId===c.id)).slice(0,4).map(c=>c.id);ids.forEach((id,i)=>marketCard(s,id,i));}
    expect(legalActions(s,0).map(a=>a.id)).toEqual(['pass']);const next=applyAction(s,0,{type:'pass'});expect(viewSplendor(next,1).players[0].reserved.every(r=>r.card)).toBe(true);expect(()=>applyAction(game(),0,{type:'pass'})).toThrow();
  });
});
describe('领域决策与恢复',()=>{
  it('游戏决策绑定当前身份、阶段和修订，工具能力固定',()=>{
    const run=runFor(game()),d=splendorModule.decisions(run)[0],choice=legalActions(run.state,0)[0];
    const request={id:'req',scopeId:'game',playerId:'p0',decisionId:d.decisionId,tool:'game_act',args:{revision:1,actionId:choice.id}};
    expect(()=>splendorModule.handleTool(run,{...request,playerId:'p1'})).toThrow();expect(()=>splendorModule.handleTool(run,{...request,decisionId:'old'})).toThrow();expect(()=>splendorModule.handleTool(run,{...request,scopeId:'other'})).toThrow();expect(()=>splendorModule.handleTool(run,{...request,args:{...request.args,revision:0}})).toThrow();
    const after=splendorModule.handleTool(run,request).state!;expect(after.turn).toBe(1);expect(splendorModule.tools({...run,state:after},'p0')).toEqual(splendorModule.tools(run,'p0'));expect(splendorModule.decisions({...run,state:after})[0].decisionId).not.toBe(d.decisionId);
  });
  it('恢复检查当前版本、牌、贵族和资源守恒，不迁移损坏数据',()=>{
    const s=game();expect(splendorModule.restore(JSON.parse(JSON.stringify(s)),1)).toEqual(s);expect(splendorModule.restore(JSON.parse(JSON.stringify(finishFixture())),1).phase).toBe('finished');expect(()=>splendorModule.restore(s,0)).toThrow();
    for(const change of [(x:SplendorState)=>{x.bank.red++;},(x:SplendorState)=>{x.decks[1][0]=x.decks[1][1];},(x:SplendorState)=>{x.players[0].tokens.gold=-1;},(x:SplendorState)=>{x.nobles[0]=x.nobles[1];},(x:SplendorState)=>{x.phase='return';}]){const bad=structuredClone(s);change(bad);expect(()=>splendorModule.restore(bad,1)).toThrow();}
  });
  it('100 局合法策略序列保持全部牌、贵族与 token 守恒并按规则结算',()=>{
    for(let seed=1;seed<=100;seed++){
      const random=rng(seed),n=2+seed%3;let s=createSplendor('random'+seed,identities(n),{random});let moves=0;
      while(s.phase!=='finished'&&moves++<1200){
        const legal=legalActions(s,s.turn),buys=legal.filter(a=>a.action.type==='buy');let choice;
        if(buys.length){buys.sort((a,b)=>{const ca=CARD_BY_ID[(a.action as Extract<Action,{type:'buy'}>).cardId],cb=CARD_BY_ID[(b.action as Extract<Action,{type:'buy'}>).cardId];return cb.points-ca.points;});choice=random()<.8?buys[0]:buys[Math.floor(random()*buys.length)];}
        else{const takes=legal.filter(a=>a.action.type==='take'||a.action.type==='pair');const pool=s.phase==='action'&&takes.length&&random()<.9?takes:legal;choice=pool[Math.floor(random()*pool.length)];}
        expect(choice).toBeDefined();s=applyAction(s,s.turn,choice.action);assertSplendor(s);
      }
      expect(s.phase,`seed ${seed}, moves ${moves}`).toBe('finished');expect(s.turnsTaken.every(turns=>turns===s.turnsTaken[0])).toBe(true);expect(Math.max(...s.result!.scores)).toBeGreaterThanOrEqual(15);expect(s.players.reduce((n,p)=>n+p.wins,0)).toBe(s.result!.winners.length);
    }
  },30000);
});
