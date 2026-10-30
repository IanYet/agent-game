import {useState} from 'react';
import type {StoredRun} from '../../runtime/types';
import {FoilPanel} from '../../visuals/FoilPanel';
import {BuildingFan} from './cards-ui';
import {Results} from './table';
import type {District} from './cards';
import type {CitadelsState,CitadelsView} from './engine';

export {Table} from './table';

export function ConfigFields(){
  return <div className="ct-config"><p>经典八身份 · 3–7 人 · 八建筑终局。人数通过玩家名单增减；三人每位选两个身份。</p><small>新桌由名单 1 号玩家持有王冠并首先选角，可拖拽名单调整。后续轮次按国王与王冠规则推进。</small></div>;
}

export function Replay({run}:{run:StoredRun<CitadelsState>}){
  const [step,setStep]=useState(run.state.events.length),events=run.state.events.slice(0,step),last=events.at(-1);
  const cities:District[][]=run.roster.map(()=>[]);
  for(const event of events){
    if(event.target===undefined||!event.cards)continue;
    if(event.kind==='build')cities[event.target].push(...event.cards);
    if(event.kind==='destroy')cities[event.target]=cities[event.target].filter(card=>!event.cards!.some(district=>district.id===card.id));
  }
  return <div className="ct-replay"><h2>富饶之城 · 第 {run.index} 局公开回放</h2><p>按公开事件还原选角、叫号与城区变化；未公开的身份、手牌和抽牌选择保密。</p>
    <label>公开事件 {step}/{run.state.events.length}<input aria-label="回放进度" type="range" min="0" max={run.state.events.length} value={step} onChange={event=>setStep(Number(event.target.value))}/></label>
    <div className="ct-replay-controls"><button className="button outline" disabled={step===0} onClick={()=>setStep(value=>value-1)}>上一步</button><p>{last?`第 ${last.round} 轮 · ${last.text}`:'开局前'}</p><button className="button outline" disabled={step===run.state.events.length} onClick={()=>setStep(value=>value+1)}>下一步</button></div>
    <div className="ct-replay-cities">{run.roster.map((player,seat)=><FoilPanel key={player.playerId}><h3>{player.name} · {cities[seat].length} 座</h3><BuildingFan cards={cities[seat]} label={`${player.name}的回放城区`}/></FoilPanel>)}</div>
    {step===run.state.events.length&&run.state.scores&&<FoilPanel><Results game={{...run.state,viewer:null,players:run.state.players} as unknown as CitadelsView}/></FoilPanel>}
    <details><summary>完整公开记录</summary>{events.map(event=><p key={event.seq}>#{event.seq} · 第 {event.round} 轮 · {event.text}</p>)}</details>
  </div>;
}
