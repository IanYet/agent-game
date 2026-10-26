import {describe,it,expect} from 'vitest';
import {applyAction,beats,classify,createBaoDeck,createGame,legalActions,pendingSeats,viewGame} from './engine';
import {baohuangModule as module,restoreBao} from './definition';
import type {BaoCard,BaoState} from './types';
import type {StoredRun} from '../../runtime/types';

const players=Array.from({length:5},(_,i)=>({playerId:`p${i}`,name:`玩家${i+1}`,kind:'agent' as const}));
const seeded=(seed:number)=>()=>{seed=Math.imul(seed,1664525)+1013904223|0;return (seed>>>0)/4294967296;};
const cards=(ranks:number[]):BaoCard[]=>{const deck=createBaoDeck(),used=new Set<string>();return ranks.map(rank=>{const c=deck.find(c=>c.rank===rank&&!used.has(c.id));if(!c)throw new Error('牌不足');used.add(c.id);return c;});};
const meta={moduleId:'baohuang',moduleVersion:'1.0.0',stateVersion:1,roomId:'room',runId:'run',index:1,config:{ruleset:'jj-fixed168',baseScore:1},roster:players.map(p=>({...p,kind:'codex' as const}))};
function start(seed=3,open=false){let s=createGame('room',players,{random:seeded(seed)});s=applyAction(s,s.turn,{type:'enthrone'});for(let seat=0;seat<5;seat++)s=applyAction(s,seat,{type:'declare',open:seat===s.guard&&open});return s;}
function fixture(hands:number[][],emperor=0,guard=1){
  const s=start();s.emperor=emperor;s.guard=guard;s.guardPublic=false;s.open=false;s.order=[];s.events=[];s.result=null;s.turn=0;s.lastPlay=null;s.trick=1;s.lastActions=Array(5).fill(null);s.responders=[];
  const deck=createBaoDeck(),used=new Set<string>();s.players.forEach((p,i)=>{p.hand=hands[i].map(rank=>{const c=deck.find(c=>c.rank===rank&&!used.has(c.id))!;used.add(c.id);return c;});p.rank=null;p.score=0;});s.played=deck.filter(c=>!used.has(c.id));return s;
}
function finishInOrder(order:number[],emperor:number,guard:number,open:boolean,baseScore=1){
  const s=fixture([[6],[7],[8],[9],[10]],emperor,guard);s.open=open;s.baseScore=baseScore;
  const e=order.indexOf(emperor)+1,g=order.indexOf(guard)+1;
  const civ=order.map((at,i)=>({at,rank:i+1})).filter(p=>p.at!==emperor&&p.at!==guard).map(p=>p.rank);
  const endAt=emperor===guard?(open?1:Math.min(e,2)):Math.min(Math.max(e,g),Math.max(...civ));
  s.order=order.slice(0,endAt-1);s.order.forEach((at,i)=>{s.played.push(...s.players[at].hand);s.players[at].hand=[];s.players[at].rank=i+1;});
  s.turn=order[endAt-1];return applyAction(s,s.turn,{type:'play',cards:s.players[s.turn].hand.map(c=>c.id)});
}

describe('保皇固定保的牌库、套牌与王挂牌',()=>{
  it('四副168张、唯一皇牌侍卫牌、34/34/34/33/33；不重复不丢牌',()=>{
    const deck=createBaoDeck();expect(deck).toHaveLength(168);expect(new Set(deck.map(c=>c.id)).size).toBe(168);expect(deck.every(c=>c.rank>=6)).toBe(true);
    expect(deck.filter(c=>c.mark==='emperor')).toHaveLength(1);expect(deck.filter(c=>c.mark==='guard')).toHaveLength(1);
    const s=createGame('deal',players,{random:seeded(5)});expect(s.players.map(p=>p.hand.length)).toEqual([34,34,34,33,33]);
    expect(()=>createGame('bad',players.slice(1),{random:seeded(1)})).toThrow();expect(()=>createGame('bad',[{...players[0],kind:'human'},{...players[1],kind:'human'},...players.slice(2)],{random:seeded(1)})).toThrow();
    for(const baseScore of [0,-1,101,1.5,NaN])expect(()=>createGame('bad',players,{random:seeded(1),baseScore})).toThrow();
    expect(()=>module.validateConfig!({ruleset:'other',baseScore:1})).toThrow();
  });
  it.each([[6],[8,8,8,8],[15,15,15],[6,6,16],[7,7,16,17],[16,16,17],[17,17,17,17]])('允许套牌与挂王 %j',(...ranks)=>expect(classify(cards(ranks))).not.toBeNull());
  it.each([[6,7],[7,8,9,10,11],[8,8,9,9],[6,15],[6,6,15,16]])('拒绝顺子、多个普通点数、2配牌 %j',(...ranks)=>expect(classify(cards(ranks))).toBeNull());
  it('逐张严格比较；皇牌同大王、侍卫同小王；没有炸弹烤牌',()=>{
    expect(beats(cards([17,16,16,16]),cards([14,14,14,14]))).toBe(true);
    expect(beats(cards([17,6,6,6]),cards([16,6,6,6]))).toBe(false);
    expect(beats(cards([17,7,7,7]),cards([16,6,6,6]))).toBe(true);
    expect(beats(cards([15,15,15,15]),cards([16]))).toBe(false);
    expect(beats(cards([17,17]),cards([17]))).toBe(false);
    expect(beats(cards([17]),cards([17]))).toBe(false);expect(beats(cards([16]),cards([16]))).toBe(false);
    const c=cards([6])[0];expect(classify([c,c])).toBeNull();expect(classify([])).toBeNull();
  });
  it('合法枚举保留使用/保留皇牌和侍卫牌的选择，普通副本等效',()=>{
    const s=fixture([[6,6,16,16,17,17],[7],[8],[9],[10]]);const choices=legalActions(s,0);
    const small=choices.filter(c=>c.cards?.length===1&&c.cards[0].rank===16);expect(small).toHaveLength(2);
    expect(small.some(c=>c.cards?.[0].mark==='guard')).toBe(true);expect(small.some(c=>!c.cards?.[0].mark)).toBe(true);
    expect(choices.filter(c=>c.cards?.length===1&&c.cards[0].rank===17)).toHaveLength(2);
    expect(choices.filter(c=>c.cards?.length===1&&c.cards[0].rank===6)).toHaveLength(1);
    expect(choices.every(c=>c.action.type!=='play'||beats(c.cards!,null))).toBe(true);
    const brute=new Set<string>();const hand=s.players[0].hand;
    for(let mask=1;mask<1<<hand.length;mask++){const subset=hand.filter((_,i)=>mask>>i&1);if(classify(subset))brute.add(subset.map(c=>`${c.rank}${c.mark??''}`).sort().join(','));}
    expect(new Set(choices.map(c=>c.cards!.map(c=>`${c.rank}${c.mark??''}`).sort().join(',')))).toEqual(brute);
  });
});
describe('皇位、侍卫与私有观察',()=>{
  it('自行选择实体副本和挂王，不要求代表行动；保留标记牌就不暴露暗保',()=>{
    const s=fixture([[6,6,6,16,16,17],[7,7],[8],[9],[10]],1,0);
    const normal=s.players[0].hand.filter(c=>c.rank===6).slice(1),joker=s.players[0].hand.find(c=>c.rank===16&&!c.mark)!;
    const before=structuredClone(s),next=applyAction(s,0,{type:'play',cards:[...normal.map(c=>c.id),joker.id]});
    expect(next.lastPlay?.cards).toHaveLength(3);expect(next.players[0].hand.some(c=>c.mark==='guard')).toBe(true);
    expect(next.guardPublic).toBe(false);expect(viewGame(next,1).guard).toBeNull();expect(next.turn).toBe(1);expect(s).toEqual(before);
  });
  it('各阶段的错误行动和越权明保均不改身份、资源、名次与记录',()=>{
    const crown=createGame('invalid',players,{random:seeded(7)}),declare=applyAction(crown,crown.turn,{type:'enthrone'});
    const s=fixture([[6,7,16],[8],[9],[10],[11]]),nonGuard=(declare.guard+1)%5;
    const cases:Array<[BaoState,number,Parameters<typeof applyAction>[2]]>=[
      [crown,crown.turn,{type:'declare',open:false}],[declare,nonGuard,{type:'declare',open:true}],
      [declare,declare.guard,{type:'play',cards:[declare.players[declare.guard].hand[0].id]}],
      [s,1,{type:'pass'}],[s,0,{type:'pass'}],[s,0,{type:'enthrone'}],
      [s,0,{type:'play',cards:[]}],[s,0,{type:'play',cards:[s.players[1].hand[0].id]}],
      [s,0,{type:'play',cards:[s.players[0].hand[0].id,s.players[0].hand[0].id]}],
      [s,0,{type:'play',cards:s.players[0].hand.map(c=>c.id)}],
    ];
    for(const [state,seat,action] of cases){const before=structuredClone(state);expect(()=>applyAction(state,seat,action)).toThrow();expect(state).toEqual(before);}
    const ready=applyAction(declare,nonGuard,{type:'declare',open:false}),before=structuredClone(ready);
    expect(()=>applyAction(ready,nonGuard,{type:'declare',open:false})).toThrow();expect(ready).toEqual(before);
  });
  it('让位向上家只传一张皇牌；一轮后原持有人强制登基',()=>{
    let s=createGame('cede',players,{random:seeded(1)}),initial=s.emperor;const hands=s.players.map(p=>p.hand.length);
    for(let i=0;i<5;i++){const prev=s.emperor;s=applyAction(s,prev,{type:'cede'});expect(s.emperor).toBe((prev+4)%5);expect(s.players[s.emperor].hand.some(c=>c.mark==='emperor')).toBe(true);}
    expect(s.phase).toBe('declare');expect(s.emperor).toBe(initial);expect(s.players.map(p=>p.hand.length)).toEqual(hands);expect(s.played).toEqual([]);
  });
  it('五人同时准备，暗保确认没有身份事件或公开的特定行动者',()=>{
    let s=createGame('secret',players,{random:seeded(3)});s=applyAction(s,s.turn,{type:'enthrone'});
    const run={...meta,state:s},before=module.decisions(run);expect(before).toHaveLength(5);const eventCount=s.events.length;
    s=applyAction(s,s.guard,{type:'declare',open:false});expect(s.events).toHaveLength(eventCount);expect(viewGame(s,null).turn).toBeNull();expect(viewGame(s,null).guard).toBeNull();
    for(const d of module.decisions({...meta,state:s}))expect(before.some(old=>old.decisionId===d.decisionId)).toBe(true);
    for(const seat of pendingSeats(s))s=applyAction(s,seat,{type:'declare',open:false});
    expect(s.phase).toBe('playing');expect(s.turn).toBe(s.emperor);expect(viewGame(s,null).guard).toBeNull();
    expect(s.events.find(e=>e.type==='declaration')?.seat).toBeUndefined();
  });
  it('明保只由持侍卫牌者确认，准备结束才公开',()=>{
    let s=createGame('open',players,{random:seeded(8)});s=applyAction(s,s.turn,{type:'enthrone'});
    expect(()=>applyAction(s,(s.guard+1)%5,{type:'declare',open:true})).toThrow();s=applyAction(s,s.guard,{type:'declare',open:true});
    expect(viewGame(s,null).guard).toBeNull();expect(()=>applyAction(s,s.guard,{type:'declare',open:true})).toThrow();
    for(const at of pendingSeats(s))s=applyAction(s,at,{type:'declare',open:false});expect(s.open).toBe(true);expect(viewGame(s,null).guard).toBe(s.guard);
  });
  it('公开、其他Agent和皇帝看不到暗保身份；观战翻手牌不会污染Agent观察',()=>{
    const s=start(3);expect(s.emperor).not.toBe(s.guard);const run={...meta,state:s};
    for(let at=0;at<5;at++){
      const view=module.observe(run,`p${at}`);expect(view.players.filter(p=>p.hand).map(p=>p.seat)).toEqual([at]);expect(view.guard).toBe(at===s.guard?s.guard:null);
      expect(view.players[s.guard].role).toBe(at===s.guard?'guard':null);
      const result=module.handleTool(run,{id:'read',scopeId:'run',playerId:`p${at}`,tool:'game_get_state',args:{}}).result.structuredContent as any;
      expect(result.guard).toBe(at===s.guard?s.guard:null);expect(result.players.filter((p:any)=>p.hand).map((p:any)=>p.seat)).toEqual([at]);
      const prompt=JSON.parse(module.decisionPrompt(run,{decisionId:'view',actorId:`p${at}`}).split('当前观察：')[1]);expect(prompt.guard).toBe(view.guard);
    }
    const before=structuredClone(s),table=module.tableView(run,null,{revealHands:true});expect(table.players.every(p=>p.hand)).toBe(true);expect(table.guard).toBeNull();expect(s).toEqual(before);
    const publicView=module.observe(run,null);expect(publicView.players.every(p=>!p.hand)).toBe(true);expect(publicView.legalActions).toEqual([]);expect(publicView.events).toEqual(s.events);
  });
  it('打出标记小王才揭示暗侍卫，保留暗保分数',()=>{
    let s=fixture([[6],[16,7],[8],[9],[10]]);s.turn=1;const c=s.players[1].hand.find(c=>c.mark==='guard')!;s=applyAction(s,1,{type:'play',cards:[c.id]});
    expect(s.guardPublic).toBe(true);expect(s.open).toBe(false);expect(viewGame(s,0).players[1].role).toBe('guard');
  });
  it('非法行动、错身份、过期决策及过期revision均不改变状态',()=>{
    const s=start(),before=structuredClone(s),run={...meta,state:s},at=s.turn,d=module.decisions(run)[0];
    expect(()=>applyAction(s,(at+1)%5,{type:'pass'})).toThrow();expect(()=>applyAction(s,at,{type:'pass'})).toThrow();expect(()=>applyAction(s,at,{type:'play',cards:['unknown']})).toThrow();
    const c=s.players[at].hand[0];expect(()=>applyAction(s,at,{type:'play',cards:[c.id,c.id]})).toThrow();
    const id=legalActions(s,at)[0].id;
    for(const [playerId,decisionId,revision] of [[d.actorId,'wrong',s.revision],[`p${(at+1)%5}`,d.decisionId,s.revision],[d.actorId,d.decisionId,s.revision-1]] as const){
      const r=module.handleTool(run,{id:'act',scopeId:'run',playerId,decisionId,tool:'game_act',args:{revision,actionId:id}});expect(r.result.isError).toBe(true);expect(r.state).toBeUndefined();
    }
    expect(s).toEqual(before);
  });
});
describe('行牌、接风、名次与零和积分',()=>{
  it('允许让过后再上；每次新出牌重置其余活跃玩家应答',()=>{
    let s=fixture([[6,12],[9,13],[8,14],[10,15],[11,15]]);
    s=applyAction(s,0,{type:'play',cards:[s.players[0].hand[0].id]});s=applyAction(s,1,{type:'pass'});
    s=applyAction(s,2,{type:'play',cards:[s.players[2].hand[0].id]});s=applyAction(s,3,{type:'pass'});s=applyAction(s,4,{type:'pass'});s=applyAction(s,0,{type:'pass'});
    expect(s.turn).toBe(1);expect(legalActions(s,1).some(c=>c.cards?.[0].rank===9)).toBe(true);
    s=applyAction(s,1,{type:'play',cards:[s.players[1].hand[0].id]});expect(s.turn).toBe(2);
  });
  it('末手无人接时，下一个未走玩家接风；不按隐藏阵营分配',()=>{
    let s=fixture([[17],[6,7],[8,9],[10,11],[12,13]]);s=applyAction(s,0,{type:'play',cards:s.players[0].hand.map(c=>c.id)});
    expect(s.order).toEqual([0]);for(let i=1;i<5;i++)s=applyAction(s,i,{type:'pass'});
    expect(s.turn).toBe(1);expect(s.lastPlay).toBeNull();expect(s.trick).toBe(2);expect(s.events.at(-1)?.type).toBe('wind');
    s=applyAction(s,1,{type:'play',cards:[s.players[1].hand[0].id]});expect(s.lastPlay?.cards[0].rank).toBe(6);
  });
  it('领牌者未走则全过后自己领；走人的末手仍可被压',()=>{
    let s=fixture([[7,8],[9,10],[11,12],[13,14],[15,16]]);s=applyAction(s,0,{type:'play',cards:[s.players[0].hand[0].id]});for(let i=1;i<5;i++)s=applyAction(s,i,{type:'pass'});expect(s.turn).toBe(0);expect(s.lastPlay).toBeNull();
    s=fixture([[7],[8,10],[11],[12],[13]]);s=applyAction(s,0,{type:'play',cards:[s.players[0].hand[0].id]});s=applyAction(s,1,{type:'play',cards:[s.players[1].hand[0].id]});expect(s.lastPlay?.seat).toBe(1);expect(s.turn).toBe(2);
  });
  it('覆盖皇保所有20种名次组合，明保与暗保，提前结束按剩余名次和计分',()=>{
    for(let e=1;e<=5;e++)for(let g=1;g<=5;g++){if(e===g)continue;for(const open of [false,true]){
      const order=Array(5).fill(-1);order[e-1]=0;order[g-1]=1;let civ=2;for(let i=0;i<5;i++)if(order[i]===-1)order[i]=civ++;
      const baseScore=e+g,s=finishInOrder(order,0,1,open,baseScore),base=(6-e-g)*(open?2:1)*baseScore;
      expect(s.phase).toBe('finished');expect(s.result?.deltas).toEqual([base*2,base,-base,-base,-base]);expect(s.result?.rankSum).toBe(e+g);expect(s.players.reduce((sum,p)=>sum+p.score,0)).toBe(0);
    }}
  });
  it('暗独保头客赢、二客和、两名平民先走输；明独保只争头客',()=>{
    for(const [order,open,want] of [ [[0,1,2,3,4],false,12],[[1,0,2,3,4],false,0],[[1,2,0,3,4],false,-12],[[0,1,2,3,4],true,24],[[1,0,2,3,4],true,-24] ] as Array<[number[],boolean,number]>){const s=finishInOrder(order,0,0,open);expect(s.phase).toBe('finished');expect(s.result?.deltas).toEqual([want,-want/4,-want/4,-want/4,-want/4]);expect(viewGame(s,null).guard).toBe(0);}
  });
  it('下一局按玩家ID继承分数，重新发牌重置身份、事件和名次',()=>{
    const s=finishInOrder([0,1,2,3,4],0,1,false);const previous={...meta,state:s};const roster=[...meta.roster].reverse();
    const next=module.next(previous,{...meta,index:2,runId:'next',roster},seeded(7));expect(next.round).toBe(2);expect(next.players.map(p=>p.score)).toEqual([s.players[4].score,s.players[3].score,s.players[2].score,s.players[1].score,s.players[0].score]);expect(next.order).toEqual([]);expect(next.played).toEqual([]);expect(next.events[0].seq).toBe(1);
    expect(()=>module.next({...meta,state:start()},meta,seeded(7))).toThrow();
  });
  it('100局合法行动序列全部结束，168张和积分守恒，存档可恢复',()=>{
    for(let seed=1;seed<=100;seed++){
      const random=seeded(seed);let s=createGame('sequence',players,{random,baseScore:seed%7+1}),steps=0;
      while(s.phase!=='finished'&&steps++<2500){
        const at=pendingSeats(s)[0],choices=legalActions(s,at);expect(choices.length).toBeGreaterThan(0);
        const plays=choices.filter(c=>c.action.type==='play');const pool=plays.length&&random()<.85?plays:choices;
        const choice=pool[Math.floor(random()*Math.min(pool.length,30))];s=applyAction(s,at,choice.action);
        const all=[...s.played,...s.players.flatMap(p=>p.hand)];expect(all.length).toBe(168);expect(new Set(all.map(c=>c.id)).size).toBe(168);
        expect(s.players.reduce((sum,p)=>sum+p.score,0)).toBe(0);expect(s.events.every((e,i)=>e.seq===i+1)).toBe(true);
        if(steps%40===0)expect(restoreBao(s,1)).toEqual(s);
      }
      expect(s.phase,`seed ${seed}`).toBe('finished');expect(s.result?.deltas.reduce((a,b)=>a+b,0)).toBe(0);expect(restoreBao(s,1)).toEqual(s);
      expect(pendingSeats(s)).toEqual([]);expect(legalActions(s,0)).toEqual([]);
    }
  },60000);
  it('拒绝错误版本、重复/缺失牌及损坏名次存档',()=>{
    const s=start();expect(()=>restoreBao(s,2)).toThrow();const bad=structuredClone(s);bad.players[0].hand.push(bad.players[1].hand[0]);expect(()=>restoreBao(bad,1)).toThrow();
    const rank=structuredClone(s);rank.order=[2];expect(()=>restoreBao(rank,1)).toThrow();expect(()=>restoreBao({gameId:'baohuang'},1)).toThrow();
  });
});
