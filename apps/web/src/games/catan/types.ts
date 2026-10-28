export const RESOURCES=['wood','brick','wool','wheat','ore'] as const;
export type Resource=typeof RESOURCES[number];
export type Resources=Record<Resource,number>;
export const RESOURCE_NAMES:Record<Resource,string>={wood:'木材',brick:'砖',wool:'羊毛',wheat:'小麦',ore:'矿石'};
export const DEVELOPMENT_TYPES=['knight','road_building','invention','monopoly','victory_point'] as const;
export type DevelopmentType=typeof DEVELOPMENT_TYPES[number];
export const DEVELOPMENT_NAMES:Record<DevelopmentType,string>={knight:'骑士',road_building:'修路',invention:'发明（丰收）',monopoly:'垄断',victory_point:'胜利点'};
export type Phase='setup_settlement'|'setup_road'|'roll'|'action'|'discard'|'robber'|'free_roads'|'trade_reply'|'trade_choose'|'finished';
export interface Vertex {id:string;x:number;y:number;hexes:string[];edges:string[];neighbors:string[]}
export interface Edge {id:string;vertices:[string,string];hexes:string[]}
export interface Hex {id:string;q:number;r:number;resource:Resource|'desert';number:number|null;letter:string|null;vertices:string[];edges:string[]}
export interface Port {edge:string;resource:Resource|'any';vertices:[string,string]}
export interface Board {hexes:Hex[];vertices:Vertex[];edges:Edge[];ports:Port[]}
export interface Building {seat:number;kind:'settlement'|'city'}
export interface Development {id:string;type:DevelopmentType;boughtTurn:number}
export interface Player {playerId:string;name:string;kind:'human'|'agent';seat:number;resources:Resources;development:Development[];knights:number;wins:number}
export interface TradeTerms {give:Resources;want:Resources}
export type TradeResponse={response:'accept'}|{response:'reject'}|{response:'counter';offer:TradeTerms};
export interface Trade {id:number;offer:TradeTerms|null;targets:number[];responses:Record<number,TradeResponse>}
export interface Event {
  seq:number;time:string;type:string;text:string;seat?:number;vertex?:string;edge?:string;hex?:string;kind?:Building['kind'];dice?:[number,number];
  resources?:Partial<Resources>;target?:number;cardId?:string;development?:DevelopmentType;
  private?:Record<number,{resources?:Partial<Resources>;development?:Development}>;
  resourceCounts:number[];developmentCounts:number[];points:number[];knights:number[];longestRoad:number|null;largestArmy:number|null;turn:number;
}
export interface CatanState {
  gameId:'catan';id:string;round:number;createdAt:string;endedAt?:string;revision:number;rng:number;
  board:Board;players:Player[];bank:Resources;deck:Development[];played:Development[];buildings:Record<string,Building>;roads:Record<string,number>;
  robber:string;dice:[number,number]|null;firstSeat:number;firstRolls:{seat:number;dice:[number,number]}[];turn:number;turnNumber:number;phase:Phase;
  setupStep:number;setupVertex:string|null;developmentPlayed:boolean;discardNeeded:Record<number,number>;robberReturn:'roll'|'action';
  freeRoads:{remaining:number;returnPhase:'roll'|'action'}|null;trade:Trade|null;tradeSerial:number;longestRoad:number|null;largestArmy:number|null;
  events:Event[];result:{winner:number;scores:number[]}|null;
}
export type Action=
  |{type:'setup_settlement'|'settlement'|'city';vertex:string}
  |{type:'setup_road'|'road'|'free_road';edge:string}
  |{type:'roll'|'end_turn'|'buy_development'|'trade_cancel'}
  |{type:'discard';resources:Partial<Resources>}
  |{type:'move_robber';hex:string;target?:number}
  |{type:'bank_trade';give:Partial<Resources>;want:Partial<Resources>}
  |{type:'trade_open';target?:number;give?:Partial<Resources>;want?:Partial<Resources>}
  |{type:'trade_reply';response:'accept'|'reject'|'counter';give?:Partial<Resources>;want?:Partial<Resources>}
  |{type:'trade_accept';target:number}
  |{type:'play_knight'|'play_road_building';cardId:string}
  |{type:'play_invention';cardId:string;resources:Partial<Resources>}
  |{type:'play_monopoly';cardId:string;resource:Resource};
export interface PlayerView extends Omit<Player,'resources'|'development'> {
  resources:Resources|null;development:Development[]|null;resourceCount:number;developmentCount:number;points:number;publicPoints:number;
  roadLength:number;pieces:{roads:number;settlements:number;cities:number};rates:Resources;rateOptions:Record<Resource,number[]>;
}
export interface CatanView extends Omit<CatanState,'rng'|'deck'|'played'|'players'|'bank'|'events'|'result'> {
  viewer:number|null;players:PlayerView[];bank:Record<Resource,boolean>;developmentRemaining:number;played:Development[];
  actors:number[];events:Omit<Event,'private'>[];result:{winner:number;score:number}|null;
}
