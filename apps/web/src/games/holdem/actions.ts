import {actionVariant,gameActionTool,integer} from '../action-schema';

export const ACTION_HELP='action 用法：{type:"fold"} 弃牌、{type:"check"} 过牌、{type:"call"} 跟注，或 {type:"raise",amount:37} 加注。amount 是本轮累计下注到的总额；可提交范围内的任意整数。全下也用 raise，amount=betting.maxRaiseTo；只能跟注时用 call，筹码不足会自动全下。betting 提供 toCall/minRaiseTo/maxRaiseTo/canRaise/shortAllInOnly；它们是下注约束。底牌及公共牌 rank=2–14，14 为 A，S/H/C/D 为黑桃/红桃/梅花/方块。';
export const actionTool=gameActionTool('提交弃牌、过牌、跟注或任意合法加注到的总额。加注权、最低加注和全下由引擎校验。',{
  oneOf:[actionVariant('fold'),actionVariant('check'),actionVariant('call'),actionVariant('raise',{amount:integer(1,Number.MAX_SAFE_INTEGER)})],
});
