import {useEffect,useState,type KeyboardEvent,type MouseEvent} from 'react';
import type {ControlledView,GameUiProps} from '../../runtime/types';
import {playerCardState} from '../../visuals/PlayerCard';
import {AgentPlayerCard} from '../AgentPlayerCard';
import {HumanPlayerCard} from '../HumanPlayerCard';
import {FoilPanel} from '../../visuals/FoilPanel';
import {GameLayout,GameTable,SpectatorTableActions,type BoardGamePanel} from '../GameLayout';
import {StatusTag} from '../../UiBits';
import {SvgIcon} from '../../visuals/SvgIcon';
import {ROLES,district,roleName,type District} from './cards';
import {BuildingFan,RoleCard} from './cards-ui';
import {scoreCitadels,type Action,type CitadelsView} from './engine';
import './style.css';

const PHASES={draft:'秘密选角',income:'先领取收入',keep:'选择保留建筑',main:'建造与使用技能',graveyard:'墓地收回',finished:'本局结算'};
type View=ControlledView<CitadelsView>;
type Mode='build'|'assassinate'|'steal'|'magic_swap'|'magic_cycle'|'laboratory'|'destroy';
const MODES:readonly {id:Mode;label:string;hint:string}[]=[
  {id:'build',label:'建造',hint:'点击自己手牌中要建造的建筑。'},
  {id:'assassinate',label:'刺杀身份',hint:'点击上方身份卡，选择要刺杀的身份。'},
  {id:'steal',label:'盗取金币',hint:'点击上方身份卡，选择要偷窃的身份。'},
  {id:'magic_swap',label:'交换手牌',hint:'点击要交换手牌的玩家卡。'},
  {id:'magic_cycle',label:'置底重抽',hint:'点击自己的手牌，可多选要置底重抽的牌。'},
  {id:'laboratory',label:'实验室',hint:'点击自己的一张手牌，置底并换取 1 金币。'},
  {id:'destroy',label:'拆除建筑',hint:'点击任意玩家城区中可拆除的建筑；确认后结束身份回合。'},
];

function RoleBadges({player}:{player:Pick<CitadelsView['players'][number],'roles'|'roleCount'>}){
  const hidden=player.roleCount-player.roles.length;
  return <>{player.roles.map(rank=><StatusTag key={rank}>{roleName(rank)}</StatusTag>)}{hidden>0?<StatusTag>{hidden===1?'身份未公开':`${hidden} 个隐藏身份`}</StatusTag>:!player.roles.length&&<StatusTag>待选身份</StatusTag>}</>;
}

export function Results({game}:{game:Pick<CitadelsView,'scores'|'winners'>&{players:Array<{name:string}>}}){
  return <section className="ct-results"><span className="identity-caption">MASTER BUILDERS.</span><h3>{game.winners.map(i=>game.players[i].name).join('、')}{game.winners.length>1?' 共享胜利':' 获胜'}</h3><table><thead><tr><th>玩家</th><th>建筑</th><th>五色</th><th>完工</th><th>特殊</th><th>总分</th></tr></thead><tbody>{game.scores?.map(s=><tr key={s.seat}><th>{game.players[s.seat].name}</th><td>{s.districts}</td><td>{s.colors}</td><td>{s.completion}</td><td>{s.special}</td><td><b>{s.total}</b></td></tr>)}</tbody></table><p>同分比较建筑费用，再比较金币，仍相同则共享胜利。</p></section>;
}

export function Table({state,controller,onError,tableActions}:GameUiProps){
  const game=state.game as View,own=game.viewer===null?undefined:game.players[game.viewer];
  const roundScores=game.scores??scoreCitadels(game);
  const [panel,setPanel]=useState<BoardGamePanel>(own?'player':'table');
  const [mode,setMode]=useState<Mode>('build'),[selected,setSelected]=useState<string[]>([]),[actionId,setActionId]=useState('');
  const active=!!own&&!state.paused&&game.phase!=='finished'&&game.turn===own.seat;
  const choosingIncome=!!own&&game.turn===own.seat&&game.phase==='keep';
  const choice=active?game.legalActions.find(action=>action.id===actionId):undefined;
  const modes=MODES.filter(item=>game.legalActions.some(action=>action.action.type===item.id));
  const quickActions=game.legalActions.filter(item=>['income','tax','smithy','recover'].includes(item.action.type));
  const endAction=game.legalActions.find(item=>item.action.type==='end');
  const roleActions=active?game.legalActions.filter(item=>game.phase==='draft'?item.action.type==='choose':(mode==='assassinate'||mode==='steal')&&item.action.type===mode):[];
  const opponents=game.players.filter(player=>player.seat!==game.viewer);
  const agentColumns=own?3:4,upperAgents=Math.max(0,opponents.length-agentColumns);
  const actionCount=active?quickActions.length+(game.phase!=='draft'&&game.phase!=='keep'?modes.length:0)+(endAction?1:0):0;

  useEffect(()=>{setSelected([]);setActionId('');setMode('build');},[game.id,game.revision]);
  useEffect(()=>{if(active)setPanel(game.phase==='draft'?'table':'player');},[active,game.id,game.phase]);
  const act=(action:Action)=>{try{controller.humanAction(action);}catch(error){onError((error as Error).message);}};
  const changeMode=(next:Mode)=>{setMode(next);setSelected([]);setActionId('');setPanel(next==='assassinate'||next==='steal'?'table':next==='magic_swap'||next==='destroy'?'players':'player');};
  const toggle=(id:string)=>setSelected(cards=>cards.includes(id)?cards.filter(card=>card!==id):[...cards,id]);
  const chooseHand=(card:District)=>{
    if(!active)return;
    if(game.phase==='keep'){if(game.keepCount===1)setSelected(cards=>cards.includes(card.id)?[]:[card.id]);else toggle(card.id);return;}
    if(mode==='magic_cycle'){toggle(card.id);return;}
    setSelected(cards=>cards.includes(card.id)?[]:[card.id]);
    const action=game.legalActions.find(item=>(item.action.type==='build'||item.action.type==='laboratory')&&item.action.type===mode&&item.action.card===card.id);
    setActionId(actionId===action?.id?'':action?.id??'');
  };
  const destroyAction=(seat:number,card:District)=>active&&mode==='destroy'?game.legalActions.find(item=>item.action.type==='destroy'&&item.action.target===seat&&item.action.card===card.id):undefined;
  const chooseCity=(seat:number,card:District)=>{const action=destroyAction(seat,card);if(action){setActionId(action.id===actionId?'':action.id);setPanel('player');}};
  const playerAction=(seat:number)=>active&&mode==='magic_swap'?game.legalActions.find(item=>item.action.type==='magic_swap'&&item.action.target===seat):undefined;
  const choosePlayer=(seat:number,event:MouseEvent<HTMLDivElement>|KeyboardEvent<HTMLDivElement>)=>{
    const action=playerAction(seat);if(!action)return;
    if(event.type==='keydown'){
      const key=event as KeyboardEvent<HTMLDivElement>;
      if(event.target!==event.currentTarget||!['Enter',' '].includes(key.key))return;
      event.preventDefault();
    }else if((event.target as Element).closest('button,a,input,select,textarea'))return;
    setActionId(action.id===actionId?'':action.id);
    setPanel('player');
  };
  const selectedCity=(seat:number)=>choice?.action.type==='destroy'&&choice.action.target===seat?[choice.action.card]:[];
  const status=(player:View['players'][number])=>game.phase==='finished'?`累计 ${player.totalScore} 分 · ${player.wins} 胜`:game.turn===player.seat?state.paused?'已暂停':player.kind==='human'?PHASES[game.phase]:state.seats.find(seat=>seat.playerId===player.playerId)?.message??'正在思考':game.phase==='draft'?`已选 ${player.roleCount} 个身份`:'等待叫号';
  const visual=(player:View['players'][number])=>playerCardState({active:player.seat===game.turn,paused:state.paused,finished:game.phase==='finished',runtime:state.seats.find(seat=>seat.playerId===player.playerId)});
  const hint=!active?game.phase==='finished'?'本局已结束，可查看城区与结算。':state.paused?'游戏已暂停，继续后恢复行动。':'等待其他玩家行动。':game.phase==='draft'?'点击上方身份卡，确认后秘密选择。':game.phase==='keep'?`点击抽到的建筑，选择保留 ${game.keepCount} 张。`:game.phase==='graveyard'?'选择是否支付 1 金币收回被拆除的建筑。':game.phase==='income'&&mode==='build'?'先领取金币或抽牌收入，再选择要建造的建筑。':MODES.find(item=>item.id===mode)?.hint??'选择本回合行动。';
  const handSelectable=active&&(game.phase==='main'||game.phase==='income')&&['build','laboratory','magic_cycle'].includes(mode);
  const confirm=()=>{
    if(!active)return;
    if(game.phase==='keep'){if(selected.length===game.keepCount)act({type:'keep',cards:selected});}
    else if(mode==='magic_cycle'&&game.legalActions.some(item=>item.action.type==='magic_cycle'))act({type:'magic_cycle',cards:selected});
    else if(choice)act(choice.action);
  };
  const canConfirm=active&&(game.phase==='keep'?selected.length===game.keepCount:mode==='magic_cycle'?selected.length>0&&game.legalActions.some(item=>item.action.type==='magic_cycle'):!!choice);
  const confirmLabel=game.phase==='draft'?'确认身份':game.phase==='keep'?'确认保留':mode==='magic_cycle'?`置底重抽 ${selected.length} 张`:choice?.action.type==='destroy'?'拆除并结束回合':'确认行动';
  const playerActions=<section className="ct-turn-controls" data-choosing-income={choosingIncome||undefined} aria-label="本回合操作">
    <div className="ct-operation-heading"><span>{choosingIncome?`${game.pendingCards.length} 选 ${game.keepCount} · 已选 ${selected.length}/${game.keepCount}`:active?PHASES[game.phase]:'等待行动'}</span></div>
    <div className="ct-operation-options" data-many-options={actionCount>4||undefined}>
      {choosingIncome&&<div className="ct-income-choice">
        <BuildingFan cards={game.pendingCards} label="选择要保留的建筑" selected={selected} onChoose={active?chooseHand:undefined}/>
      </div>}
      {active&&quickActions.map(action=><button key={action.id} className="button outline" onClick={()=>act(action.action)}>{action.label}</button>)}
      {active&&game.phase!=='draft'&&game.phase!=='keep'&&modes.map(item=><button key={item.id} className="button outline" aria-pressed={mode===item.id} onClick={()=>changeMode(item.id)}>{item.label}</button>)}
      {active&&endAction&&<button className="button outline" onClick={()=>act(endAction.action)}>结束回合</button>}
    </div>
    <p className="ct-operation-hint" role="status">{choosingIncome&&active?(selected.length?`保留：${game.pendingCards.filter(card=>selected.includes(card.id)).map(card=>district(card).name).join('、')}。其余放回牌库底。`:`选择 ${game.keepCount} 张加入手牌，其余放回牌库底。`):choice?.label??hint}</p>
    <div className="ct-operation-confirm"><button className="button primary" disabled={!canConfirm} onClick={confirm}>{confirmLabel}</button></div>
  </section>;

  const city=(player:View['players'][number])=><section className="ct-player-city" aria-label={`${player.name}的已建城区`}>
    <strong className="ct-section-label">已建城区</strong>
    <BuildingFan cards={player.city} label={`${player.name}的城区建筑`} selected={selectedCity(player.seat)} onChoose={active&&mode==='destroy'?card=>chooseCity(player.seat,card):undefined} canChoose={card=>!!destroyAction(player.seat,card)}/>
  </section>;
  const turnText=game.phase==='finished'?`${game.winners.map(seat=>game.players[seat].name).join('、')}获胜`:game.phase==='draft'?`${game.players[game.turn].name} · 选角 ${game.draftIndex+1}/${game.draftTotal}`:game.phase==='graveyard'?`${game.players[game.turn].name} · 墓地收回`:`${game.players[game.turn].name} · ${game.called} 号${roleName(game.called)}`;

  return <GameLayout gameId="citadels" label="富饶之城牌桌" className="ct-layout" surfaceClassName="ct-main" viewport={{mode:own?'player':'spectator',panel,onPanelChange:setPanel,playerLabel:'我的城市',tableActions}} toolbar={<><span>第 {game.gameNumber} 局 · 第 {game.round} 轮 · {turnText}</span><span><SvgIcon name="crown"/> {game.players[game.crown].name} · 牌库 {game.deckCount} 张</span></>} score={<FoilPanel className="ct-progress"><span className="identity-caption">CITY CHRONICLE.</span><h3>本局分数</h3>{game.players.map(player=><div key={player.playerId}><span>{player.name}</span><b title="建筑费用、五色、完工与特殊建筑奖励合计">{roundScores[player.seat].total} 分</b><small>城区 {player.city.length}/8 · 累计 {player.totalScore} 分 · {player.wins} 胜</small></div>)}{game.phase!=='finished'&&game.firstCompleted!==null&&<p>{game.players[game.firstCompleted].name}已完工，本轮结束后结算。</p>}{game.phase==='finished'&&<Results game={game}/>}</FoilPanel>} events={game.events} eventPlayers={game.players} activityTitle="城中纪事">
    <GameTable className="ct-public-table"><div className="ct-public">
      <div className="ct-call-track" role="list" aria-label="身份叫号顺序">{ROLES.map(role=>{
        const revealed=game.players.find(player=>player.revealed.includes(role.rank)),removed=game.faceUp.includes(role.rank),current=game.phase!=='draft'&&game.phase!=='finished'&&game.called===role.rank;
        const action=roleActions.find(item=>(item.action.type==='choose'||item.action.type==='assassinate'||item.action.type==='steal')&&item.action.role===role.rank);
        return <RoleCard key={role.rank} rank={role.rank} current={current} called={game.phase!=='draft'&&game.called>=role.rank} status={removed?'明弃':game.assassinated===role.rank?'被刺杀':revealed?.name??(game.phase==='draft'?'未公开':game.called>=role.rank?'无人应答':'等待叫号')} selected={!!own?.roles.includes(role.rank)||!!action&&choice?.id===action.id} onClick={action?()=>{setActionId(actionId===action.id?'':action.id);setPanel('player');}:undefined}/>;
      })}</div>
    </div></GameTable>
    <section className={`board-players ct-players ${own?'ct-with-human':'ct-spectators'}`} aria-label="玩家信息">
      <div className="ct-player-grid">
        {own&&<div className="ct-human-seat"><HumanPlayerCard player={own} state={visual(own)} metrics={[{label:'金币',value:own.gold},{label:'城区',value:own.city.length}]} badges={<RoleBadges player={own}/>} status="" actions={playerActions} tableActions={tableActions} aria-label="我的城区、手牌与行动">
          {city(own)}
          <section className="ct-player-hand" aria-label="我的建筑手牌"><strong className="ct-section-label">手牌</strong>
            <BuildingFan cards={own.hand??[]} label="我的建筑手牌" selected={game.phase==='keep'?[]:selected} onChoose={handSelectable?chooseHand:undefined} empty="暂无建筑手牌"/>
          </section>
        </HumanPlayerCard></div>}
        {opponents.map((player,index)=>{
          const target=playerAction(player.seat),targetSelected=target?.id===choice?.id&&!!target;
          const row=own||opponents.length>agentColumns?(index<upperAgents?1:2):1,column=(index<upperAgents?index:index-upperAgents)+(own?2:1);
          return <div className="ct-agent-seat" key={player.playerId} style={{gridRow:row,gridColumn:column}}><AgentPlayerCard player={player} state={targetSelected?'acting':visual(player)} caption={game.crown===player.seat?'王冠':undefined} badges={<RoleBadges player={player}/>} metrics={[{label:'金币',value:player.gold},{label:'手牌',value:player.handCount}]} status={status(player)} action={game.events.filter(event=>event.seat===player.seat&&event.round===game.round).at(-1)?.text??''} data-ct-targetable={!!target} data-ct-selected={targetSelected} tabIndex={target?0:undefined} onClick={event=>choosePlayer(player.seat,event)} onKeyDown={event=>choosePlayer(player.seat,event)}>
            {city(player)}
          </AgentPlayerCard></div>;
        })}
      </div>
    </section>
    {!own&&<SpectatorTableActions notice={game.phase==='finished'?'本局已结束':'观战中 · 点击 Agent 光球查看对话'}>{tableActions}</SpectatorTableActions>}
  </GameLayout>;
}
