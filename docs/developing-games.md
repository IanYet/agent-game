# 新增游戏

新增游戏只修改 `apps/web/src/games/<id>/` 和 `games/registry.ts`，随后发布静态网站。已经满足协议、能力和最低修复版本要求的连接器可以继续使用。

## 目录与注册

推荐使用 TypeScript/React，实现规则与界面；JSON Schema 用来声明工具参数和结果，无需设计大型 JSON 游戏 DSL。

```text
games/my-game/
  definition.ts   元数据、纯引擎边界、观察、工具与提示词
  engine.ts       领域规则和状态转换
  ui.tsx          Table、ConfigFields、Replay、Cover
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

生产模块应提供 `ui.Table` 与 `ui.Replay`。设置栏 `ConfigFields`、大厅 `Cover` 可选。中央界面会从模块读取名称、人数范围、默认人数、描述、tagline 和 runNoun。不要修改 App/controller/protocol/Harness 来增加游戏分支。

## 模块 API

准确类型见 [runtime/types.ts](../apps/web/src/runtime/types.ts)。

| API | 约定 |
| --- | --- |
| `id/version/stateVersion` | 稳定模块 ID、模块发行版本、当前状态格式版本 |
| `minPlayers/maxPlayers/defaultPlayers/defaultConfig` | 平台用于设置界面和基本人数校验；队伍、配置及其他业务约束在 create/next 校验 |
| `create(meta,random)` | 创建新桌初始领域状态 |
| `next(previous,meta,random)` | 同桌新一局；按稳定 playerId 决定继承、离桌或买入 |
| `finished(state)` | 判断整局结束 |
| `observe(run,playerId|null)` | 当前玩家的私有视图，null 表示观众 |
| `decisions(run)` | 当前待完成决策集合 |
| `tools(run,playerId)` | 为该玩家声明完整、固定的会话工具列表 |
| `initializePrompt/decisionPrompt` | 初始化与本次唤醒的提示；包含必要规则及私有观察 |
| `handleTool(run,request)` | 同步返回 `{state?,result}`；不原地修改 run |
| `humanAction(run,playerId,input)` | 同步规则转换，与工具路径使用同一引擎 |
| `timeout?(run,decision)` | 可选超时规则，返回新状态 |
| `restore(data,stateVersion)` | 校验当前格式的浏览器状态；不进行旧格式迁移 |
| `summary(run)` | 为通用历史页返回标题、说明、条目和日期 |
| `planning?(run)` | 下一轮设置文案、按玩家 ID 的余额及新玩家说明 |
| `rules(run?)` | 规则说明，可使用当前房间配置 |

`StoredRun<S>` 封装 `moduleId/moduleVersion/stateVersion/roomId/runId/index/roster/config/state`。规则只消费需要的领域数据；从 roster 转成引擎玩家时不要把 Harness 模型设置当作规则枚举。

随机发牌使用平台传入的 random，测试可提供种子随机源。平台使用浏览器加密随机源。

## 可运行的非牌类例子

[auction-fixture/definition.ts](../apps/web/src/games/auction-fixture/definition.ts) 是完整的密封竞价合约示例，测试时注册，生产大厅不加载。它不实现 Agent 或推理：

- 支持 2–20 位参与者，验证使用 12 位，超出当前牌类游戏座位范围。
- 每位参与者有独立预算和私有草案；所有未确认者同时待决策。
- `auction.peek` 读取自己的预算与草案，不泄露其他报价。
- `auction.offer({credits})` 可以反复修改，返回 text、structuredContent 和 image。
- `auction.confirm({})` 才完成本玩家决策；再次确认被拒绝。
- 决策 ID 包含 window 与 playerId，不含每次修改都递增的全局 revision。
- 当前轮结束保留 room 会话，新轮撤销旧 decision 的行动授权。

可以以它为契约参考，为自己的模块补充界面和领域规则。不要把测试驱动接入生产 Harness，或在用户缺少真实 Harness 时启用自动玩家。

## 工具与 schema

```ts
const tools: ToolDefinition[] = [{
  name:'auction.offer',
  description:'Stage a sealed offer; confirm separately.',
  requiresDecision:true,
  inputSchema:{
    type:'object',
    properties:{credits:{type:'integer',minimum:0,maximum:100}},
    required:['credits'],
    additionalProperties:false,
  },
}];
```

工具名、说明、输入/输出 schema 和完成规则均由模块定义。桥验证 JSON Schema，模块还必须验证当前阶段、玩家资格、资源余额等规则。不要在 schema 中增加让调用者冒充其他玩家的控制参数。

无业务错误的 handler 返回标准 MCP `CallToolResult`，可用 `toolResult(object)` 同时生成 JSON 文本与 structuredContent。声明 outputSchema 后成功结果必须匹配它。普通失败用 `toolResult({error:message},true)`，只返回错误内容，不套用成功结果的结构。

工具列表在会话建立时冻结。不要按瞬时阶段改变 tools/list；将各阶段能力固定声明，在 handler 和 allowedTools 中限制阶段。room 会话进入下一轮时若工具声明改变，平台会创建新会话。

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

平台只读 `agent-arcade.games.v3`，保存当前 run、最近 20 局和历史保留偏好。原生会话和令牌不存入浏览器。

当前没有旧用户数据，不提供旧格式兼容、迁移器或恢复导出。修改状态结构时递增 stateVersion；版本不匹配会拒绝载入并提示新建游戏。开发时可在浏览器开发者工具清除该键后重开。moduleVersion 用于标识模块发行，不替代 stateVersion 或连接器协议。

## 验证与发布

1. 写规则测试，验证合法/非法动作、结束条件、资源守恒和私有观察。
2. 用通用运行时测试多决策、旧 ID、重复提交、暂停、超时与会话策略；参考 [dynamic.test.ts](../apps/web/src/runtime/dynamic.test.ts)。
3. 运行 `npm test`、`npm run build:web`。
4. 连接已构建的连接器验证 tools/list、tools/call 和结果。可使用 `npm run test:dynamic-connector` 的协议驱动流程，不需要调用模型。
5. 部署 `dist/client/`。同一可信 origin 下新增游戏不更改连接器配置或 EXE。

需要新的 Harness、原生权限或不被当前协议表达的平台能力时，才修改连接器并协商新 capability 或协议。
