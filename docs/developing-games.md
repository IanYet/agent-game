# 新增游戏

新增游戏的规则与操作界面放在 `apps/web/src/games/<id>/`，在 `games/registry.ts` 注册后发布静态网站。独立背景物件也放在游戏目录，并在 `visuals/table-models.ts` 注册主题、在 `GameBackground.tsx` 提供静态图案。已经满足协议、能力和最低修复版本要求的连接器可以继续使用。

## 目录与注册

推荐使用 TypeScript/React，实现规则与界面；JSON Schema 用来声明工具参数和结果，无需设计大型 JSON 游戏 DSL。

```text
games/my-game/
  definition.ts   元数据、纯引擎边界、观察、工具与提示词
  actions.ts      自然行动参数、JSON Schema 与字段说明
  engine.ts       领域规则和状态转换
  ui.tsx          Table、ConfigFields、Replay
  index.ts        导出完整模块
  engine.test.ts  有实际约束意义的规则测试
```

```ts
// my-game/index.ts
import {definition} from './definition';
import {Table,Replay} from './ui';
export const game = {...definition, ui:{Table,Replay}};

// games/registry.ts：新增一次 import 和一个条目
import {game as myGame} from './my-game';
export const gameRegistry = new GameRegistry([existingGame, myGame]);
```

生产模块应提供 `ui.Table` 与 `ui.Replay`，设置栏 `ConfigFields` 可选。中央界面从模块读取名称、人数范围、默认人数、描述、tagline、runNoun 与 `presentation` 的英文名、抽象字标和材质色调。`Table` 仅挂载具体游戏场景与行动；导航、暂停、玩家查看和下一局确认由公共框架负责。不要修改 App/controller/protocol/Harness 来增加游戏分支。

## 模块 API

准确类型见 [runtime/types.ts](../apps/web/src/runtime/types.ts)。

| API | 约定 |
| --- | --- |
| `id/version/stateVersion` | 稳定模块 ID、模块发行版本、当前状态格式版本 |
| `minPlayers/maxPlayers/defaultPlayers/defaultConfig` | 平台用于设置界面和基本人数校验；队伍、配置及其他业务约束在 create/next 校验 |
| `presentation` | 大厅抽象画廊的英文名、字标和暖／冷色调；副本复用同一模块 ID |
| `validateConfig?(config)` | 设置时提供持续可见的参数校验，仍在 create 中执行规则校验 |
| `activity(run)` | 当前阶段与说明；需要行动的参与者从 decisions 的 actorId 集合读取 |
| `create(meta,random)` | 创建新桌初始领域状态 |
| `next(previous,meta,random)` | 同桌新一局；按稳定 playerId 决定继承、离桌或买入 |
| `finished(state)` | 判断整局结束 |
| `observe(run,playerId|null)` | 当前玩家的私有视图，null 表示公开记录；供提示词与工具使用 |
| `tableView(run,playerId|null,{revealHands})` | 浏览器牌桌视图；按显式标记公开全部手牌，不能用于 Agent 提示或工具 |
| `decisions(run)` | 当前待完成决策集合 |
| `tools(run,playerId)` | 为该玩家声明完整、固定的会话工具列表 |
| `initializePrompt(run,playerId)` | 身份、规则和操作说明；不放动态观察或历史 |
| `historyCursor(run)` | 当前事件截止序号，供运行时确认送达范围 |
| `decisionPrompt(run,decision,afterEvent)` | 当前私有观察，以及 afterEvent 之后的新增记录；0 表示完整历史 |
| `handleTool(run,request)` | 同步返回 `{state?,result}`；不原地修改 run |
| `humanAction(run,playerId,input)` | 同步规则转换，与工具路径使用同一引擎 |
| `timeout?(run,decision)` | 可选超时规则，返回新状态 |
| `restore(data,stateVersion)` | 校验当前格式的浏览器状态；不进行旧格式迁移 |
| `summary(run)` | 为通用历史页返回标题、说明、条目和日期 |
| `planning?(run)` | 下一轮设置文案、按玩家 ID 的余额、新玩家说明及不能继续的玩家原因；公共层不判断筹码等领域条件 |
| `rules(run?)` | 规则说明，可使用当前房间配置 |

`StoredRun<S>` 封装 `moduleId/moduleVersion/stateVersion/roomId/runId/index/roster/config/state`。规则只消费需要的领域数据；从 roster 转成引擎玩家时不要把 Harness 模型设置当作规则枚举。

随机发牌使用平台传入的 random，测试可提供种子随机源。平台使用浏览器加密随机源。

提示词通过玩家自己的 observe 生成，再过滤增量事件；不要过滤原始存档后直接外发，避免泄露隐藏牌。game_get_state 保留完整可见记录。私有手牌等信息由当前观察按玩家过滤，公开观察和导出不能泄露隐藏信息。游标由运行时绑定实际会话，不存进游戏规则状态。

## 工具与 schema

```ts
const tools: ToolDefinition[] = [{
  name:'game_act',
  description:'提交加注到的本轮总额，由规则引擎检查加注权与筹码。',
  requiresDecision:true,
  inputSchema:{
    type:'object',
    properties:{
      revision:{type:'integer',minimum:1},
      action:{type:'object',properties:{type:{const:'raise'},amount:{type:'integer',minimum:1}},required:['type','amount'],additionalProperties:false},
    },
    required:['revision','action'],
    additionalProperties:false,
  },
}];
```

工具名、说明、输入/输出 schema 和完成规则均由模块定义。桥验证 JSON Schema，模块还必须验证当前阶段、玩家资格、资源余额等规则。不要在 schema 中增加让调用者冒充其他玩家的控制参数。

各游戏统一提供 `game_get_state`、`game_rules` 和 `game_act({revision,action})`。Agent 根据完整规则、行动字段说明和当前可见局面自行构造动作。观察与提示不生成合法行动清单，不提供 `actionId`、`game_legal_actions` 或另一个出牌入口；真人界面仍可用引擎的合法选择生成器提供按钮、选牌和提示。引擎必须直接验证提交内容，不能把是否出现在一个代表性候选列表中作为合法性依据。

| 游戏 | 自行构造的行动 |
| --- | --- |
| 斗地主 | 叫分 `bid/value`，出牌 `play/cards`，不出 `pass` |
| 德州 | `fold/check/call`，`raise/amount`；amount 为本轮累计下注额，可选任意合法整数 |
| 保皇 | `enthrone/cede`、`declare/open`、`play/cards`、`pass`；保留实体王牌及标记牌身份 |
| 国际象棋 | `move/uci/offerDraw?`、`claim_draw/reason/uci?`、接受或拒绝提和、认输 |
| 花砖物语 | `{source,color,row}`；source=0 是中央，其余为工厂编号，row=0 是地板，1–5 是图案行 |
| 富饶之城 | 选角、收入、保留抽牌、各身份及建筑技能、建造、拆除、墓地反应、结束回合 |
| 璀璨宝石 | 拿异色或同色宝石、明暗预留、购买及可选支付组合、超额归还、选择贵族 |
| 掼蛋 | `play/cards/combination`、`pass`、`tribute/card`、`return/card`；combination 用 kind/rank 及需要的 suit/pairRank 声明含义 |
| 卡坦岛 | 初始定居点与道路、掷骰、弃牌、强盗地块与目标、建造、银行资源组合、玩家报价／还价／成交、发展卡与结束回合 |
| 勃艮第城堡 | 庄园与起始格、骰子拿取／铺放／售货／取工人、银币购买、即时连锁、船只仓库与货物类型、结束回合 |
| 波多黎各 | 选角、地块与庄园、拒领或接受人员、全板人员布置、建筑与折扣、生产、贸易、商品与货船、保留商品数量及可选建筑效果 |

各模块的 `actions.ts` 声明全部阶段的参数范围与字段含义，`game_rules` 同时返回完整规则和行动说明。实体牌 ID 来自玩家可见的手牌或市场；身份、目标和金额等字段表达游戏含义。观察需保留自行判断所需的约束，例如德州加注权与上下限、富饶之城本身份已用技能和建造次数、宝石超额归还数量，不能为缩短消息删掉必要规则或可见状态。

提交先校验作用域、玩家、当前 decisionId 和 revision，再由同一纯引擎检查规则。失败只返回可纠正的原因，不改手牌、资源、事件、revision 或决策窗口；玩家可修正后重试。状态过期时先用 `game_get_state` 刷新。成功一次后结束任务；新的决策由平台再次触发。

无业务错误的 handler 返回标准 MCP `CallToolResult`，可用 `toolResult(object)` 同时生成 JSON 文本与 structuredContent。声明 outputSchema 后成功结果必须匹配它。普通失败用 `toolResult({error:message},true)`，只返回错误内容，不套用成功结果的结构。

工具列表在会话建立时冻结。不要按瞬时阶段改变 tools/list；将各阶段能力固定声明，在 handler 和 allowedTools 中限制阶段。room 会话进入下一轮时若工具声明改变，平台会创建新会话。

`game_get_state` 在 `events` 字段返回当前局／手从发牌开始的完整可见记录，`seq` 按发生顺序递增。初始化只包含身份、完整规则和字段说明；首次决策携带当前局面与完整历史，之后只携带新增记录。更换模型或重建会话时重新同步完整上下文。界面显示条数不限制 Agent 读取，下一局／手开始后记录重置。记录中的 `cards` 只包含已经公开的牌，不包含对手未公开的手牌、牌库或烧牌。

## 决策设计

顺序游戏可以返回当前行动者的一个 decision；同时游戏返回多个。模块必须保证 decisionId 在自己的语义窗口内稳定，并且完成后不再复用。一个玩家在一段原生 prompt 内可以有多次交互。

```ts
decisions: run => run.roster
  .filter(p => !run.state.confirmed[p.playerId])
  .map(p => ({
    decisionId: run.state.window + ':' + p.playerId,
    actorId: p.playerId,
    allowedTools:['auction.offer','auction.confirm'],
  }))
```

不要把全局 revision 塞进同时决策 ID，否则另一个玩家的提交会错误地结束当前玩家的窗口。业务确实需要乐观锁时，使用该玩家或该资源自己的版本。

平台检查当前 decision 是否存在、actor 是否匹配以及工具是否获准。模块提交后移除该 decision 才算完成；只修改草案不算完成。

## 状态版本与开发期存档

平台只读 `agent-arcade.games.v4`，保存当前 run、最近 20 局和好奇模式偏好。对话另存于 `agent-arcade.conversations.v1`，按 runId/playerId 保留完整指令、回复、思考与工具结果。两类存档都不迁移旧格式。原生会话句柄不用于恢复，令牌不存入浏览器。

当前没有旧用户数据，不提供旧格式兼容、迁移器或恢复导出。修改状态结构时递增 stateVersion；版本不匹配会拒绝载入并提示新建游戏。开发时可在浏览器开发者工具清除该键后重开。moduleVersion 用于标识模块发行，不替代 stateVersion 或连接器协议。

## 玩家卡与状态动效

游戏里的玩家身份、手牌与操作区域使用公共 `PlayerCard`，不要各自实现思考光效、弃牌滤镜或单独的倾斜参数。侧栏积分、动态等普通信息继续使用 `FoilPanel`。

```tsx
import {PlayerCard, PlayerCardAvatar, playerCardState} from '../../visuals/PlayerCard';

const visualState = playerCardState({
  active: currentActorIds.includes(player.playerId),
  paused: snapshot.paused,
  finished: game.finished,
  folded: player.folded, // 不存在弃牌规则时省略
  runtime: snapshot.seats.find(seat => seat.playerId === player.playerId),
});

<PlayerCard state={visualState} className="my-game-player">
  <PlayerCardAvatar kind={player.kind} seat={player.seat} />
  <strong>{player.name}</strong>
  <span data-player-status>{statusText}</span>
  {/* 游戏自己的公开信息与状态文案 */}
</PlayerCard>
```

`PlayerCardState` 包含 `waiting`、`connecting`、`thinking`、`acting`、`folded`、`paused`、`finished`。也可直接传入其中一个状态，适配同时行动的游戏。弃牌优先级最高，其后是结束和暂停；等待回合不因 Agent 上次任务尚未收尾而显示思考。头像必须放在对应的 `PlayerCard` 内，才能取得正确状态；不要给每位玩家单独创建 WebGL 绘制器。全 Agent 观战或好奇模式开启时，公共 PlayerCardAvatar 自动把 Agent 光球作为对话弹窗入口，游戏无需自行绑定点击。将光球放在独立区域，避免挤进姓名行；若编号已在姓名旁显示，给 `PlayerCardAvatar` 传入 `showNumber={false}`，关闭光球下方的重复编号。

真人主卡使用 `primary`，并传入 `data-player-surface` 和 `data-cursor-lens="off"`；出牌／下注按钮与输入放进主卡内部。`tableActions` 提供暂停／继续或准备下一局的控制；规则、玩家与模型、选择新桌由公共 `GameChrome` 放在游戏标题右侧。所有卡片共用 20 CSS px 的最大屏幕边缘位移。状态光效、静态偏好、透镜画布同步由公共层处理，状态文案仍由游戏提供。

## 建筑牌与贵族牌

需要暗色镭射牌面时，复用 `apps/web/src/visuals/HolographicCard.tsx`。它统一处理卡面纹路、指针光照、圆角饰圈、选中边框和透镜显示；游戏提供内容与语义。可配置光色、彩虹效果、等高线或王冠纹路、尺寸和静止光点位置。属性、调用示例与受光图标的接法见[公共镭射卡组件](holographic-card.md)。

## 验证与发布

1. 先在游戏目录写并运行规则测试，再改实现。直接构造行动覆盖合法与非法选择、失败不改状态、回合推进、结束条件、结算、资源守恒和信息可见范围；不要让新案例仅从合法行动生成器取样。
2. 运行 `npm test` 和 `npm run build:web`。自动测试只覆盖游戏内容与规则，不为运行时、界面、协议或连接器另建测试。
3. 以至少 1920×1080 打开网页并连接本机连接器，实际检查设置、真人行动、Agent 直接提交及纠错、暂停继续与回放；更换模型或重建会话后检查完整上下文。
4. 部署 `dist/client/`。同一可信 origin 下新增游戏不更改连接器配置或 EXE。

需要新的 Harness、原生权限或不被当前协议表达的平台能力时，才修改连接器并协商新 capability 或协议。
