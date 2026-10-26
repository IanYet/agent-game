import {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../styles.css';
import type {GameController} from '../../controller';
import type {AppSnapshot,StablePlayer} from '../../runtime/types';
import {GameChrome} from '../../GameChrome';
import {Logo} from '../../UiBits';
import {EffectsControls} from '../../visuals/EffectsControls';
import {GameBackground} from '../../visuals/GameBackground';
import {VisualExperience} from '../../visuals/VisualExperience';
import {useEffectsPreference} from '../../visuals/preferences';
import {makeDeck,type District} from './cards';
import {createCitadels,scoreCitadels,viewCitadels} from './engine';
import {Table} from './table';

// Manual display scene, using the real table. No connector or game save is used.
const roster:StablePlayer[]=[
  {playerId:'preview-you',name:'你',kind:'human'},
  {playerId:'preview-north',name:'北河',kind:'codex-acp'},
  {playerId:'preview-tide',name:'观澜',kind:'codex-acp'},
  {playerId:'preview-echo',name:'回声',kind:'codex-acp'},
  {playerId:'preview-hill',name:'远山',kind:'codex-acp'},
];
type PreviewScene='main'|'draft'|'keep'|'income'|'assassin'|'thief'|'magician'|'magician-income'|'king'|'bishop'|'merchant'|'architect'|'warlord'|'warlord-income'|'keep-three-one'|'keep-three-two'|'graveyard'|'paused'|'finished';
const extraScenes:readonly {id:PreviewScene;label:string}[]=[
  {id:'income',label:'正常收入与建筑技能'},{id:'assassin',label:'刺客技能'},{id:'thief',label:'盗贼技能'},
  {id:'magician',label:'魔术师技能'},{id:'magician-income',label:'魔术师收入前'},
  {id:'king',label:'国王技能'},{id:'bishop',label:'主教技能'},{id:'merchant',label:'商人技能'},
  {id:'architect',label:'建筑师技能'},{id:'warlord',label:'军阀拆除'},{id:'warlord-income',label:'军阀收入前'},
  {id:'keep-three-one',label:'抽三留一'},{id:'keep-three-two',label:'抽三留二'},{id:'graveyard',label:'墓地收回'},
  {id:'paused',label:'暂停状态'},{id:'finished',label:'结算状态'},
];
function displayGame(scene:PreviewScene,revision:number){
  const draft=scene==='draft',drawing=scene==='keep'||scene.startsWith('keep-three');
  const skills=!['main','draft','keep','paused','finished'].includes(scene);
  const rank=({assassin:1,thief:2,magician:3,'magician-income':3,bishop:5,merchant:6,architect:7,warlord:8,'warlord-income':8} as Partial<Record<PreviewScene,number>>)[scene]??4;
  const income=scene==='income'||scene.endsWith('-income');
  const state=createCitadels('citadels-eight-city-preview',roster.map(player=>({...player,kind:player.kind==='human'?'human' as const:'agent' as const})),{firstCrown:1},()=>.42);
  const deck=makeDeck();
  const take=(key:string):District=>deck.splice(deck.findIndex(card=>card.key===key),1)[0];
  const ownCity=skills?['manor','temple','tavern','watchtower','laboratory','smithy','observatory',scene==='keep-three-two'?'library':'graveyard']:['manor','castle','temple','church','tavern','market','fortress','library'];
  state.players.forEach(player=>{player.city=[];player.hand=[];});
  state.players[0].city=ownCity.map(key=>({...take(key),builtRound:7}));
  state.players[0].hand=(skills?['palace','great-wall','dragon-gate','keep']:['palace','great-wall','laboratory','observatory']).map(take);
  for(const player of state.players.slice(1)){
    const keys=[...new Set(deck.map(card=>card.key))].slice(player.seat,player.seat+8);
    player.city=keys.map(key=>({...take(key),builtRound:7}));
    player.hand=deck.splice(0,4);
  }
  if(rank===8)state.players[1].hand.push(...state.players[1].city.splice(-1));
  const ranks=rank===4?[4,1,5,6,8]:[rank,...[1,2,3,4,5,6,7,8].filter(value=>value!==rank)].slice(0,5);
  const unused=[1,2,3,4,5,6,7,8].filter(value=>!ranks.includes(value)),faceUp=unused.find(value=>value!==4)!;
  const remaining=unused.filter(value=>value!==faceUp);
  state.players.forEach((player,seat)=>{player.gold=seat===0?12:seat+3;player.roles=draft?[]:[ranks[seat]];player.revealed=draft||ranks[seat]>rank?[]:[ranks[seat]];});
  Object.assign(state,{deck,revision,round:8,phase:draft?'draft':drawing?'keep':income?'income':scene==='graveyard'?'graveyard':scene==='finished'?'finished':'main',turn:0,called:draft?0:rank,available:draft?[1,3,4,5,6,8]:remaining.slice(1),faceDown:draft?[7]:remaining.slice(0,1),faceUp:draft?[2]:[faceUp],collected:!draft&&!drawing&&!income,pendingCards:drawing?deck.splice(0,scene==='keep'?2:3):[],keepCount:drawing?(scene==='keep-three-two'?2:1):0,graveyard:scene==='graveyard'?deck.shift()!:null,firstCompleted:0,bankFlow:state.players.reduce((sum,player)=>sum+player.gold,0)});
  if(scene==='finished'){
    state.scores=scoreCitadels(state);
    state.winners=[[...state.scores].sort((a,b)=>b.total-a.total||b.districts-a.districts||b.gold-a.gold)[0].seat];
  }
  state.events=[];
  const view=viewCitadels(state,0);
  return {...view,players:view.players.map((player,seat)=>({...player,...roster[seat]}))};
}
function CitadelsPreview(){
  const [scene,setScene]=useState<PreviewScene>('keep'),[revision,setRevision]=useState(1),[message,setMessage]=useState('');
  const sceneLabel=extraScenes.find(item=>item.id===scene)?.label??(scene==='main'?'建造回合':scene==='draft'?'身份选择':'抽牌二选一');
  const effects=useEffectsPreference();
  useEffect(()=>{document.documentElement.dataset.reducedMotion=String(effects.reduced);},[effects.reduced]);
  const game=useMemo(()=>displayGame(scene,revision),[scene,revision]);
  const state:AppSnapshot={connector:null,connected:false,connectorUpdateRequired:false,game,room:{moduleId:'citadels',moduleVersion:'3.0.0',stateVersion:3,roomId:game.id,runId:game.id,index:1,roster,config:{firstCrown:1},finished:game.phase==='finished'},seats:roster.map((player,seat)=>({...player,seat,status:'ready',turns:7,tokens:0})),paused:scene==='paused',curiosityMode:false,conversations:{},conversationError:null,error:null,history:[],activity:{phase:'八城区四手牌展示',actors:[]}};
  const controller={humanAction:()=>setMessage('这是展示场景；可选择卡牌和查看提示，确认行动不会修改正式对局。')} as unknown as GameController;
  return <div className="app-shell"><GameBackground enabled theme="citadels"/><VisualExperience enabled page="table"/><div className="app-content">
    <header className="site-header"><a className="brand" href="/"><Logo/><strong>同桌</strong><small>TONGZHUO</small></a><span style={{fontSize:11,color:'var(--muted)'}}>八张城区 · 四张手牌 · 五位玩家</span></header>
    <main id="main"><div className="game-page">
      <GameChrome title="富饶之城" status={`场景预览 · ${sceneLabel}`} actions={<>{([{id:'main',label:'建造回合'},{id:'draft',label:'身份选择'},{id:'keep',label:'抽牌二选一'}] as const).map(item=><button key={item.id} className="text-button" aria-pressed={scene===item.id} onClick={()=>{setScene(item.id);setRevision(value=>value+1);setMessage('');}}>{item.label}</button>)}<select aria-label="其他操作场景" value={extraScenes.some(item=>item.id===scene)?scene:''} onChange={event=>{setScene(event.target.value as PreviewScene);setRevision(value=>value+1);setMessage('');}} style={{maxWidth:160,padding:'5px 8px',border:'1px solid var(--line)',borderRadius:5,background:'#151822',color:'var(--fg)',fontSize:10}}><option value="" disabled>其他操作场景</option>{extraScenes.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></>}/>
      <Table state={state} controller={controller} onError={setMessage} tableActions={<div className="game-actions"><button className="button outline" onClick={()=>{setRevision(value=>value+1);setMessage('');}}>还原场景</button></div>}/>
    </div></main>
    <footer className="site-footer"><span style={{fontSize:10,color:'var(--muted)'}}>展示场景 · 不写入正式存档</span><EffectsControls/></footer>
    {message&&<div className="toast" role="status"><span>{message}</span><button className="icon-button" aria-label="关闭消息" onClick={()=>setMessage('')}>×</button></div>}
  </div></div>;
}
const previewRoot=import.meta.hot?.data.previewRoot??createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.previewRoot=previewRoot;
previewRoot.render(<CitadelsPreview/>);
