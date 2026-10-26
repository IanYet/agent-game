import {actionVariant,cardIds,gameActionTool} from '../action-schema';

export const ACTION_HELP='action 用法：enthrone 阶段 {type:"enthrone"} 登基或 {type:"cede"} 让位；declare 阶段全员提交 {type:"declare",open:false}，只有侍卫可用 open:true 明保；playing 阶段 {type:"play",cards:[实体牌ID,...]} 或 {type:"pass"}。可自行选择同点实体副本；mark=emperor/guard 分别为皇牌/侍卫牌。rank=6–14（A）、15（2）、16（小王）、17（大王）。准备阶段其他玩家确认后需使用最新 revision，你自己的 decisionId 仍有效。';
export const actionTool=gameActionTool('直接提交登基、让位、明暗保确认、实体牌或让过。准备确认仅按本人的身份校验。',{
  oneOf:[actionVariant('enthrone'),actionVariant('cede'),actionVariant('declare',{open:{type:'boolean'}}),actionVariant('play',{cards:cardIds(168)}),actionVariant('pass')],
});
