import {actionObject,actionVariant,gameActionTool,identifier,integer,oneOfValues} from '../action-schema';
import {COLORS,GEMS} from './types';

const counts=actionObject(Object.fromEntries(GEMS.map(color=>[color,integer(0,10)])),[...GEMS]);
export const ACTION_HELP='action 用法：action 阶段 {type:"take",colors:["white","blue","green"]} 拿异色、{type:"pair",color:"red"} 拿同色两枚、{type:"reserve",cardId:市场卡ID} 明预留、{type:"reserveDeck",level:1|2|3} 暗预留、{type:"buy",cardId:市场或自己预留卡ID,payment:{red:2,gold:1}} 购买，payment 可省略以优先使用彩色宝石，指定时省略颜色视为 0。return 阶段 {type:"return",tokens:{white:1,gold:1}}，总数必须恰好 returnCount；noble 阶段 {type:"noble",nobleId:贵族ID}。{type:"pass"} 仅在完全无主要行动时可用。颜色 white/blue/green/red/black，黄金 gold；card.cost 是印刷费用，玩家 bonuses 是永久折扣，贵族 cost 是折扣数量要求。';
export const actionTool=gameActionTool('自行提交拿取、明暗预留、购买与支付、超额归还或贵族选择。引擎严格检查库存、持有量、折扣、费用与阶段。',{
  oneOf:[
    actionVariant('take',{colors:{type:'array',items:oneOfValues(COLORS),minItems:1,maxItems:3,uniqueItems:true}}),
    actionVariant('pair',{color:oneOfValues(COLORS)}),actionVariant('reserve',{cardId:identifier}),actionVariant('reserveDeck',{level:integer(1,3)}),
    actionVariant('buy',{cardId:identifier,payment:counts},['payment']),actionVariant('return',{tokens:counts}),
    actionVariant('noble',{nobleId:identifier}),actionVariant('pass'),
  ],
});
