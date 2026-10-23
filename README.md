# 同桌 · Agent Arcade

人与本机 agents 一起玩斗地主和无限注德州扑克。当前版本 v0.3.0，网页/连接器协议 3。

源码：[IanYet/agent-game](https://github.com/IanYet/agent-game) · 网页：[同桌 · Agent Arcade](https://ianyet.github.io/agent-game/) · Windows EXE：[GitHub Releases](https://github.com/IanYet/agent-game/releases/latest)。

这是两个独立交付物：

- **静态 Web app**：浏览器执行所有游戏规则，状态与牌谱存在 localStorage；可以放到任意静态托管服务。没有游戏后端、数据库或远程加入功能。
- **Windows 本地连接器**：单文件、免安装的 `同桌连接器.exe`。提供原生状态窗口，自带运行时；不托管网页、不自动打开浏览器。连接本机已有的 Codex、dsh（DeepSeek Harness）或 WorkBuddy 公开 ACP 接口，各自使用自己的登录与模型目录。

## 使用

1. 在浏览器打开游戏网站。
2. 下载并双击连接器 EXE，等待「已就绪」。Releases 文件名为 `tongzhuo-connector-windows-x64.exe`，本地打包名为 `同桌连接器.exe`。不需要安装 Node.js，也不需要解压。
3. 网页点击 **连接本机**；如果浏览器询问本地网络权限，允许它访问本机连接器。网页的「本地连接」列出每种 Harness 的就绪状态、独立模型数量及未就绪原因。
4. 创建斗地主（三人）或德州（2–9 人）牌桌，至多一位真人，也可以全 Agent 观战。每位玩家单独选择 Harness、模型和思考强度。
5. 最小化或关闭窗口会缩到 Windows 右下角托盘，游戏继续运行。双击托盘图标或在菜单选择「显示窗口」可恢复；选择「退出连接器」才会退出。Windows 会结束它的所有子进程，包括 Node、ACP 适配器、Codex App Server 和工具宿主，并释放监听端口。
6. 在连接器窗口或托盘菜单选择「检查更新」。发现更新后点击「下载更新」，默认浏览器会打开 GitHub 最新 Windows EXE 的下载链接。下载后退出旧连接器，再双击新 EXE。

Windows 10/11 x64；本机需要安装并登录所选 Harness。Codex 使用 ChatGPT 订阅；dsh 与 WorkBuddy 使用各自的原生登录/模型配置。连接网页不再要求先登录 Codex。EXE 使用 Windows 自带的 .NET Framework 4.8。当前开发版本未做代码签名。

模型选择来自各 Harness 的原生目录，Codex 使用 `model/list`，dsh/WorkBuddy 使用 ACP `configOptions`；不硬编码可用模型或假定订阅权益。模型目录不代表账户权益，实际推理成功才确认该次调用可用。真实 Agent 对弈会消耗相应账户额度。

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
npm run check:harnesses
npm run build
npm run package:windows
npm run test:windows
```

- `dist/client/`：完整静态网站，部署整个目录即可。
- `dist/connector/`：连接器的构建中间产物。
- `release/同桌连接器.exe`：最终单文件 Windows 应用。
- `package:windows` 使用 Windows 自带的 C# 编译器生成原生窗口启动程序，把运行时与桥接程序作为资源嵌入 EXE；所有许可证一起嵌入。
- 正式网页从 GitHub Releases 下载单文件 EXE。本地构建还支持静态分片，浏览器拼接并校验 SHA-256 后保存为正常 EXE，以适配其他静态 CDN 的单文件大小限制；不需要下载后手动合并。

构建发布顺序为 `build` → `package:windows` → 部署 `dist/client`。打包后，下载清单及分片同时写入 `apps/web/public/downloads/` 与 `dist/client/downloads/`。它们是忽略的构建产物。

## 独立部署与来源配置

GitHub Pages 使用 `.github/workflows/pages.yml`：每次推送到 `main`，Windows runner 自动测试、构建网页、打包单文件 EXE，再将纯静态的 `dist/client/` 发布到 Pages。仓库 Settings → Pages 的 Source 选择 **GitHub Actions**。网页连接前会同时校验连接器版本系列、最低补丁版本与通信协议。不兼容时阻止握手，并显示检测版本、所需版本和最新连接器下载按钮；升级后可直接重新连接。网页下载按钮通过 `VITE_CONNECTOR_DOWNLOAD_URL` 指向最新 GitHub Release；每次构建的 EXE 也保存在 Actions 的 `windows-connector-x64` artifact 中。发布新版本时，将验证过的 EXE 以 `tongzhuo-connector-windows-x64.exe` 文件名上传到对应 Release 即可。

Vite 的资源与下载路径支持仓库子路径。工作流使用 Pages 返回的 `base_path`；本地构建默认相对路径，也可用 `PAGES_BASE_PATH=/agent-game/` 显式指定。

连接器仅绑定 `127.0.0.1`，默认端口 `3211`。它校验 Host 和网页 Origin，没有通配 CORS。

如果自行部署网站，在 `connector.config.json` 的 `allowedOrigins` 中加入网站完整 origin（协议 + 域名 + 非默认端口），重新打包连接器即可。也可以把该配置文件放在 EXE 旁边作为覆盖配置。默认包含本地开发、预览与本项目的静态站点来源。

高级环境变量：

| 变量 | 用途 |
| --- | --- |
| `CODEX_PATH` | 指定本机 `codex.exe` 或 npm 安装的 `codex.js` |
| `CODEX_ACP_PATH` | 指定兼容 ACP v1 且支持 HTTP MCP 的适配器 |
| `DSH_PATH` | 指定官方 dsh CLI 的 `.exe` 或 Node 入口，不是其他编码助手 |
| `DSH_PROFILE` | 指定支持公开 ACP 的 dsh profile，默认 `acp` |
| `WORKBUDDY_PATH` | 指定 WorkBuddy/CodeBuddy 支持公开 ACP 的 CLI 入口；不能使用只支持桌面私有通道的入口 |
| `AGENT_GAME_WEB_ORIGINS` | 以逗号分隔的可信网页来源，覆盖配置文件 |
| `AGENT_GAME_DATA_DIR` | 指定连接器的隔离工作目录；不保存牌局 |
| `AGENT_GAME_PORT` | 开发或测试时更改连接器端口；网页默认仍连接 3211 |

运行时按内容哈希自动展开到系统临时目录 `AgentArcade/runtime-*`，可重复使用；无需安装程序或修改注册表。隔离工作目录默认在 `%LOCALAPPDATA%/AgentArcade/sessions`。Codex 的登录状态与会话存储继续由 Codex 自己管理，连接器不读取或复制凭据文件。

## 架构

```mermaid
flowchart LR
  W[独立静态网页<br/>React + 游戏引擎 + localStorage]
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

Web app 拥有权威游戏状态。轮到 agent 时，网页让连接器唤醒对应会话；agent 发起 MCP 工具调用，连接器把调用转发到网页，网页校验行动、更新状态，再把工具结果送回。斗地主每局首次行动时创建独立会话；德州每手首个行动前为所有 Agent 创建独立会话，初始上下文含自己的底牌、起始筹码、当前可用筹码及已投入筹码。手内保留上下文，暂停继续复用会话；暂停后可分别修改模型与思考强度，下一次行动生效。一轮唤醒只能成功行动一次。没有练习机器人或内置自动玩家，测试中的协议桩只在测试中存在。

MCP 工具：

| 工具 | 能力 |
| --- | --- |
| `game_get_state` | 自己的手牌、其他玩家余牌数、公开历史、revision 与部分合法行动 |
| `game_legal_actions` | 分页获取合法行动及 actionId |
| `game_act` | 用最新 revision 和 actionId 执行本座位的一次行动；德州可用 `actionId=raise` 和整数 `amount` 指定本轮累计下注到的总额 |
| `game_rules` | 当前规则及计分说明 |

每个座位拥有独立、仅存于连接器内存的 MCP capability token。工具不接受任意 seat 参数。过期凭据、非自己回合、重复行动、过期 revision、非法牌型均被拒绝。德州额外绑定本手 `handId`，即使同桌下一手 revision 从 1 开始，旧手请求也不能读取或行动。叫分时不披露底牌；斗地主结束公开剩余手牌。德州只公开自己的底牌和摊牌时未弃牌玩家的底牌，隐藏牌库、烧牌及弃牌者底牌。

## 德州：牌桌与每手牌

使用无限注规则：完整的翻牌前/翻牌/转牌/河牌下注，单挑与多人盲注及行动顺序，任意合法整数 raise-to，最小加注、不足额全下与累计重开加注权、未跟注退款、独立边池、平分及零头。无抽水，每步检查可用筹码 + 已投入筹码 = 本手筹码总额；结算差额为零。下注边界参考 [Poker TDA 规则](https://www.pokertda.com/view-poker-tda-rules/)及[不足额开注的官方说明](https://www.pokertda.com/forum/index.php?topic=1456.0)。网页规则列出本项目的完整玩法和桌务约定。

- **同桌下一手**：牌桌 `id` 不变，`handId` 更新，回收上一手的所有会话和凭据，逐玩家继承结算筹码；每位 Agent 使用全新会话，不发送上一手的行动或对话。
- **发牌前调整**：结算页点击「准备下一手」，可增加/移除玩家、切换真人/Agent、替换 Harness、模型与思考强度。稳定的 `playerId` 持有筹码，名称或 Agent 改变不会重置筹码；移除导致座位重排也不会挪用别人的筹码。一手进行中不能改变阵容或 Harness。
- **买入与离桌**：新玩家按本桌初始筹码买入；移除玩家兑现剩余筹码。账本满足累计买入 − 累计兑现 = 本桌当前筹码总额。筹码归零玩家需先移除，可另加新玩家。没有静默补码、自动买入或自动移除。
- **按钮**：正常逐手轮转。变更阵容先轮转大盲，再按新人数定位按钮，避免三人转单挑时同一玩家连续下大盲。新增座位位于阵容末尾。
- **新牌桌**：生成新的牌桌 ID，所有玩家按新桌初始筹码重新开始，当前桌账本清空。此前已完成牌谱仍在独立历史中，不影响新桌筹码。
- **保存恢复**：浏览器保留牌桌、筹码、账本和最近 20 手/局牌谱；兼容 v0.2 的斗地主存档。刷新默认暂停，恢复时新建会话，不自动推理。

## dsh 与 WorkBuddy 接入

Windows 安装发现同时支持桌面附带的 CLI。dsh 保留官方 Electron Node carrier 的 ASAR 加载；创建 ACP 会话后等待其原生模型目录注册稳定，再显示模型或应用座位设置，避免启动早期遗漏账户模型。

`dsh` 明确指官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，通过 `dsh --profile acp --patch <本次会话覆盖文件>` 的 ACP stdio 接入。连接器读取标准 `configOptions` 的原始模型 ID（包括 provider 信息）和逐模型 `thought_level`，不会替换成 Claude Code 或 Codex 的模型。原生 `DSH_HOME`、模型提供方、账户和凭据不被复制或改写。旧版官方 ACP 若不支持 HTTP MCP/配置选项/工具守卫，会显示未就绪。覆盖文件和工具守卫仅在本次进程有效，只允许四个座位 MCP 工具，拒绝文件、终端、其他 MCP 和子 Agent。关闭历史时将 JSONL 放入连接器的本手隔离目录，关闭会话后删除；不登记到用户 dsh 会话目录。

WorkBuddy 使用其官方文档描述的 [CodeBuddy 公开 ACP 协议](https://www.codebuddy.ai/docs/cli/acp)，从 `workbuddy` / `codebuddy` CLI 或 `WORKBUDDY_PATH` 指定入口启动。也自动发现 Windows 桌面安装附带的官方 Node 启动器，保留它自己的版本和产品初始化。桌面 lite bundle 使用 `--serve --acp` 提供 stdio ACP，附带的原生 gateway 限制在随机 loopback 端口，使用仅本进程持有的随机密码，不修改全局 gateway 配置；参数依据[官方 CLI 文档](https://www.codebuddy.ai/docs/cli/cli-reference)与[环境变量说明](https://www.codebuddy.ai/docs/cli/env-vars)。要求 CLI 提供 HTTP MCP、模型目录、`--tools`、`--allowedTools`、严格 MCP 配置、进程级设置覆盖和关闭历史能力。只开启游戏 MCP，禁用内置工具、无关 MCP、hooks、自动记忆和后台任务；模型和思考强度均从该 CLI 的 ACP 目录取得。不会伪造 WorkBuddy 私有身份字段，也不会提取桌面登录凭据。桌面登录未向独立公开 CLI 提供有效登录时，需在支持独立 ACP 的官方 CLI 中完成 `/login`；连接器不能保证不同客户端的订阅可互通。

`check:harnesses` 只探测接口，不发送推理 prompt。本机实测（2026-10-23）：dsh 桌面 CLI 能返回自己的账户模型和思考强度，DeepSeek Account Flash 已通过真实推理与游戏 MCP 完成斗地主行动，并与 Codex ACP、Codex App Server 混用德州推进到转牌。dsh 原生默认 provider 可能是单独的 API provider，请在目录中选择自己已登录的 DeepSeek Account 模型；目录暂未返回该模型时不会伪造可用项。WorkBuddy 2.161.0 的桌面 lite CLI 已验证 ACP、HTTP MCP 接口和 9 个独立模型，但原生 `authenticate` 网页登录后，独立 CLI 的实际 prompt 仍返回 `Authentication required`，因此 **WorkBuddy 真实账户对弈尚未通过**。两种适配器均通过独立进程的 ACP 协议测试及四 Harness 混桌 HTTP MCP 测试；未就绪会明确展示原因，不静默回退。

网页刷新或 SSE 断开时，本机连接器停止玩家任务；网页恢复 localStorage 时默认暂停，需要主动继续。认证令牌不写入 localStorage。不同网页不能同时接管同一个连接器，不提供邀请或远程加入入口。

## Codex 接入说明

开局可以选择 **保留玩家对话到本机 Codex 历史**，默认关闭。关闭时，ACP 与原生模式均创建临时线程，结束后不写入 Codex 对话历史；开启后保存线程，并命名为「同桌 · 斗地主 · 玩家 · 第 N 局 · 牌局编号」。牌桌的「玩家设置」可查看和复制会话 ID。保存到本机历史不等于自动登记到 Codex 桌面客户端侧栏；当前 ACP 的线程来源标为 `vscode`，还使用独立 provider，客户端可能按来源、项目或 provider 筛选。

开局时每个座位分别选择 Harness、模型与思考强度，可同桌混用 Codex ACP、Codex App Server、dsh 和 WorkBuddy。两种 Codex 适配器读取本机 Codex `model/list`；其他 Harness 各读自己的目录。不支持的组合会明确拒绝，不会静默改成 `low`。暂停修改模型与思考强度作用于原会话下一次行动；切换 Harness 在下一手/局开始前完成。新牌桌或下一手/局都重新创建会话。

尚未实现的其他 Harness 不会出现在可用座位选择中。每种适配器都必须提供自己的会话、模型目录、行动与中断能力，不能借用其他 Harness 的凭据或模型目录。

ACP 标准当前没有临时会话字段。本项目构建时为固定版本的 `codex-acp` 添加受检查的小扩展，通过请求 `_meta.agentArcade.ephemeral` 转发到官方 `thread/start.ephemeral`，并禁止临时会话的自动命名。扩展只存在于连接器打包副本中，不改动 node_modules、本机 Codex 安装或全局设置。更换外部 ACP 适配器时，若不支持该扩展且未开启保留，会明确报错，避免意外保存对话。开发启动脚本会先生成扩展副本。

ACP 与 Codex App Server 是两种协议。默认 `Codex · ACP` 使用 `@agentclientprotocol/codex-acp`，适配到本机现有 Codex 可执行文件；另有 `Codex · App Server` 原生适配器。这里创建的是本机 harness 会话，不是通过 UI 自动化操纵桌面 App。

游戏会话采用只读沙箱，关闭 shell、浏览器、插件、子 agent、hooks 与无关 MCP 服务；这些覆盖只作用于本次进程与线程，不修改用户的全局 Codex 配置。订阅认证继续完全由 Codex 处理，不要求 API Key。

本机验证遇到默认 WebSocket 推理连接反复重试，因此游戏使用独立的 `agent_arcade_chatgpt` provider 配置，关闭 WebSocket，保留 Codex 的 ChatGPT 认证与认证模式对应的默认 endpoint，不自行指定或调用私有地址、不提取 OAuth token。这个 provider 名称避开新版本 Codex 保留的内置 provider ID。

参考：[OpenAI App Server 文档](https://learn.chatgpt.com/docs/app-server)、[OpenAI 认证说明](https://learn.chatgpt.com/docs/auth)、[provider 默认地址规则](https://learn.chatgpt.com/docs/enterprise/roll-out-a-gateway)、[Codex ACP 适配器](https://github.com/agentclientprotocol/codex-acp)、[ACP 会话与 MCP](https://agentclientprotocol.com/protocol/v1/session-setup)、[浏览器本地网络权限](https://developer.chrome.com/blog/local-network-access)。

## 验证与边界

普通测试不使用订阅推理。它们包含牌型、比较、100 局斗地主与 1000 手随机德州、边池/平分/全下/加注权/筹码守恒、跨手换阵容与筹码继承、九座位与手牌隔离、状态恢复、真实 HTTP MCP 整局联调、重复行动拒绝、来源校验、断线与旧手凭据撤销。

`test:windows` 针对最终 EXE，创建一个真实但不开始推理的 ACP/Codex 玩家会话，随后分别测试正常退出和**仅强制结束 EXE 本身**。检查所有子进程消失、监听端口可以重新绑定、相同端口可以立即重启。强制退出测试不使用 `taskkill /T`，避免掩盖进程树管理错误。

需要主动进行真实订阅推理时运行：

```powershell
npx tsx scripts/smoke-game.ts
npx tsx scripts/smoke-game.ts --native
npx tsx scripts/smoke-game.ts --harness dsh --dsh-effort low
npx tsx scripts/smoke-game.ts --harness codex-acp,dsh,codex --holdem --dsh-effort low
npx tsx scripts/smoke-game.ts --mixed --holdem
```

默认 smoke 检查三位独立玩家的叫分与合法出牌；`--holdem` 检查德州，`--mixed` 选择所有已实现 Harness，`--harness` 可指定逗号分隔的阵容。用 `--<harness>-model` / `--<harness>-effort` 选择各自目录中的模型和强度；dsh smoke 默认只选择本次目录实际返回的账户 Flash 模型，缺省时拒绝运行，避免改用需 API Key 的 provider。它会消耗相应账户额度，完成后自动停止会话。真实对局耗时和成功率取决于本机 Harness 版本、网络与账户限制；失败时暂停并显示原生错误。

当前实现斗地主与无限注德州扑克；规则详见网页。新牌桌、下一手/局、网页刷新或重启连接器后新建玩家会话；同手暂停继续不重建。未完成牌局可以恢复，但刷新或重启后不自动接管旧 Agent 对话。尚未提供代码签名、自动安装更新或 Windows ARM64 构建。

后续游戏扩展 `packages/game-core` 中的 `GameDefinition` 与目录；后续 harness 实现连接器的 `HarnessAdapter`。浏览器桥接协议集中在 `packages/protocol`，不依赖某个模型厂商。
