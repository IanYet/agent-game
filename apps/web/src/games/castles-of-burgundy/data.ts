import type {Animal,Building,Cell,EstateBoard,Good,Tile,TileKind} from './types';
export const COLORS:TileKind[]=['castle','mine','ship','animal','building','knowledge'];
export const COLOR_NAMES:Record<TileKind,string>={castle:'城堡',mine:'矿山',ship:'河流',animal:'牧场',building:'城市',knowledge:'知识'};
export const BUILDINGS:Building[]=['warehouse','carpenter','church','market','boarding-house','bank','city-hall','watchtower'];
export const BUILDING_NAMES:Record<Building,string>={warehouse:'仓库',carpenter:'木工坊',church:'教堂',market:'市场','boarding-house':'客舍',bank:'银行','city-hall':'市政厅',watchtower:'瞭望塔'};
export const ANIMAL_NAMES:Record<Animal,string>={cow:'牛',pig:'猪',sheep:'羊',chicken:'鸡'};
export const PHASES=['A','B','C','D','E'];
export const RULES_URL='https://www.brettspiele-report.de/images/d/die_burgen_von_burgund/Spielanleitung_Die_Burgen_von_Burgund.pdf';
export const BLACK_KNOWLEDGE=[7,12,14,15,24,25];
export const KNOWLEDGE_BUILDINGS:Record<number,Building>={16:'warehouse',17:'watchtower',18:'carpenter',19:'church',20:'market',21:'boarding-house',22:'bank',23:'city-hall'};
export const BUILDING_EFFECTS:Record<Building,string>={warehouse:'立即免费出售自己的一种货物，整堆出售。',carpenter:'从任意编号仓库免费拿一块建筑到暂存区。',church:'从任意编号仓库免费拿一块城堡、矿山或知识到暂存区。',market:'从任意编号仓库免费拿一块船或动物到暂存区。','boarding-house':'立即获得 4 名工人。',bank:'立即获得 2 银币。','city-hall':'立即从暂存区再铺一块板块，忽略骰值，仍遵守颜色、邻接及同城限制，并触发完整效果。',watchtower:'立即获得 4 分。'};
export const KNOWLEDGE_TEXT:Record<number,string>={
  1:'允许同一城市内建造重复种类的建筑。',2:'每阶段末，每座已铺矿山额外获得 1 名工人，仍领取矿山银币。',3:'每次出售一整种货物获得 2 银币，替代通常的 1 银币。',4:'每次出售一整种货物额外获得 1 名工人。',5:'铺船时可从两个相邻仓库收货；6 与 1 也相邻。',6:'每回合一次的 2 银币购买可选全部七个仓库。',7:'动物计分时，每块参与计分的同种动物板块额外 +1 分。',8:'每名付出的工人可调整骰值至多 ±2。',9:'铺建筑可免费调整骰值 ±1。',10:'铺船或动物可免费调整骰值 ±1。',11:'铺城堡、矿山或知识可免费调整骰值 ±1。',12:'用骰子从编号仓库拿任何颜色的板块，可免费调整骰值 ±1。',13:'执行取工人行动时额外获得 1 银币，客舍不触发。',14:'取工人行动改为获得 4 名工人，客舍不触发。',15:'终局每种至少出售过一次的货物 +3 分。',24:'终局庄园中每种动物 +4 分。',25:'终局每件已售货物 +1 分。',26:'终局每块获得的颜色奖励板块 +2 分。',
};
for(const [id,building] of Object.entries(KNOWLEDGE_BUILDINGS))KNOWLEDGE_TEXT[Number(id)]=`终局庄园中每座${BUILDING_NAMES[building]} +4 分。`;
const tiles:Tile[]=[];
for(const building of BUILDINGS)for(let copy=1;copy<=7;copy++)tiles.push({id:`b-${building}-${copy}`,kind:'building',building,back:copy<=5?'building':'black'});
for(const animal of Object.keys(ANIMAL_NAMES) as Animal[]){
  for(const [count,copies] of [[2,2],[3,2],[4,1]])for(let copy=1;copy<=copies;copy++)tiles.push({id:`a-${animal}-${count}-${copy}`,kind:'animal',animal,count,back:'animal'});
  for(const count of [3,4])tiles.push({id:`a-${animal}-${count}-b1`,kind:'animal',animal,count,back:'black'});
}
for(let knowledge=1;knowledge<=26;knowledge++)tiles.push({id:`k-${knowledge}`,kind:'knowledge',knowledge,back:BLACK_KNOWLEDGE.includes(knowledge)?'black':'knowledge'});
for(const [kind,prefix,normal,black] of [['castle','c',14,2],['mine','m',10,2],['ship','s',20,6]] as const)for(let copy=1;copy<=normal+black;copy++)tiles.push({id:`${prefix}-${copy}`,kind,back:copy<=normal?kind:'black'});
export const TILE_LIST=tiles;
export const TILES:Record<string,Tile>=Object.fromEntries(tiles.map(t=>[t.id,t]));
export const GOODS:Record<string,Good>=Object.fromEntries(Array.from({length:6},(_,type)=>Array.from({length:7},(_,i)=>({id:`g-${type+1}-${i+1}`,type:type+1}))).flat().map(g=>[g.id,g]));
export function tileName(id:string){const t=TILES[id];return !t?id:t.kind==='building'?BUILDING_NAMES[t.building!]:t.kind==='animal'?`${t.count} 只${ANIMAL_NAMES[t.animal!]}`:t.kind==='knowledge'?`知识 ${t.knowledge}`:t.kind==='ship'?'船':COLOR_NAMES[t.kind];}
export function tileEffect(id:string){const t=TILES[id];return t.kind==='building'?BUILDING_EFFECTS[t.building!]:t.kind==='knowledge'?KNOWLEDGE_TEXT[t.knowledge!]:t.kind==='animal'?'本牧场中同种动物重新计分。':t.kind==='ship'?'收取货物，桥上前进一格并叠在同格棋子上。':t.kind==='castle'?'立即获得一个任意点数的额外骰子行动。':'每阶段末获得 1 银币，含 E 阶段。';}

// 2011 components: point-up axial grid, rows A–G, columns left to right.
// Values were checked against the printed board, not third-party engine code.
const dice=['6543','21654','543123','6126541','254312','61256','3413'];
const layouts=[
  ['ACCK','AACKB','AABKBB','SSSCSSS','BBMBBA','BMKBB','MKKB'],
  ['SBAC','ASBAB','AAABKB','BBBBBKC','KKMKMS','BBMKS','CSSC'],
  ['AAAA','SSCSS','BMKKSB','BBKCKBB','BBKKBB','CAMMC','BASB'],
  ['CABS','AABSS','BBBSCM','AAAKKMS','BCKBBB','BMBKK','SBKC'],
  ['ABBS','AABMM','BCKSSS','BBAKCBB','KCAKSB','BABCS','KKBM'],
  ['KKCS','KBBSB','AAMSBB','KBBCSBB','KBBMSB','KMAAS','CAAC'],
  ['KCCS','KAAAS','SMBBMA','SKBBBAB','BKBBAB','BSMKB','SCCK'],
  ['BBSB','SCKCB','BKMKKS','BAKMAKB','SAAAMB','BCACS','BSBB'],
  ['BBCK','BBAAS','BBAASS','CKKMSCK','SSKMBA','KBBBA','MCBB'],
];
const colorCodes:Record<string,TileKind>={C:'castle',M:'mine',S:'ship',A:'animal',B:'building',K:'knowledge'};
const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
export function neighbors(board:EstateBoard,cellId:string){const cell=board.cells.find(c=>c.id===cellId);return cell?board.cells.filter(c=>directions.some(([dq,dr])=>c.q===cell.q+dq&&c.r===cell.r+dr)).map(c=>c.id):[];}
export function regionFor(board:EstateBoard,cellId:string){const cell=board.cells.find(c=>c.id===cellId);if(!cell)throw Error('庄园格不存在');return board.regions.find(r=>r.id===cell.region)!;}
export const BOARDS:Record<number,EstateBoard>=Object.fromEntries(layouts.map((rows,i)=>{
  const cells:Cell[]=rows.flatMap((row,y)=>[...row].map((code,x)=>({id:`${String.fromCharCode(65+y)}${x+1}`,q:Math.max(-3,-(y-3)-3)+x,r:y-3,color:colorCodes[code],value:Number(dice[y][x]),region:''})));
  const board:EstateBoard={id:i+1,cells,regions:[]};
  for(const cell of cells){if(cell.region)continue;const id=`${cell.color}-${cell.id}`,todo=[cell.id],members:string[]=[];cell.region=id;
    while(todo.length){const at=todo.pop()!;members.push(at);for(const n of neighbors(board,at)){const other=cells.find(c=>c.id===n)!;if(other.color===cell.color&&!other.region){other.region=id;todo.push(n);}}}
    board.regions.push({id,color:cell.color,cells:members});
  }
  return [board.id,board];
}));
export const BOARD_PAIRS=[[1,2],[1,3],[1,4],[1,5],[6,7],[8,9]];
const normalDepots:TileKind[][]=[['ship','building'],['castle','knowledge'],['animal','building'],['ship','building'],['mine','knowledge'],['animal','building']];
const extra3:TileKind[]=['knowledge','building','ship','animal','building','castle'];
const extra4:TileKind[]=['animal','building','knowledge','mine','building','ship'];
export function depotColors(players:number,phaseIndex:number){return normalDepots.map((colors,i)=>[...colors,...(players>=3?[players===3&&i===5&&phaseIndex%2?'mine' as const:extra3[i]]:[]),...(players===4?[extra4[i]]:[])]);}
