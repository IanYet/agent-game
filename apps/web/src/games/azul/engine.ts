export const COLORS = ['blue','yellow','red','black','white'] as const;
export type Color = typeof COLORS[number];
export type FloorToken = Color|'first';
export const COLOR_NAMES:Record<Color,string> = {blue:'青花蓝',yellow:'鎏金黄',red:'朱砂红',black:'墨纹黑',white:'雪花白'};
export const FLOOR_PENALTIES = [1,1,2,2,2,3,3];
export interface AzulPlayer {
  playerId:string; name:string; kind:'human'|'agent'; seat:number;
  score:number; totalScore:number; wins:number; wallPoints:number; floorLoss:number;
  pattern:Color[][]; wall:(Color|null)[][]; floor:FloorToken[];
}
export interface AzulAction { source:number; color:Color; row:number }
export interface LegalAction { id:string; label:string; action:AzulAction; count:number; placed:number; overflow:number; takesFirst:boolean; floorCost:number }
export interface AzulEvent {
  seq:number; time:string; round:number; kind:'round'|'draft'|'wall'|'floor'|'finish'; text:string; seat?:number;
  factories?:Color[][]; turn?:number; action?:AzulAction; count?:number; placed?:number; overflow?:number;
  takesFirst?:boolean; moved?:Color[]; color?:Color; row?:number; col?:number; points?:number; penalty?:number;
  bonuses?:Array<{rows:number;columns:number;colors:number;points:number}>; winners?:number[];
}
export interface AzulResult { winners:number[]; bonuses:Array<{rows:number;columns:number;colors:number;points:number}> }
export interface AzulState {
  gameId:'azul'; id:string; match:number; createdAt:string; revision:number; phase:'draft'|'finished'; round:number; turn:number;
  roundStarter:number; firstOwner:number|null; markerInCenter:boolean; players:AzulPlayer[];
  factories:Color[][]; center:Color[]; bag:Color[]; discard:Color[]; rng:number; events:AzulEvent[]; result:AzulResult|null;
}
export interface AzulFrame {round:number;turn:number;phase:'draft'|'finished';factories:Color[][];center:Color[];markerInCenter:boolean;firstOwner:number|null;players:AzulPlayer[]}
export type AzulView = AzulFrame & {id:string;match:number;createdAt:string;revision:number;viewer:number|null;bagCount:number;discardCounts:Record<Color,number>;events:AzulEvent[];legalActions:LegalAction[];result:AzulResult|null};
export const RULES_URL='https://cdn.svc.asmodee.net/production-nextmove/uploads/sites/4/2024/06/EN-Azul-Rules-Next-Move-web.pdf';
export const AZUL_RULES=`采用 Next Move / Plan B 原版标准有色墙规则（2018 规则书，发行商 2024 年发布的 PDF），2–4 人；不含灰墙或扩展。2／3／4 人使用 5／7／9 个工厂盘。共 100 片花砖，五种颜色各 20 片。首局随机先手，以后每轮由拿到先手标记的人开始；座位按顺时针轮转。
每回合从一个工厂盘或中央区拿走某一颜色的全部花砖。工厂盘剩余颜色全部流入中央。第一次从中央拿砖时，同时拿先手标记，先放入地板最左空格；地板已满则放在旁边，仍取得下一轮先手。不能只拿先手标记。
拿到的花砖必须放进同一条图案行，或全部放地板。五行容量依次为 1–5；已有砖的行只收同色，已满的行不可选，对应墙行已有该颜色也不可选。装满后多出的砖落地板，不可拆到其他行。允许不同图案行同时收同一种颜色。地板从左到右最多七格，再溢出的砖直接进入回收盒。
工厂盘和中央的彩砖取空后，所有玩家从上到下结算完整图案行：移一片到对应墙行的固定同色格，剩余花砖进回收盒；未满的图案行保留到下一轮。新铺砖无邻接得 1 分；若横向／纵向存在连续相邻砖，分别计算包含新砖的连续长度，两方向均连通时相加。
随后按地板格依次扣 1、1、2、2、2、3、3 分，先手标记也扣分；分数最低为 0。清空地板，彩砖进回收盒，先手标记回中央。每个工厂盘随机补 4 片；袋空时用回收盒重装，仍不足则按现有数量开轮。
任意玩家墙面完成一条五格横行时，在该轮所有玩家铺墙及扣分后终局。每条完整横行额外 +2，每条完整竖列 +7，每种集齐五片的颜色 +10。最高分获胜；同分比较完整横行数量，仍同则共享胜利。
同桌下一局重新洗入全部花砖、分数从零开始，按稳定玩家身份保留累计得分和胜场，上一局先手座位顺延；可在开始前调整人数与玩家。花砖、图案行、墙面、地板和完整事件均公开；袋内顺序和随机状态不对任何玩家或观众公开。`;

const clone=<T,>(value:T):T=>structuredClone(value);
const isColor=(value:unknown):value is Color=>COLORS.includes(value as Color);
export function wallColor(row:number,col:number):Color { return COLORS[(col-row+5)%5]; }
export function wallColumn(row:number,color:Color){return (COLORS.indexOf(color)+row)%5;}
const emptyBoard=()=>({pattern:Array.from({length:5},()=>[] as Color[]),wall:Array.from({length:5},()=>Array(5).fill(null) as (Color|null)[]),floor:[] as FloorToken[]});
function random(state:AzulState){let n=state.rng;n^=n<<13;n^=n>>>17;n^=n<<5;state.rng=n>>>0;return state.rng/4294967296;}
function shuffle(state:AzulState,tiles:Color[]){for(let i=tiles.length-1;i>0;i--){const j=Math.floor(random(state)*(i+1));[tiles[i],tiles[j]]=[tiles[j],tiles[i]];}}
function emit(state:AzulState,event:Omit<AzulEvent,'seq'|'time'|'round'>){state.events.push({...event,seq:state.events.length+1,time:new Date().toISOString(),round:state.round});}
function deal(state:AzulState){
  state.factories=Array.from({length:state.players.length*2+1},()=>[]);
  for(const factory of state.factories)for(let i=0;i<4;i++){
    if(!state.bag.length&&state.discard.length){state.bag=state.discard;state.discard=[];shuffle(state,state.bag);}
    const tile=state.bag.pop();if(tile)factory.push(tile);
  }
  emit(state,{kind:'round',factories:clone(state.factories),turn:state.turn,text:`第 ${state.round} 轮开盘，${state.players[state.turn].name} 先选砖。`});
}
export function createAzul(id:string,roster:Array<{playerId:string;name:string;kind:'human'|'agent'}>,rng:()=>number,match=1,previous?:AzulState):AzulState {
  if(roster.length<2||roster.length>4||new Set(roster.map(p=>p.playerId)).size!==roster.length)throw new Error('花砖物语需要 2–4 位身份不同的玩家');
  if(previous&&previous.phase!=='finished')throw new Error('请先完成当前局');
  const seed=Math.floor(rng()*4294967296)>>>0;
  const starter=previous?(previous.roundStarter+1)%roster.length:Math.floor(rng()*roster.length);
  const state:AzulState={gameId:'azul',id,match,createdAt:new Date().toISOString(),revision:1,phase:'draft',round:1,turn:starter,roundStarter:starter,firstOwner:null,markerInCenter:true,
    players:roster.map((p,seat)=>{const prior=previous?.players.find(q=>q.playerId===p.playerId);return {...p,seat,score:0,totalScore:prior?.totalScore??0,wins:prior?.wins??0,wallPoints:0,floorLoss:0,...emptyBoard()};}),
    factories:[],center:[],bag:COLORS.flatMap(c=>Array(20).fill(c)),discard:[],rng:seed||0x9e3779b9,events:[],result:null};
  shuffle(state,state.bag);deal(state);assertAzul(state);return state;
}
export function placementAllowed(player:AzulPlayer,color:Color,row:number){return row===0||(Number.isInteger(row)&&row>=1&&row<=5&&player.pattern[row-1].length<row&&(!player.pattern[row-1].length||player.pattern[row-1][0]===color)&&!player.wall[row-1].includes(color));}
function draftChoice(state:AzulState,action:AzulAction,count:number):LegalAction {
  const {source,color,row}=action,player=state.players[state.turn],takesFirst=source===0&&state.markerInCenter;
  const placed=row?Math.min(count,row-player.pattern[row-1].length):0,overflow=count-placed;
  const floorCost=FLOOR_PENALTIES.slice(player.floor.length,Math.min(7,player.floor.length+overflow+(takesFirst?1:0))).reduce((s,n)=>s+n,0);
  return {id:`${source}:${color}:${row}`,label:`${source?`工厂 ${source}`:'中央'} · ${COLOR_NAMES[color]} ×${count} → ${row?`图案行 ${row}`:'地板'}${overflow?`（落地 ${overflow}）`:''}`,action,count,placed,overflow,takesFirst,floorCost};
}
export function legalActions(state:AzulState,seat:number):LegalAction[]{
  if(state.phase!=='draft'||seat!==state.turn||!state.players[seat])return [];
  const player=state.players[seat],actions:LegalAction[]=[];
  [state.center,...state.factories].forEach((tiles,source)=>COLORS.forEach(color=>{
    const count=tiles.filter(c=>c===color).length;if(!count)return;
    for(let row=0;row<=5;row++)if(placementAllowed(player,color,row)){
      actions.push(draftChoice(state,{source,color,row},count));
    }
  }));return actions;
}
export function adjacentScore(wall:(Color|null)[][],row:number,col:number){
  const count=(dr:number,dc:number)=>{let n=0,r=row+dr,c=col+dc;while(r>=0&&r<5&&c>=0&&c<5&&wall[r][c]){n++;r+=dr;c+=dc;}return n;};
  const horizontal=1+count(0,-1)+count(0,1),vertical=1+count(-1,0)+count(1,0);
  return horizontal===1&&vertical===1?1:(horizontal>1?horizontal:0)+(vertical>1?vertical:0);
}
export function bonuses(player:AzulPlayer){
  const rows=player.wall.filter(row=>row.every(Boolean)).length;
  const columns=Array.from({length:5},(_,col)=>player.wall.every(row=>!!row[col])).filter(Boolean).length;
  const colors=COLORS.filter(color=>player.wall.every(row=>row.includes(color))).length;
  return {rows,columns,colors,points:rows*2+columns*7+colors*10};
}
function putOnFloor(state:AzulState,player:AzulPlayer,token:FloorToken){if(player.floor.length<7)player.floor.push(token);else if(token!=='first')state.discard.push(token);}
function settle(state:AzulState){
  for(const player of state.players){
    player.pattern.forEach((tiles,row)=>{
      if(tiles.length!==row+1)return;
      const color=tiles[0],col=wallColumn(row,color);player.wall[row][col]=color;
      const points=adjacentScore(player.wall,row,col);player.score+=points;player.wallPoints+=points;
      state.discard.push(...tiles.slice(1));player.pattern[row]=[];
      emit(state,{kind:'wall',seat:player.seat,color,row,col,points,text:`图案行 ${row+1} 铺入${COLOR_NAMES[color]}，相邻连续计分 +${points}。`});
    });
    const penalty=FLOOR_PENALTIES.slice(0,player.floor.length).reduce((s,n)=>s+n,0),loss=Math.min(player.score,penalty);
    player.score-=loss;player.floorLoss+=loss;state.discard.push(...player.floor.filter(isColor));player.floor=[];
    emit(state,{kind:'floor',seat:player.seat,penalty,points:-loss,text:`地板扣分 ${penalty}，实际扣 ${loss} 分，本轮后 ${player.score} 分。`});
  }
  if(state.players.some(p=>bonuses(p).rows>0)){
    const awards=state.players.map(bonuses);state.players.forEach((p,i)=>p.score+=awards[i].points);
    const highest=Math.max(...state.players.map(p=>p.score));
    const mostRows=Math.max(...state.players.filter(p=>p.score===highest).map(p=>bonuses(p).rows));
    const winners=state.players.filter(p=>p.score===highest&&bonuses(p).rows===mostRows).map(p=>p.seat);
    state.players.forEach(p=>{p.totalScore+=p.score;if(winners.includes(p.seat))p.wins++;});
    state.phase='finished';state.result={winners,bonuses:awards};
    emit(state,{kind:'finish',bonuses:awards,winners,text:`终局奖励已加入总分。${winners.map(s=>state.players[s].name).join('、')}${winners.length>1?'共享胜利':'获胜'}。`});
  }else{
    state.round++;state.turn=state.firstOwner??state.roundStarter;state.roundStarter=state.turn;
    state.firstOwner=null;state.markerInCenter=true;deal(state);
  }
}
export function applyAzul(state:AzulState,seat:number,input:unknown):AzulState {
  if(state.phase!=='draft')throw new Error('本局已结束，不能再选砖');
  if(!Number.isInteger(seat)||!state.players[seat]||seat!==state.turn)throw new Error('当前不是你的选砖回合');
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('请选择来源、颜色与目的行');
  const action=input as AzulAction;
  if(Object.keys(action).some(k=>!['source','color','row'].includes(k)))throw new Error('选砖只填写 source、color 和 row');
  if(!Number.isInteger(action.source)||action.source<0||action.source>state.factories.length)throw new Error(`来源 source 须为 0（中央）至 ${state.factories.length}（工厂）`);
  if(!isColor(action.color))throw new Error('颜色 color 须为 blue、yellow、red、black 或 white');
  if(!Number.isInteger(action.row)||action.row<0||action.row>5)throw new Error('目的行 row 须为 0（地板）或 1–5（图案行）');
  const count=(action.source?state.factories[action.source-1]:state.center).filter(c=>c===action.color).length;
  if(!count)throw new Error(`来源 ${action.source} 没有${COLOR_NAMES[action.color]}，请选择该来源实际存在的颜色`);
  if(action.row){
    const player=state.players[seat],line=player.pattern[action.row-1];
    if(line.length===action.row)throw new Error(`图案行 ${action.row} 已满，请选择其他行或地板`);
    if(line.length&&line[0]!==action.color)throw new Error(`图案行 ${action.row} 只收同色${COLOR_NAMES[line[0]]}`);
    if(player.wall[action.row-1].includes(action.color))throw new Error(`墙面第 ${action.row} 行已有${COLOR_NAMES[action.color]}，该图案行不能再收此色`);
  }
  const chosen=draftChoice(state,action,count);
  const next=clone(state),player=next.players[seat],tiles=action.source?next.factories[action.source-1]:next.center;
  const picked=tiles.filter(c=>c===action.color),remaining=tiles.filter(c=>c!==action.color);
  if(action.source){next.factories[action.source-1]=[];next.center.push(...remaining);}else next.center=remaining;
  if(chosen.takesFirst){next.markerInCenter=false;next.firstOwner=seat;putOnFloor(next,player,'first');}
  if(action.row)player.pattern[action.row-1].push(...picked.slice(0,chosen.placed));
  picked.slice(chosen.placed).forEach(c=>putOnFloor(next,player,c));
  next.turn=(seat+1)%next.players.length;next.revision++;
  emit(next,{kind:'draft',seat,action:clone(action),count:chosen.count,placed:chosen.placed,overflow:chosen.overflow,takesFirst:chosen.takesFirst,moved:action.source?remaining:[],turn:next.turn,text:`${chosen.label}${chosen.takesFirst?'；取得先手标记':''}${action.source&&remaining.length?`；${remaining.length} 片余砖流入中央`:''}。`});
  if(!next.center.length&&next.factories.every(f=>!f.length))settle(next);
  assertAzul(next);return next;
}
export function viewAzul(state:AzulState,viewer:number|null,includeActions=true):AzulView {
  return clone({id:state.id,match:state.match,createdAt:state.createdAt,revision:state.revision,phase:state.phase,round:state.round,turn:state.turn,
    firstOwner:state.firstOwner,markerInCenter:state.markerInCenter,players:state.players,factories:state.factories,center:state.center,
    viewer,bagCount:state.bag.length,discardCounts:Object.fromEntries(COLORS.map(c=>[c,state.discard.filter(t=>t===c).length])) as Record<Color,number>,events:state.events,legalActions:viewer===null||!includeActions?[]:legalActions(state,viewer),result:state.result});
}
export function replayAzul(state:AzulState,count:number):AzulFrame {
  const frame:AzulFrame={round:1,turn:0,phase:'draft',factories:[],center:[],markerInCenter:true,firstOwner:null,players:state.players.map(p=>({...p,score:0,...emptyBoard()}))};
  for(const event of state.events.slice(0,count)){
    frame.round=event.round;const p=event.seat===undefined?undefined:frame.players[event.seat];
    if(event.kind==='round'){frame.factories=clone(event.factories!);frame.center=[];frame.turn=event.turn!;frame.markerInCenter=true;frame.firstOwner=null;}
    if(event.kind==='draft'&&p){const a=event.action!;
      if(a.source){frame.factories[a.source-1]=[];frame.center.push(...event.moved!);}else frame.center=frame.center.filter(c=>c!==a.color);
      if(event.takesFirst){frame.markerInCenter=false;frame.firstOwner=p.seat;if(p.floor.length<7)p.floor.push('first');}
      if(a.row)p.pattern[a.row-1].push(...Array(event.placed!).fill(a.color));
      p.floor.push(...Array(Math.min(event.overflow!,7-p.floor.length)).fill(a.color));frame.turn=event.turn!;
    }
    if(event.kind==='wall'&&p){p.pattern[event.row!]=[];p.wall[event.row!][event.col!]=event.color!;p.score+=event.points!;}
    if(event.kind==='floor'&&p){p.floor=[];p.score+=event.points!;}
    if(event.kind==='finish'){frame.phase='finished';frame.players.forEach((p,i)=>p.score+=event.bonuses![i].points);}
  }return frame;
}
export function assertAzul(value:unknown):asserts value is AzulState {
  const s=value as AzulState;
  if(!s||s.gameId!=='azul'||!['draft','finished'].includes(s.phase)||!Array.isArray(s.players)||s.players.length<2||s.players.length>4||!Number.isInteger(s.turn)||s.turn<0||s.turn>=s.players.length||!Number.isInteger(s.revision)||s.revision<1||!Number.isInteger(s.round)||s.round<1||!Number.isInteger(s.rng)||s.rng<=0||s.rng>4294967295)throw new Error('花砖物语存档结构无效');
  if(!Array.isArray(s.factories)||s.factories.length!==s.players.length*2+1||s.factories.some(f=>!Array.isArray(f)||f.length>4)||!Array.isArray(s.bag)||!Array.isArray(s.discard)||!Array.isArray(s.center))throw new Error('花砖来源结构无效');
  if(typeof s.markerInCenter!=='boolean'||(s.firstOwner!==null&&(!Number.isInteger(s.firstOwner)||!s.players[s.firstOwner]))||s.markerInCenter!==(s.firstOwner===null))throw new Error('先手标记状态无效');
  const tiles:unknown[]=[...s.bag,...s.discard,...s.center,...s.factories.flat()];let markers=0;
  if(new Set(s.players.map(p=>p.playerId)).size!==s.players.length)throw new Error('玩家身份重复');
  s.players.forEach((p,i)=>{
    if(p.seat!==i||!p.playerId||!Number.isInteger(p.score)||p.score<0||!Number.isInteger(p.totalScore)||p.totalScore<0||!Number.isInteger(p.wins)||p.wins<0||!Array.isArray(p.pattern)||p.pattern.length!==5||!Array.isArray(p.wall)||p.wall.length!==5||!Array.isArray(p.floor)||p.floor.length>7)throw new Error('玩家花砖板无效');
    p.pattern.forEach((r,i)=>{if(!Array.isArray(r)||r.length>i+1||r.some(c=>c!==r[0])||r.some(c=>!isColor(c))||(r.length&&p.wall[i].includes(r[0])))throw new Error('图案行不符合颜色或容量限制');tiles.push(...r);});
    p.wall.forEach((r,i)=>{if(!Array.isArray(r)||r.length!==5||r.some((c,j)=>c!==null&&c!==wallColor(i,j)))throw new Error('墙面颜色位置无效');tiles.push(...r.filter(c=>c!==null));});
    p.floor.forEach(c=>{if(c==='first'){markers++;if(s.firstOwner!==i)throw new Error('先手标记归属无效');}else tiles.push(c);});
  });
  if(markers>1||tiles.some(c=>!isColor(c))||COLORS.some(c=>tiles.filter(t=>t===c).length!==20))throw new Error('花砖资源不守恒：每种颜色必须恰好 20 片');
  if(!Array.isArray(s.events)||!s.events.length||s.events.some((e,i)=>e.seq!==i+1||!['round','draft','wall','floor','finish'].includes(e.kind)))throw new Error('公开记录无效');
  if(s.phase==='finished'?!s.result||!s.players.some(p=>bonuses(p).rows>0):s.result!==null||(!s.center.length&&s.factories.every(f=>!f.length)))throw new Error('对局阶段无效');
}
export function restoreAzul(value:unknown):AzulState {
  assertAzul(value);const s=value,frame=replayAzul(s,s.events.length);
  const board=(p:AzulPlayer)=>({score:p.score,wall:p.wall,pattern:p.pattern,floor:p.floor});
  if(s.revision!==1+s.events.filter(e=>e.kind==='draft').length||frame.round!==s.round||frame.turn!==s.turn||frame.phase!==s.phase||frame.markerInCenter!==s.markerInCenter||frame.firstOwner!==s.firstOwner||JSON.stringify(frame.factories)!==JSON.stringify(s.factories)||JSON.stringify(frame.center)!==JSON.stringify(s.center)||JSON.stringify(frame.players.map(board))!==JSON.stringify(s.players.map(board)))throw new Error('公开记录与花砖局面不一致，无法恢复');
  if(s.result){
    const awards=s.players.map(bonuses),max=Math.max(...s.players.map(p=>p.score)),rows=Math.max(...s.players.filter(p=>p.score===max).map(p=>bonuses(p).rows));
    const winners=s.players.filter(p=>p.score===max&&bonuses(p).rows===rows).map(p=>p.seat);
    if(JSON.stringify(s.result.bonuses)!==JSON.stringify(awards)||JSON.stringify(s.result.winners)!==JSON.stringify(winners))throw new Error('终局奖励或胜负与墙面不一致');
  }
  return clone(s);
}
