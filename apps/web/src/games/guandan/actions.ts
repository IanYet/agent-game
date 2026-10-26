import {actionObject,actionVariant,cardIds,gameActionTool,identifier,integer,oneOfValues} from '../action-schema';

export const ACTION_HELP='action 用法：贡还阶段 {type:"tribute",card:实体牌ID} 或 {type:"return",card:实体牌ID}；playing 阶段 {type:"pass"}，或 {type:"play",cards:[实体牌ID,...],combination:{kind:"pair",rank:7}}。combination 声明牌型含义，张数按 cards 推导：kind 为 single/pair/triple/full_house/straight/pair_run/triple_run/bomb/straight_flush/four_jokers（单张/对子/三张/三带对/顺子/三连对/钢板/炸弹/同花顺/四王炸）。rank 为同点主体点数或顺牌最高点；A 作低位的顺子/三连对/钢板分别填 5/3/2，四王炸填 17。full_house 必须另填 pairRank（带对点数），straight_flush 必须另填 suit（S/H/C/D）；其他牌型不填这两个字段。点数 2–14（A）、16（小王）、17（大王）；S/H/C/D 为黑桃/红桃/梅花/方块。红桃级牌的配牌含义由声明确定，实体牌 ID 保持原值。';
const rank=integer(2,17);
export const actionTool=gameActionTool('自行选择实体牌并声明牌型，或直接提交贡还与不出。引擎按当前级牌、逢人配、阶段和压牌规则裁定。',{
  oneOf:[
    actionVariant('play',{cards:cardIds(10),combination:{oneOf:[
      actionObject({kind:oneOfValues(['single','pair','triple','straight','pair_run','triple_run','bomb','four_jokers']),rank}),
      actionObject({kind:{const:'full_house'},rank,pairRank:rank}),
      actionObject({kind:{const:'straight_flush'},rank,suit:oneOfValues(['S','H','C','D'])}),
    ]}}),
    actionVariant('pass'),actionVariant('tribute',{card:identifier}),actionVariant('return',{card:identifier}),
  ],
});
