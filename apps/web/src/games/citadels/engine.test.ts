import {describe,it,expect} from 'vitest';
import {applyCitadels,assertCitadels,createCitadels,legalCitadels,nextCitadels,scoreCitadels,viewCitadels,type CitadelsState,type PlayerInput} from './engine';
import {district,makeDeck,type BuiltDistrict,type District} from './cards';
import {definition as module} from './definition';
import type {StoredRun} from '../../runtime/types';
const players=(n=4):PlayerInput[]=>Array.from({length:n},(_,i)=>({playerId:`p${i}`,name:`城主${i+1}`,kind:i===0?'human':'agent'}));
const seeded=(seed:number)=>()=>{seed=Math.imul(seed,1664525)+1013904223|0;return (seed>>>0)/4294967296;};
function stage(role=4){
  const s=createCitadels('rules',players(),{firstCrown:1},seeded(4));
  s.players.forEach(p=>{p.roles=[];p.revealed=[];});s.players[0].roles=[role];s.players[0].revealed=[role];
  s.available=[];s.faceUp=[];s.faceDown=Array.from({length:8},(_,i)=>i+1).filter(r=>r!==role);
  s.called=role;s.phase='income';s.turn=0;return s;
}
function assign(s:CitadelsState,seat:number,role:number){s.players.forEach(p=>p.roles=p.roles.filter(r=>r!==role));s.faceDown=s.faceDown.filter(r=>r!==role);s.faceUp=s.faceUp.filter(r=>r!==role);s.available=s.available.filter(r=>r!==role);s.players[seat].roles.push(role);}
function gold(s:CitadelsState,seat:number,n:number){s.bankFlow+=n-s.players[seat].gold;s.players[seat].gold=n;}
function take(s:CitadelsState,key:string):District {
  const locations=[s.deck,...s.players.flatMap(p=>[p.hand,p.city])];
  for(const cards of locations){const index=cards.findIndex(c=>c.key===key);if(index>=0){const [c]=cards.splice(index,1);return {id:c.id,key:c.key};}}
  throw Error(`缺少测试建筑 ${key}`);
}
function city(s:CitadelsState,seat:number,keys:string[],round=1){keys.forEach(key=>s.players[seat].city.push({...take(s,key),builtRound:round}));}
function hand(s:CitadelsState,seat:number,key:string){const c=take(s,key);s.players[seat].hand.push(c);return c;}
function main(s:CitadelsState){return applyCitadels(s,s.turn,{type:'income',source:'gold'});}
function draft(s:CitadelsState){while(s.phase==='draft')s=applyCitadels(s,s.turn,legalCitadels(s,s.turn)[0].action);return s;}
function runFor(state:CitadelsState):StoredRun<CitadelsState>{return {moduleId:module.id,moduleVersion:module.version,stateVersion:module.stateVersion,roomId:'room',runId:state.id,index:state.gameNumber,config:state.config,roster:state.players.map(p=>({playerId:p.playerId,name:p.name,kind:'codex' as const})),state};}

describe('私有技能通知与信息范围',()=>{
  it('刺杀只通知实际持有人，不新增决策，也不向其他玩家公开持有人',()=>{
    let s=stage(1);assign(s,1,6);assign(s,2,8);const before=s.events.length;
    s=applyCitadels(s,0,{type:'assassinate',role:6});
    const run=runFor(s),own=viewCitadels(s,1),prompt=module.notificationPrompt!(run,'p1',before)!;
    expect(own.notifications).toEqual([expect.objectContaining({seq:s.events.length,round:1,kind:'assassinate',text:expect.stringContaining('商人被刺杀')})]);
    for(const viewer of [0,2,3,null])expect(viewCitadels(s,viewer).notifications).toEqual([]);
    expect(viewCitadels(s,0).players[1].roles).toEqual([]);expect(s.events.at(-1)).not.toHaveProperty('target');expect(s.players[1].revealed).toEqual([]);
    expect(module.decisions(run).map(d=>d.actorId)).toEqual(['p0']);expect(legalCitadels(s,1)).toEqual([]);
    expect(prompt).toContain('无需回复');expect(JSON.parse(prompt.split('当前私有观察：')[1]).legalActions).toEqual([]);
    expect(module.notificationPrompt!(run,'p0',before)).toBeNull();expect(module.notificationPrompt!(run,'p1',s.events.length)).toBeNull();
    s=main(s);s=applyCitadels(s,0,{type:'end'});expect(s.called).toBe(8);expect(s.players[1].revealed).toEqual([]);
  });
  it('被选为偷盗目标时尚未扣钱，叫号时再通知实际转移；暗弃身份不通知任何玩家',()=>{
    let s=stage(2);assign(s,1,6);gold(s,1,7);s=applyCitadels(s,0,{type:'steal',role:6});
    const selected=s.events.length;expect(s.players[1].gold).toBe(7);expect(viewCitadels(s,1).notifications.map(n=>n.kind)).toEqual(['steal']);
    s=main(s);s=applyCitadels(s,0,{type:'end'});expect(s.players[1].gold).toBe(0);
    const notice=module.notificationPrompt!(runFor(s),'p1',selected)!;
    const view=JSON.parse(notice.split('当前私有观察：')[1]);expect(view.notifications.map((n:any)=>n.kind)).toEqual(['robbed']);expect(view.notifications[0].text).toContain('7 金币');expect(view.events.every((e:any)=>e.seq>selected)).toBe(true);
    const abandoned=applyCitadels(stage(2),0,{type:'steal',role:6});expect(abandoned.notifications).toEqual([]);
    expect(applyCitadels(stage(1),0,{type:'assassinate',role:6}).notifications).toEqual([]);
  });
  it('换牌只把换后的手牌通知目标；其他人、公开导出和回放看不到私有牌',()=>{
    const before=stage(3),newHand=structuredClone(before.players[0].hand),s=applyCitadels(before,0,{type:'magic_swap',target:1});
    const run=runFor(s),notice=viewCitadels(s,1).notifications[0];expect(notice.hand).toEqual(newHand);expect(s.players[1].hand).toEqual(newHand);
    for(const viewer of [0,2,3,null])expect(viewCitadels(s,viewer).notifications).toEqual([]);
    expect(s.events.at(-1)?.cards).toBeUndefined();expect(JSON.stringify(module.observe(run,null))).not.toContain(newHand[0].id);
    const first=JSON.parse(module.notificationPrompt!(run,'p1',0)!.split('当前私有观察：')[1]);expect(first.events).toEqual(s.events);expect(first.notifications[0].hand).toEqual(newHand);
    const tool=module.handleTool(run,{id:'read',scopeId:run.runId,playerId:'p1',tool:'game_get_state',args:{}}).result.structuredContent as any;expect(tool.notifications).toEqual(viewCitadels(s,1).notifications);expect(tool.events).toEqual(s.events);
    const delta=JSON.parse(module.decisionPrompt(run,{decisionId:'view',actorId:'p1'},s.events.length).split('当前私有观察：')[1]);expect(delta.notifications).toEqual([]);expect(delta.events).toEqual([]);expect(delta.players[1].hand).toEqual(newHand);
    expect(module.restore(structuredClone(s),2)).toEqual(s);expect(()=>module.restore(s,1)).toThrow();
    const empty=stage(3);empty.deck.push(...empty.players[0].hand);empty.players[0].hand=[];expect(viewCitadels(applyCitadels(empty,0,{type:'magic_swap',target:1}),1).notifications[0].hand).toEqual([]);
  });
  it('同一玩家的另一个身份被技能选中时仍能收到自己的通知，跨轮不串给新持有人',()=>{
    let s=stage(1);assign(s,0,6);assign(s,1,8);s=applyCitadels(s,0,{type:'assassinate',role:6});expect(viewCitadels(s,0).notifications).toHaveLength(1);
    s=main(s);s=applyCitadels(s,0,{type:'end'});s=main(s);s=applyCitadels(s,1,{type:'end'});expect(s.round).toBe(2);
    expect(viewCitadels(s,0).notifications[0].round).toBe(1);expect(viewCitadels(s,1).notifications).toEqual([]);
    expect(nextCitadels({...s,phase:'finished'},'next',players(),seeded(9)).notifications).toEqual([]);
  });
});

describe('经典八身份 · 人数与秘密选角',()=>{
  it('只允许 3–7 人，开局 66 张建筑与金币守恒',()=>{
    expect(makeDeck()).toHaveLength(66);expect(()=>createCitadels('bad',players(2))).toThrow('3–7');expect(()=>createCitadels('bad',players(8))).toThrow('3–7');
    for(let n=3;n<=7;n++){const s=createCitadels('init',players(n),{firstCrown:n},seeded(n));expect(s.turn).toBe(n-1);expect(s.players.every(p=>p.hand.length===4&&p.gold===2)).toBe(true);assertCitadels(s);}
    expect(()=>createCitadels('bad',players(3),{firstCrown:4})).toThrow('超出');
  });
  it.each([3,4,5,6,7])('%i 人明弃数量正确，国王永不明弃，身份选取数正确',n=>{
    for(let seed=1;seed<=20;seed++){
      const s=createCitadels('draft',players(n),{firstCrown:1},seeded(seed));expect(s.faceUp.length).toBe(n===4?2:n===5?1:0);expect(s.faceUp).not.toContain(4);
      const next=draft(s);expect(next.players.every(p=>p.roles.length===(n===3?2:1))).toBe(true);expect(next.available).toHaveLength(0);assertCitadels(next);
    }
  });
  it('七人第七位可从初始暗弃牌与最后一张牌中选择',()=>{
    let s=createCitadels('seven',players(7),{firstCrown:1},seeded(8));const hidden=s.faceDown[0];
    for(let i=0;i<6;i++)s=applyCitadels(s,s.turn,legalCitadels(s,s.turn)[0].action);
    expect(s.turn).toBe(6);expect(s.available).toHaveLength(2);expect(s.available).toContain(hidden);
    s=applyCitadels(s,6,{type:'choose',role:hidden});expect(s.players[6].roles).toContain(hidden);assertCitadels(s);
  });
  it('三人按座位选两圈，王冠座位先选，两个身份共用城市与财产',()=>{
    let s=createCitadels('three',players(3),{firstCrown:2},seeded(8));const turns:number[]=[];
    while(s.phase==='draft'){turns.push(s.turn);s=applyCitadels(s,s.turn,legalCitadels(s,s.turn)[0].action);}
    expect(turns).toEqual([1,2,0,1,2,0]);expect(s.players.map(p=>p.roles.length)).toEqual([2,2,2]);
  });
  it('拒绝他人行动、弃牌身份和非法选角，失败不会修改状态',()=>{
    const s=createCitadels('illegal',players(4),{firstCrown:1},seeded(1)),before=structuredClone(s);
    expect(()=>applyCitadels(s,1,{type:'choose',role:s.available[0]})).toThrow('不是你的');
    expect(()=>applyCitadels(s,0,{type:'choose',role:s.faceDown[0]})).toThrow('候选');
    expect(()=>applyCitadels(s,0,{type:'build',card:s.players[0].hand[0].id})).toThrow('选角');expect(s).toEqual(before);
  });
  it('观察与公开事件不泄漏对方手牌、未叫身份、暗弃牌与牌库顺序',()=>{
    let s=createCitadels('private',players(4),{firstCrown:1},seeded(2));const selected=s.available[0];s=applyCitadels(s,0,{type:'choose',role:selected});
    const own=viewCitadels(s,0),other=viewCitadels(s,1),publicView=viewCitadels(s,null),spectator=viewCitadels(s,null,true);
    expect(own.players[0].hand).toHaveLength(4);expect(other.players[0].hand).toBeUndefined();expect(other.players[0].roles).toEqual([]);expect(own.players[0].roles).toEqual([selected]);
    expect(own.available).toEqual([]);expect(other.available.length).toBeGreaterThan(0);expect(publicView.available).toEqual([]);expect(spectator.players[0].hand).toHaveLength(4);
    expect('deck' in other).toBe(false);expect('rng' in other).toBe(false);expect('faceDown' in other).toBe(false);expect(s.events.every(e=>!e.cards?.length)).toBe(true);
  });
});
describe('收入、身份时序与建筑约束',()=>{
  it('必须收入再建造，每回合只能收入一次且普通身份最多建一座',()=>{
    let s=stage(4);gold(s,0,10);const c=hand(s,0,'tavern'),other=hand(s,0,'temple');
    expect(()=>applyCitadels(s,0,{type:'build',card:c.id})).toThrow('先完成');expect(()=>applyCitadels(s,0,{type:'end'})).toThrow('先完成');
    s=main(s);expect(()=>applyCitadels(s,0,{type:'income',source:'cards'})).toThrow('一次');s=applyCitadels(s,0,{type:'build',card:c.id});
    expect(()=>applyCitadels(s,0,{type:'build',card:other.id})).toThrow('次数');assertCitadels(s);
  });
  it('不能透支或建同名建筑，不因堡垒有两张而允许同城重复',()=>{
    let s=stage(4);city(s,0,['keep']);const same=hand(s,0,'keep'),expensive=hand(s,0,'palace');gold(s,0,0);s=main(s);
    expect(()=>applyCitadels(s,0,{type:'build',card:same.id})).toThrow('同名');expect(()=>applyCitadels(s,0,{type:'build',card:expensive.id})).toThrow('金币');
  });
  it('普通抽二留一只暴露给本人，退牌回到底部，禁止重复或外部牌',()=>{
    let s=stage(4);s=applyCitadels(s,0,{type:'income',source:'cards'});const pending=[...s.pendingCards],kept=pending[0];
    expect(viewCitadels(s,1).pendingCards).toEqual([]);expect(viewCitadels(s,null).events.at(-1)?.cards).toBeUndefined();
    expect(()=>applyCitadels(s,0,{type:'keep',cards:[kept.id,kept.id]})).toThrow();expect(()=>applyCitadels(s,0,{type:'keep',cards:[s.players[0].hand[0].id]})).toThrow();
    s=applyCitadels(s,0,{type:'keep',cards:[kept.id]});expect(s.players[0].hand).toContainEqual(kept);expect(s.deck.at(-1)).toEqual(pending[1]);expect(s.collected).toBe(true);
  });
  it('刺客可在收入前使用；被刺杀者跳过且叫号时不公开持有人',()=>{
    let s=stage(1);assign(s,1,6);assign(s,2,8);s=applyCitadels(s,0,{type:'assassinate',role:6});expect(()=>applyCitadels(s,0,{type:'assassinate',role:7})).toThrow();
    s=main(s);s=applyCitadels(s,0,{type:'end'});expect(s.called).toBe(8);expect(s.turn).toBe(2);expect(s.players[1].revealed).toEqual([]);expect(s.players[1].gold).toBe(2);
    expect(s.events.filter(e=>e.role===6).at(-1)?.seat).toBeUndefined();
  });
  it('盗贼先取走目标现有金币，目标之后才收入，不能偷刺客和被杀身份',()=>{
    let s=stage(2);assign(s,1,6);gold(s,1,7);s.assassinated=5;
    expect(()=>applyCitadels(s,0,{type:'steal',role:1})).toThrow();expect(()=>applyCitadels(s,0,{type:'steal',role:5})).toThrow();
    s=applyCitadels(s,0,{type:'steal',role:6});s=main(s);s=applyCitadels(s,0,{type:'end'});expect(s.called).toBe(6);expect(s.players[0].gold).toBe(11);expect(s.players[1].gold).toBe(0);
    s=main(s);expect(s.players[1].gold).toBe(3);assertCitadels(s);
  });
  it('被刺杀的国王到轮末才继承王冠，下一轮从新王冠开始选角',()=>{
    let s=stage(1);assign(s,1,4);assign(s,2,8);s=applyCitadels(s,0,{type:'assassinate',role:4});s=main(s);s=applyCitadels(s,0,{type:'end'});expect(s.crown).toBe(0);expect(s.called).toBe(8);
    s=main(s);s=applyCitadels(s,2,{type:'end'});expect(s.round).toBe(2);expect(s.crown).toBe(1);expect(s.turn).toBe(1);expect(s.events.some(e=>e.text.includes('轮末继承'))).toBe(true);
  });
  it('税收可建造后一次领取，魔法学校参与收入而不改变建筑颜色',()=>{
    let s=stage(4);city(s,0,['school-of-magic','manor']);gold(s,0,10);const c=hand(s,0,'castle');s=main(s);s=applyCitadels(s,0,{type:'build',card:c.id});const before=s.players[0].gold;s=applyCitadels(s,0,{type:'tax'});expect(s.players[0].gold-before).toBe(3);expect(()=>applyCitadels(s,0,{type:'tax'})).toThrow('再次');expect(district(s.players[0].city[0]).color).toBe('purple');
  });
  it('魔术师允许以空手交换整手牌，或指定任意子集置底重抽，内容保持私密',()=>{
    let s=stage(3);s.deck.push(...s.players[0].hand);s.players[0].hand=[];const other=[...s.players[1].hand];
    s=applyCitadels(s,0,{type:'magic_swap',target:1});expect(s.players[0].hand).toEqual(other);expect(s.players[1].hand).toEqual([]);expect(s.events.at(-1)?.cards).toBeUndefined();
    expect(()=>applyCitadels(s,0,{type:'magic_cycle',cards:[]})).toThrow('不可用');
    s=stage(3);const ids=s.players[0].hand.slice(0,2).map(c=>c.id),top=s.deck.slice(0,2);s=applyCitadels(s,0,{type:'magic_cycle',cards:ids});expect(s.players[0].hand.slice(-2)).toEqual(top);expect(s.deck.slice(-2).map(c=>c.id)).toEqual(ids);assertCitadels(s);
  });
  it('建筑师抽牌收入完成后额外取两张，最多建三座并允许超过八座',()=>{
    let s=stage(7);gold(s,0,50);city(s,0,['manor','castle','palace','church','monastery','cathedral','harbor']);const cs=['temple','tavern','market','prison'].map(k=>hand(s,0,k)),initial=s.players[0].hand.length;
    s=applyCitadels(s,0,{type:'income',source:'cards'});expect(s.players[0].hand).toHaveLength(initial);s=applyCitadels(s,0,{type:'keep',cards:[s.pendingCards[0].id]});expect(s.players[0].hand).toHaveLength(initial+3);
    for(const c of cs.slice(0,3))s=applyCitadels(s,0,{type:'build',card:c.id});expect(s.players[0].city).toHaveLength(10);expect(s.firstCompleted).toBe(0);expect(s.phase).toBe('main');expect(()=>applyCitadels(s,0,{type:'build',card:cs[3].id})).toThrow('次数');
  });
});
describe('特殊建筑、军阀与终局',()=>{
  it('天文台与图书馆组合抽三留二；单独图书馆保留两张',()=>{
    let s=stage();city(s,0,['library','observatory']);let count=s.players[0].hand.length;s=applyCitadels(s,0,{type:'income',source:'cards'});expect(s.pendingCards).toHaveLength(3);expect(s.keepCount).toBe(2);s=applyCitadels(s,0,legalCitadels(s,0)[0].action);expect(s.players[0].hand).toHaveLength(count+2);
    s=stage();city(s,0,['library']);count=s.players[0].hand.length;s=applyCitadels(s,0,{type:'income',source:'cards'});expect(s.phase).toBe('main');expect(s.players[0].hand).toHaveLength(count+2);
  });
  it('实验室与铁匠铺每个身份回合各一次，金币和牌守恒',()=>{
    let s=stage();city(s,0,['laboratory','smithy']);gold(s,0,2);const c=s.players[0].hand[0];s=applyCitadels(s,0,{type:'laboratory',card:c.id});expect(s.players[0].gold).toBe(3);expect(s.deck.at(-1)).toEqual(c);expect(()=>applyCitadels(s,0,{type:'laboratory',card:s.players[0].hand[0].id})).toThrow();
    const count=s.players[0].hand.length;s=applyCitadels(s,0,{type:'smithy'});expect(s.players[0].gold).toBe(1);expect(s.players[0].hand).toHaveLength(count+3);expect(()=>applyCitadels(s,0,{type:'smithy'})).toThrow();assertCitadels(s);
  });
  it('军阀费用为造价减一，长城只保护其他建筑，大学/龙门不按 8 分收费',()=>{
    let s=stage(8);city(s,1,['great-wall','temple','university','dragon-gate']);gold(s,0,10);s=main(s);
    const legal=legalCitadels(s,0);expect(legal.find(a=>a.id.includes('great-wall'))?.label).toContain('5 金币');expect(legal.find(a=>a.id.includes('temple'))?.label).toContain('1 金币');expect(legal.find(a=>a.id.includes('university'))?.label).toContain('6 金币');
    const c=s.players[1].city.find(c=>c.key==='temple')!;s=applyCitadels(s,0,{type:'destroy',target:1,card:c.id});expect(s.players[1].city.some(c=>c.key==='temple')).toBe(false);expect(s.round).toBe(2);expect(s.players[0].gold).toBe(11);
  });
  it('堡垒、完工城市和活着的主教都不可拆；被杀主教失去保护',()=>{
    let s=stage(8);assign(s,1,5);city(s,1,['temple']);city(s,2,['keep']);city(s,3,['manor','castle','palace','temple','church','monastery','cathedral','tavern']);gold(s,0,20);s=main(s);
    expect(legalCitadels(s,0).filter(a=>a.action.type==='destroy')).toEqual([]);const c=s.players[1].city[0];expect(()=>applyCitadels(s,0,{type:'destroy',target:1,card:c.id})).toThrow('主教');
    s.assassinated=5;expect(legalCitadels(s,0).some(a=>a.id===`destroy:1:${c.id}`)).toBe(true);
  });
  it('墓地反应是独立决策，付一金币收入手牌而非重新建造',()=>{
    let s=stage(8);city(s,1,['graveyard']);city(s,2,['temple']);gold(s,0,10);gold(s,1,3);s=main(s);const c=s.players[2].city[0];s=applyCitadels(s,0,{type:'destroy',target:2,card:c.id});
    expect(s.phase).toBe('graveyard');expect(s.turn).toBe(1);expect(()=>applyCitadels(s,0,{type:'end'})).toThrow();s=applyCitadels(s,1,{type:'recover',take:true});expect(s.players[1].gold).toBe(2);expect(s.players[1].hand.some(d=>d.id===c.id)).toBe(true);expect(s.players[2].city).toEqual([]);assertCitadels(s);
  });
  it('墓地不能救自身，军阀本人不能使用墓地；放弃时牌回库底',()=>{
    let s=stage(8);city(s,1,['graveyard']);gold(s,0,10);s=main(s);s=applyCitadels(s,0,{type:'destroy',target:1,card:s.players[1].city[0].id});expect(s.phase).toBe('draft');
    s=stage(8);city(s,0,['graveyard']);city(s,1,['temple']);gold(s,0,10);s=main(s);s=applyCitadels(s,0,{type:'destroy',target:1,card:s.players[1].city[0].id});expect(s.phase).toBe('draft');
    s=stage(8);city(s,1,['graveyard']);city(s,2,['temple']);gold(s,0,10);s=main(s);const c=s.players[2].city[0];s=applyCitadels(s,0,{type:'destroy',target:2,card:c.id});s=applyCitadels(s,1,{type:'recover',take:false});expect(s.deck.at(-1)?.id).toBe(c.id);
  });
  it('鬼城只能算一种颜色且最后一轮不变色；大学龙门各额外 2 分',()=>{
    const s=stage();s.round=3;city(s,0,['manor','temple','market','keep','haunted-city','university','dragon-gate'],1);let sc=scoreCitadels(s)[0];expect(sc.colors).toBe(3);expect(sc.hauntedColor).toBe('red');expect(sc.special).toBe(4);
    s.players[0].city.find(c=>c.key==='haunted-city')!.builtRound=3;expect(scoreCitadels(s)[0].colors).toBe(0);
    const only=stage();only.round=2;city(only,0,['manor','temple','market','haunted-city'],1);expect(scoreCitadels(only)[0].colors).toBe(0);
  });
  it('八建筑后继续剩余身份，末尾计分，局间继承累计分数并旋转王冠',()=>{
    let s=stage(7);assign(s,1,8);city(s,0,['manor','castle','palace','church','monastery','cathedral','harbor']);gold(s,0,20);const c=hand(s,0,'temple');s=main(s);s=applyCitadels(s,0,{type:'build',card:c.id});s=applyCitadels(s,0,{type:'end'});
    expect(s.phase).toBe('income');expect(s.called).toBe(8);expect(s.scores).toBeNull();s=main(s);s=applyCitadels(s,1,{type:'end'});expect(s.phase).toBe('finished');expect(s.scores![0].completion).toBe(4);expect(s.players[0].totalScore).toBe(s.scores![0].total);
    const next=nextCitadels(s,'next',players(),seeded(8));expect(next.crown).toBe(1);expect(next.players[0].totalScore).toBe(s.players[0].totalScore);expect(next.players.every(p=>p.gold===2&&p.city.length===0)).toBe(true);assertCitadels(next);
  });
  it('完全同分、建筑费用与金币相同则共享胜利；其他完工者奖励 2 分',()=>{
    let s=stage(8);city(s,0,['manor','castle','palace','temple','church','monastery','cathedral','tavern']);city(s,1,['manor','castle','palace','temple','church','monastery','cathedral','tavern']);s.firstCompleted=2;
    s=main(s);gold(s,1,s.players[0].gold);s=applyCitadels(s,0,{type:'end'});expect(s.scores![0].completion).toBe(2);expect(s.scores![1].completion).toBe(2);expect(s.winners).toEqual([0,1]);
  });
  it('牌库将尽时只抽实际余牌，不复制建筑；金币供应不阻断正常收入',()=>{
    let s=stage(7);s.players[2].hand.push(...s.deck.splice(1));gold(s,0,100);s=applyCitadels(s,0,{type:'income',source:'cards'});expect(s.deck).toHaveLength(0);expect(s.phase).toBe('main');expect(s.players[0].hand).toHaveLength(5);assertCitadels(s);
  });
});
describe('完整合法对局的结束性与守恒',()=>{
  it.each([3,4,5,6,7])('%i 人各十局：选角、收入、技能、建造与结算都能走完',n=>{
    for(let seed=1;seed<=10;seed++){
      const rnd=seeded(seed*31+n);let s=createCitadels(`full-${n}-${seed}`,players(n),{firstCrown:1},rnd),moves=0;
      while(s.phase!=='finished'&&moves++<3000){
        const legal=legalCitadels(s,s.turn),p=s.players[s.turn];expect(legal.length).toBeGreaterThan(0);
        let choice=legal[Math.floor(rnd()*legal.length)];
        if(s.phase==='income')choice=legal.find(a=>a.id===(p.hand.some(c=>district(c).cost<=p.gold+2&&!p.city.some(d=>d.key===c.key))||p.gold<6?'income:gold':'income:cards'))!;
        if(s.phase==='main')choice=legal.find(a=>a.id==='tax')??legal.find(a=>a.group==='建造')??legal.find(a=>a.id==='end')!;
        s=applyCitadels(s,s.turn,choice.action);
      }
      expect(s.phase).toBe('finished');expect(s.round).toBeLessThan(100);expect(s.scores!.every(sc=>sc.total>=0)).toBe(true);expect(s.winners.length).toBeGreaterThan(0);assertCitadels(s);
    }
  },20000);
});
