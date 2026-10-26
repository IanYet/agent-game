import {actionVariant,cardIds,gameActionTool,identifier,integer,oneOfValues} from '../action-schema';

export const ACTION_HELP=`action 用法：
draft：{type:"choose",role:1…8}，从本人 available 选身份。
income：{type:"income",source:"gold"|"cards"}；keep：{type:"keep",cards:[pendingCards中的ID,...]}，恰好 keepCount 张。
income/main 的身份技能：{type:"assassinate",role:2…8}、{type:"steal",role:3…8}、{type:"tax"}、{type:"magic_swap",target:另一玩家seat}、{type:"magic_cycle",cards:[自己手牌ID,...]}（可空）。须符合 called 身份与 powerUsed/taxUsed。
assassinate/steal 的 role 是本轮身份牌编号，不是玩家 seat；steal 的 role:4 针对本轮国王牌，不能把 crown 王冠持有人当作国王。国王牌可能暗弃，无人持有时偷盗落空；不能偷已被刺杀的身份。
income/main 的建筑技能：{type:"laboratory",card:自己手牌ID}、{type:"smithy"}，须拥有建筑并检查 labUsed/smithyUsed；每个身份重置次数。
main：{type:"build",card:自己手牌ID}，限 built<buildLimit；{type:"end"} 结束身份回合；军阀可 {type:"destroy",target:玩家seat,card:该玩家城市建筑ID}，拆除会自动结束回合。
graveyard：{type:"recover",take:true|false}，决定是否支付 1 金币收回 graveyard。
所有 card/cards 使用实体 ID，key 对照建筑表；只能在自己的当前决策提交。income/main 可暂不使用技能；正常收入必须完成。keep/graveyard 只处理对应选择。`;
export const actionTool=gameActionTool('直接提交当前阶段的选角、收入、选牌、技能、建造、拆除、墓地反应或结束动作；检查身份、费用、次数与目标。',{
  oneOf:[
    actionVariant('choose',{role:integer(1,8)}),actionVariant('income',{source:oneOfValues(['gold','cards'])}),actionVariant('keep',{cards:cardIds(3,0)}),
    actionVariant('assassinate',{role:integer(2,8)}),actionVariant('steal',{role:integer(3,8)}),actionVariant('tax'),
    actionVariant('magic_swap',{target:integer(0,6)}),actionVariant('magic_cycle',{cards:cardIds(66,0)}),
    actionVariant('build',{card:identifier}),actionVariant('laboratory',{card:identifier}),actionVariant('smithy'),
    actionVariant('destroy',{target:integer(0,6),card:identifier}),actionVariant('recover',{take:{type:'boolean'}}),actionVariant('end'),
  ],
});
