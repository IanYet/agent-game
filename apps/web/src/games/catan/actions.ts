import {actionObject,actionVariant,gameActionTool,identifier,integer,oneOfValues} from '../action-schema';
import {RESOURCES} from './types';
const resources=actionObject(Object.fromEntries(RESOURCES.map(r=>[r,integer(0,19)])),[...RESOURCES]);
export const ACTION_HELP=`action字段：资源wood木材/brick砖/wool羊毛/wheat小麦/ore矿石，数量为非负整数，省略种类视为0。坐标和目标使用当前观察board中hex/vertex/edge的id，target为0起的对手座位。不要自行指定骰子。
初始布置：{type:"setup_settlement",vertex:"v12"}；随后{type:"setup_road",edge:"e10"}。
生产：{type:"roll"}。弃牌：{type:"discard",resources:{wood:2,ore:2}}，恰好discardNeeded[你的seat]。强盗：{type:"move_robber",hex:"h3",target:1}，无可偷对手时省略target。
行动：{type:"road",edge:"e12"}、{type:"settlement",vertex:"v24"}、{type:"city",vertex:"v24"}、{type:"buy_development"}、{type:"end_turn"}。
银行：{type:"bank_trade",give:{wood:4},want:{ore:1}}；给取可含多种、多组，rates为最低比例，rateOptions为全部可用比例。可混合不同合法比例，也可选择仍然可用的4:1。
玩家交易：{type:"trade_open",target:1,give:{wood:2},want:{ore:1}}；不填target向全桌报价，不填give和want开放协商。trade_reply阶段：{type:"trade_reply",response:"accept"}或response:"reject"，或{type:"trade_reply",response:"counter",give:{ore:1},want:{wood:1,wool:1}}（还价从回复者视角）。trade_choose阶段：{type:"trade_accept",target:1}选择接受或还价的对手，或{type:"trade_cancel"}。
发展卡：{type:"play_knight",cardId:"d2"}；{type:"play_road_building",cardId:"d4"}后每次{type:"free_road",edge:"e20"}；{type:"play_invention",cardId:"d6",resources:{ore:2}}；{type:"play_monopoly",cardId:"d7",resource:"wheat"}。胜利点不手动打出，满足自己回合10分由系统自动判胜。`;
export const actionTool=gameActionTool('直接构造建造、掷骰、弃牌与强盗、银行和玩家协商交易、发展卡行动。按阶段、时机、距离、连通、库存和私有持牌核验；拒绝不改变局面。',{
  oneOf:[
    ...['setup_settlement','settlement','city'].map(type=>actionVariant(type,{vertex:identifier})),
    ...['setup_road','road','free_road'].map(type=>actionVariant(type,{edge:identifier})),
    ...['roll','end_turn','buy_development','trade_cancel'].map(type=>actionVariant(type)),
    actionVariant('discard',{resources}),actionVariant('move_robber',{hex:identifier,target:integer(0,3)},['target']),
    actionVariant('bank_trade',{give:resources,want:resources}),
    actionVariant('trade_open',{target:integer(0,3),give:resources,want:resources},['target','give','want']),
    actionVariant('trade_reply',{response:oneOfValues(['accept','reject','counter']),give:resources,want:resources},['give','want']),
    actionVariant('trade_accept',{target:integer(0,3)}),
    ...['play_knight','play_road_building'].map(type=>actionVariant(type,{cardId:identifier})),
    actionVariant('play_invention',{cardId:identifier,resources}),actionVariant('play_monopoly',{cardId:identifier,resource:oneOfValues(RESOURCES)}),
  ],
});
