import {actionVariant,cardIds,gameActionTool,integer} from '../action-schema';

export const ACTION_HELP='action 用法：叫分阶段 {type:"bid",value:0|1|2|3}，0 为不叫；出牌阶段 {type:"play",cards:[实体牌ID,...]} 或 {type:"pass"}。牌型由引擎按所选实体牌判定。rank 为 3–14（A）、15（2）、16（小王）、17（大王），S/H/C/D 为黑桃/红桃/梅花/方块。';
export const actionTool=gameActionTool('自行提交叫分、实体手牌或不出；引擎校验阶段、牌权、牌型和压牌大小。',{
  oneOf:[actionVariant('bid',{value:integer(0,3)}),actionVariant('play',{cards:cardIds(20)}),actionVariant('pass')],
});
