import {actionVariant,gameActionTool,oneOfValues} from '../action-schema';

const uci={type:'string',pattern:'^[a-h][1-8][a-h][1-8][qrbn]?$'};
export const ACTION_HELP='action 用法：{type:"move",uci:"e2e4"}，可加 offerDraw:true 随棋提和；升变必须加 q/r/b/n，如 a7a8n。易位用王的起终格（e1g1/e1c1/e8g8/e8c8），吃过路兵也用起终格。{type:"claim_draw",reason:"threefold"|"fifty"} 申请当前局面和棋；可加 uci 指定预定棋步，申请成功时不落子。{type:"accept_draw"}/{type:"decline_draw"} 回应对方提和，拒绝后仍轮到你；{type:"resign"} 认输。board 的 type 为 k王/q后/r车/b象/n马/p兵，color 为 w白/b黑；fen 同时记录行棋方、易位权、过路兵格和无进展计数。';
export const actionTool=gameActionTool('自行提交 UCI 棋步或和棋/认输动作。引擎检查王的安全、特殊走子与和棋条件；预定和棋申请不会落子。',{
  oneOf:[actionVariant('move',{uci,offerDraw:{type:'boolean'}},['offerDraw']),actionVariant('claim_draw',{reason:oneOfValues(['threefold','fifty']),uci},['uci']),actionVariant('accept_draw'),actionVariant('decline_draw'),actionVariant('resign')],
});
