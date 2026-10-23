# 同桌 · Agent Arcade

人与本机 agents 一起玩游戏。首版实现斗地主。

这是两个独立交付物：

- **静态 Web app**：浏览器执行所有游戏规则，状态与牌谱存在 localStorage；可以放到任意静态托管服务。没有游戏后端、数据库或远程加入功能。
- **Windows 本地连接器**：单文件、免安装的 `同桌连接器.exe`。提供原生状态窗口，自带运行时；不托管网页、不自动打开浏览器。通过 ACP 适配器连接本机已有的 Codex，复用 ChatGPT 订阅登录。

## 使用

1. 在浏览器打开游戏网站。
2. 下载并双击 `同桌连接器.exe`，等待「已就绪」。不需要安装 Node.js，也不需要解压。
3. 网页点击 **连接 Codex**；如果浏览器询问本地网络权限，允许它访问本机连接器。
4. 创建斗地主牌桌，选择 1 位真人 + 2 位 agents，或 3 位 agents 观战。也可直接与浏览器内的练习机器人游玩。
5. 关闭连接器窗口即可退出。Windows 会结束它的所有子进程，包括 Node、ACP 适配器、Codex App Server 和工具宿主，并释放监听端口。

Windows 10/11 x64；本机需要安装 Codex，并用 ChatGPT 订阅登录。EXE 使用 Windows 自带的 .NET Framework 4.8。当前开发版本未做代码签名。

模型选择来自本机 Codex 的 `model/list`，不硬编码模型或假定订阅可访问某个模型。模型目录不代表账户权益，实际推理成功才确认该次调用可用。真实 agent 对弈会消耗 Codex 订阅额度；练习机器人不调用模型。

## 开发

开发环境使用 Node.js 22+。这项要求只适用于源码开发；最终 EXE 包含独立运行时。

```powershell
npm install
npm run dev
```

网页：`http://127.0.0.1:5173`；独立连接器：`http://127.0.0.1:3211`。

也可以分别运行 `npm run dev:web` 和 `npm run dev:connector`。网页与连接器之间没有 Vite 代理；生产构建与开发环境均通过跨源协议直接连接 loopback。

```powershell
npm test
npm run typecheck
npm run check:codex
npm run build
npm run package:windows
npm run test:windows
```

- `dist/client/`：完整静态网站，部署整个目录即可。
- `dist/connector/`：连接器的构建中间产物。
- `release/同桌连接器.exe`：最终单文件 Windows 应用。
- `package:windows` 使用 Windows 自带的 C# 编译器生成原生窗口启动程序，把运行时与桥接程序作为资源嵌入 EXE；所有许可证一起嵌入。
- 网站下载使用静态分片，浏览器拼接并校验 SHA-256 后保存为正常 EXE，以适配静态 CDN 的单文件大小限制；不需要下载后手动合并。

构建发布顺序为 `build` → `package:windows` → 部署 `dist/client`。打包后，下载清单及分片同时写入 `apps/web/public/downloads/` 与 `dist/client/downloads/`。它们是忽略的构建产物。

## 独立部署与来源配置

连接器仅绑定 `127.0.0.1`，默认端口 `3211`。它校验 Host 和网页 Origin，没有通配 CORS。

如果自行部署网站，在 `connector.config.json` 的 `allowedOrigins` 中加入网站完整 origin（协议 + 域名 + 非默认端口），重新打包连接器即可。也可以把该配置文件放在 EXE 旁边作为覆盖配置。默认包含本地开发、预览与本项目的静态站点来源。

高级环境变量：

| 变量 | 用途 |
| --- | --- |
| `CODEX_PATH` | 指定本机 `codex.exe` 或 npm 安装的 `codex.js` |
| `CODEX_ACP_PATH` | 指定兼容 ACP v1 且支持 HTTP MCP 的适配器 |
| `AGENT_GAME_WEB_ORIGINS` | 以逗号分隔的可信网页来源，覆盖配置文件 |
| `AGENT_GAME_DATA_DIR` | 指定连接器的隔离工作目录；不保存牌局 |
| `AGENT_GAME_PORT` | 开发或测试时更改连接器端口；网页默认仍连接 3211 |

运行时按内容哈希自动展开到系统临时目录 `AgentArcade/runtime-*`，可重复使用；无需安装程序或修改注册表。隔离工作目录默认在 `%LOCALAPPDATA%/AgentArcade/sessions`。Codex 的登录状态与会话存储继续由 Codex 自己管理，连接器不读取或复制凭据文件。

## 架构

```mermaid
flowchart LR
  W[独立静态网页<br/>React + 斗地主引擎 + localStorage]
  C[Windows EXE<br/>原生窗口 + Job Object]
  B[本机桥接程序<br/>127.0.0.1:3211]
  A[Codex ACP 适配器]
  H[本机 Codex App Server<br/>已有 ChatGPT 登录]
  W <-->|带令牌的 HTTP + SSE| B
  C -->|管理整个进程树| B
  B <-->|ACP stdio| A
  A <--> H
  H <-->|按座位隔离的 HTTP MCP| B
```

Web app 拥有权威游戏状态。轮到 agent 时，网页让连接器唤醒对应会话；agent 发起 MCP 工具调用，连接器把调用转发到网页，网页校验行动、更新状态，再把工具结果送回。每局每个 agent 一个独立会话，回合之间保留上下文；一轮唤醒只能成功行动一次。

MCP 工具：

| 工具 | 能力 |
| --- | --- |
| `game_get_state` | 自己的手牌、其他玩家余牌数、公开历史、revision 与部分合法行动 |
| `game_legal_actions` | 分页获取合法行动及 actionId |
| `game_act` | 用最新 revision 和 actionId 执行本座位的一次行动 |
| `game_rules` | 当前规则及计分说明 |

每个座位拥有独立、仅存于连接器内存的 MCP capability token。工具不接受任意 seat 参数。过期凭据、非自己回合、重复行动、过期 revision、非法牌型均被拒绝。叫分时不披露底牌。只有本局结束才向界面公开剩余手牌。

网页刷新或 SSE 断开时，本机连接器停止玩家任务；网页恢复 localStorage 时默认暂停，需要主动继续。认证令牌不写入 localStorage。不同网页不能同时接管同一个连接器，不提供邀请或远程加入入口。

## Codex 接入说明

ACP 与 Codex App Server 是两种协议。默认 `Codex · ACP` 使用 `@agentclientprotocol/codex-acp`，适配到本机现有 Codex 可执行文件；另有 `Codex · App Server` 原生适配器。这里创建的是本机 harness 会话，不是通过 UI 自动化操纵桌面 App。

游戏会话采用只读沙箱，关闭 shell、浏览器、插件、子 agent、hooks 与无关 MCP 服务；这些覆盖只作用于本次进程与线程，不修改用户的全局 Codex 配置。订阅认证继续完全由 Codex 处理，不要求 API Key。

本机验证遇到默认 WebSocket 推理连接反复重试，因此游戏使用独立的 `agent_arcade_chatgpt` provider 配置，关闭 WebSocket，保留 Codex 的 ChatGPT 认证与认证模式对应的默认 endpoint，不自行指定或调用私有地址、不提取 OAuth token。这个 provider 名称避开新版本 Codex 保留的内置 provider ID。

参考：[OpenAI App Server 文档](https://learn.chatgpt.com/docs/app-server)、[OpenAI 认证说明](https://learn.chatgpt.com/docs/auth)、[provider 默认地址规则](https://learn.chatgpt.com/docs/enterprise/roll-out-a-gateway)、[Codex ACP 适配器](https://github.com/agentclientprotocol/codex-acp)、[ACP 会话与 MCP](https://agentclientprotocol.com/protocol/v1/session-setup)、[浏览器本地网络权限](https://developer.chrome.com/blog/local-network-access)。

## 验证与边界

普通测试不使用订阅推理。它们包含牌型、比较、100 局自动对弈、手牌隔离、叫分、春天计分、状态恢复、真实 HTTP MCP 整局联调、重复行动拒绝、来源校验、断线与凭据撤销。

`test:windows` 针对最终 EXE，创建一个真实但不开始推理的 ACP/Codex 玩家会话，随后分别测试正常退出和**仅强制结束 EXE 本身**。检查所有子进程消失、监听端口可以重新绑定、相同端口可以立即重启。强制退出测试不使用 `taskkill /T`，避免掩盖进程树管理错误。

需要主动进行真实订阅推理时运行：

```powershell
npx tsx scripts/smoke-game.ts
npx tsx scripts/smoke-game.ts --native
```

默认 smoke 检查三位独立玩家的叫分与合法出牌；它会消耗订阅额度，完成后自动停止会话。真实对局耗时和成功率仍取决于本机 Codex 版本、网络与账户限制；失败时会暂停并显示错误，不会替换为练习机器人冒充模型。

首版只实现斗地主；规则变体详见网页规则。重启连接器会新建玩家会话；未完成的浏览器牌局可以恢复，但不恢复旧 agent 对话。尚未提供代码签名、自动更新或 Windows ARM64 构建。

后续游戏扩展 `packages/game-core` 中的 `GameDefinition` 与目录；后续 harness 实现连接器的 `HarnessAdapter`。浏览器桥接协议集中在 `packages/protocol`，不依赖某个模型厂商。
