import {actionVariant,gameActionTool,identifier,integer} from '../action-schema';
const dice={die:integer(0,1),workers:integer(0,Number.MAX_SAFE_INTEGER)};
export const ACTION_HELP=`只提交当前步骤的自然行动，不提供 actionId 或合法行动列表。
观察中的 depots[0] 是黑市，depots[1]–depots[6] 才是对应骰值的编号仓库；goodsDepots[0]–goodsDepots[5] 分别对应 1–6 号仓库的货物。players[].estate 与其 boardId 对应的 boards[].cells 顺序一致，null 是空格。tiles 和 goodsCatalog 给出当前可见实体的颜色、种类、数量或货物类型。
开局 setup：{type:"setup",boardId:获配庄园编号,cellId:"D4"}，起始格必须为该庄园城堡色，庄园格 ID 按 A–G 行、每行自左向右从 1 编号。
普通回合的四种骰子行动：{type:"take",die:0,tileId:"可见仓库板块ID",workers:1,discardTileId:"旧暂存板块ID"}；{type:"place",die:1,tileId:"自己暂存板块ID",cellId:"C3",workers:0}；{type:"sell",die:0,goodsType:4,workers:0}；{type:"workers",die:1}。die 是两颗骰子的下标 0/1，不是点数。workers 可省略为 0，表示愿意支付的最多工人数，只扣所需最少数量；预算不得超过持有量。discardTileId 仅在拿取或购买时暂存区已满才提供，必须为自己的旧暂存板块。
每回合一次购买：{type:"buy",tileId:"可见板块ID",discardTileId?:"旧暂存板块ID"}，花 2 银币，不用骰子。通常只能买黑市，知识 6 可买所有仓库；仍只能买一次。立即效果与连锁结束后才可买。
pending 指明立即效果。castle：任选四种骰子行动，省略 die、workers；place：市政厅只允许 {type:"place",tileId,cellId}，忽略骰值但遵守其他放置规则；take：建筑只允许 {type:"take",tileId,discardTileId?}，遵守 pending.colors 和编号仓库限制；sell：仓库只允许 {type:"sell",goodsType}；上述建筑可用 {type:"decline"} 放弃可选效果。城堡总能取工人，不可放弃。
ship：{type:"ship",depots:[6,1],goodsTypes:[1,3]}。仓库编号 1–6；通常一座，知识 5 最多两座且相邻，6/1 相邻。goodsTypes 为要收取的类型 1–6，不是货物 ID；已有类型须全取，新类型应装满可用类型位，且每个选中类型的全部件数都收取。全部能装下时可省略 goodsTypes，类型过多则必须指定选择。不能丢已有货物；无可收货物仍须选仓完成船效果。
两颗骰子用完、所有立即效果处理完后，仍可购买，再提交 {type:"end_turn"}。每次成功后结束本次任务，平台会为同一玩家的下一步或下一位玩家再次发起决策。`;
export const actionTool=gameActionTool('提交 2011 原版的庄园选择、骰子行动、黑市购买、建筑/城堡连锁、船只收货或结束回合；直接检查所选目标、资源、效果与时机。',{
  oneOf:[
    actionVariant('setup',{boardId:integer(1,9),cellId:identifier}),
    actionVariant('take',{...dice,tileId:identifier,discardTileId:identifier},['die','workers','discardTileId']),
    actionVariant('place',{...dice,tileId:identifier,cellId:identifier},['die','workers']),
    actionVariant('sell',{...dice,goodsType:integer(1,6)},['die','workers']),
    actionVariant('workers',{die:integer(0,1)},['die']),
    actionVariant('buy',{tileId:identifier,discardTileId:identifier},['discardTileId']),
    actionVariant('ship',{depots:{type:'array',items:integer(1,6),minItems:1,maxItems:2,uniqueItems:true},goodsTypes:{type:'array',items:integer(1,6),minItems:0,maxItems:3,uniqueItems:true}},['goodsTypes']),
    actionVariant('decline'),actionVariant('end_turn'),
  ],
});
