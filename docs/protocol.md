# 桥接协议 5 与动态 MCP

## 版本分离

| 版本/能力 | 定义 | 用途 |
| --- | --- | --- |
| 网页版本 | 根 `package.json` | 静态应用发行 |
| 连接器版本 | `apps/connector/version.json` | 连接器修复与发行 |
| 桥接协议 | `packages/protocol/src/index.ts` 的 PROTOCOL_VERSION | 网页 HTTP/SSE wire 格式 |
| required capabilities / minimumVersion | `apps/web/src/version.ts` | 网页所需能力与最低修复版本 |
| 模块 version / stateVersion | 各 GameModule | 模块发行与浏览器领域状态格式 |
| MCP/ACP 协商版本 | 官方 SDK/原生 Harness | 原生协议；不等于桥接协议 5 |

网页先读 health，检查协议、所需 capability 和最低连接器版本。不要求网页与连接器同版本或同 minor；满足条件的更高连接器可直接连接。新增游戏、提示词、工具名或 schema 不提高连接器版本要求。

基线能力：

- `dynamic-tools-v1`
- `json-schema-2020-12`
- `player-scopes-v1`
- `concurrent-decisions-v1`
- `structured-results-v1`
- `local-conversations-v1`

## HTTP 与事件

连接器仅绑定 loopback，校验 Host 与允许的 Origin。控制 API 需要连接时生成的 Bearer token。一个网页拥有控制权；SSE 断开后停止任务并撤销全部会话。

| 请求 | 作用 |
| --- | --- |
| GET /health | 连接器版本、协议、能力、原生 Harness 状态与各自模型目录 |
| POST /api/connect | 协议/能力握手，返回控制令牌 |
| GET /api/events | 授权 SSE：ready、tool、activity、usage、conversation |
| POST /api/sessions | 创建单玩家原生会话及固定工具注册表 |
| POST /api/sessions/:id/turn | 传 decisionId、模块提示词和可选模型/强度；按玩家并发 |
| POST /api/tool-results | 网页返回标准 MCP 结果 |
| POST /api/pause | 取消并等待全部活动推理 |
| DELETE /api/sessions | 撤销全部会话；可用 ids 数组只关闭指定会话 |
| POST /api/disconnect | 释放网页控制权 |
| POST /mcp/:scopeId/:capability | 原生 Harness 的标准 MCP 入口 |

会话请求：

```ts
interface SessionRequest {
  scopeId:string;
  playerId:string;
  kind:'codex'|'codex-acp'|'dsh'|'workbuddy';
  name:string;
  instructions:string;
  tools:ToolDefinition[];
  model?:string;
  reasoningEffort?:string;
}
```

没有 gameId 枚举、座位上界、牌类规则、固定行动参数或网页代码。创建时给会话生成随机 capability 和隔离工作目录。capability 封装玩家和作用域；MCP 参数不能改变绑定。

`/turn` 接受 `{decisionId,prompt,settings?}`。同一原生会话不允许重叠任务，不同会话可并发。桥只报告原生任务 completed，决策完成与否由网页模块检查。

转发的工具请求是 `{id,scopeId,playerId,decisionId?,tool,args}`；控制事件用 playerId 路由。工具结果通过 id 与原请求关联，默认 20 秒未得到网页响应即失败。

## 本地对话事件

`conversation` 事件包含 `{scopeId,playerId,entry,append?}`。`entry` 使用 `{id,time,kind,title,text}`，kind 为 instructions、prompt、message、reasoning、tool-call、tool-result、event 或 error。同一 id 的事件更新原条目；`append:true` 将流式片段接到原文之后，其他事件替换全文。时间使用 ISO 字符串。

连接器记录初始化指令、工具声明、实际发送给 Harness 的提示、回复、可见思考、工具参数和完整结果，以及权限答复、暂停与错误。原生会话结束前仍可转发收尾消息，避免最后一次行动丢失记录。认证交换、进程配置和带凭据的 MCP 地址不进入对话。

网页按作用域与玩家归属接收对话，按 runId/playerId 存入 `agent-arcade.conversations.v1`。流式内容合并后分批保存，页面隐藏或关闭前立即保存。开关只控制显示，记录不依赖好奇模式；刷新可重新查看已保存内容。原生 Harness 始终使用临时会话，不提供客户端历史保留开关。

## 动态注册与校验

使用 SDK 低层 `Server` 注册 `tools/list` 和 `tools/call`，不把 JSON Schema 转成硬编码 Zod 工具定义。没有为了动态工具升级原生 MCP 协议。

`ToolDefinition` 包括 name、title?、description、inputSchema、outputSchema?、annotations? 和平台授权字段 requiresDecision?。tools/list 隐去 requiresDecision，返回标准 MCP 声明。

平台限额与规则：

- 1–128 个工具，名字唯一，1–128 位 ASCII 字母/数字/下划线/点/连字符。
- 输入/输出 schema 顶层为 object；默认 JSON Schema 2020-12，也支持显式 draft-07。
- AJV 实际验证类型、required、范围、枚举、额外字段和结构，不做类型转换或静默删字段。format 不作强校验。
- 注册声明总计不超过 500 KB，description 不超过 20,000 字符；schema 深度/节点有限额。
- 不加载外部 schema 引用；注册后声明冻结。schema 不能携带可执行 JavaScript。
- 无效参数在桥内拒绝，不转发到浏览器；网页另做同样校验和领域规则校验。
- 每个成功结果先校验标准 CallToolResult，再校验 outputSchema；校验失败不提交网页状态。

dsh 的 tools.guard 与 WorkBuddy 的 allowedTools 来自当前注册表。Codex 仅挂载该玩家的 agent_game MCP，停用其他工具与服务；文件和命令审批一律拒绝，游戏工具审批只接受本会话注册、当前任务内可关联的调用。桥与网页仍分别校验玩家和决策。不改用户全局配置。工具说明和 MCP annotations 不授予原生权限。

## 决策授权

requiresDecision 工具必须存在该原生会话正在处理的 decision。桥将该 ID 附到请求，网页检查它仍属于当前 scope/player、仍在 pending 集合中且工具在 allowedTools 内。

旧 scope、完成的 decision、重复动作、暂停后的行动和其他玩家的请求都会被拒绝。只读工具可在暂停中读取当前模块允许的私有观察。会话撤销立即删除 capability，并取消其未完成的工具请求。

桥不理解领域 revision。并行竞价中一位玩家提交后，其他玩家仍使用各自稳定的 decisionId；顺序牌类模块自己验证 revision。

## 结果与兼容

结果是完整的 MCP CallToolResult，可包含 text、image、audio、resource、resource_link、structuredContent、isError 等 SDK 支持字段。协议不强制把它压缩为牌类文本。

成功结果声明 outputSchema 时必须带匹配的 structuredContent。错误结果可以只有 content + isError；本项目的 toolResult 错误助手不附加成功 schema 之外的 structuredContent，避免现有客户端仍尝试验证错误对象。

标准依据：[MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)、[TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[ACP Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup)。MCP capability 的作用域、网页串行提交和决策完成规则是本项目的上层约定。
