# 同桌 · Agent Arcade

人与本机 agents 一起玩斗地主和无限注德州扑克。当前版本：网页 0.4.0、连接器 0.4.0、网页桥接协议 4。

[源码](https://github.com/IanYet/agent-game) · [游戏网站](https://ianyet.github.io/agent-game/) · [连接器下载与校验记录](https://github.com/IanYet/agent-game/releases/latest)

这是两个独立交付物：

- **静态网页**拥有游戏模块、规则、界面和浏览器存档，没有游戏后端、数据库或远程加入。
- **本地连接器**提供 Windows x64 单文件 EXE 和 macOS arm64/x64 应用包，均自带 Node。它在 loopback 上桥接网页与本机 Harness，不托管网页、不执行网页发来的 JavaScript。

**新增游戏只需添加网页模块、登记注册表并发布静态网站。**协议 4 基线的连接器接收每个会话的动态工具和提示词，不需要为游戏名称、规则、行动参数或人数重新发版。连接器版本与网页版本独立。

## 使用

1. 安装并登录要使用的 Codex、dsh（DeepSeek Harness）或 WorkBuddy。
2. 从 Release 下载对应平台的连接器。Windows 双击 EXE；macOS 解压 ZIP，将「同桌连接器.app」拖到「应用程序」并双击。均无需安装 Node.js。
3. 打开游戏网站，点击「连接本机」，允许浏览器访问本地网络。
4. 创建牌桌。斗地主固定三人；德州支持 2–9 人；最多一位真人，也可全 Agent 观战。每位 Agent 分别选择 Harness、原生模型与思考强度。
5. Windows 最小化或关闭窗口会缩到托盘；macOS 从顶部菜单栏「同桌」查看状态。选择「退出连接器」会停止本次连接器及其 Harness 子进程，释放端口。
6. Windows「检查更新」会检查 GitHub Release；macOS 菜单「下载与版本说明」打开 Release。下载后退出旧包再启动新包。同版本补包请核对 `.build.json` 的源提交与校验和。

| 系统 | Release 资产 |
| --- | --- |
| Windows 10/11 x64，系统 .NET Framework 4.8 | [tongzhuo-connector-windows-x64.exe](https://github.com/IanYet/agent-game/releases/latest/download/tongzhuo-connector-windows-x64.exe) |
| macOS 13.5+，Apple Silicon（M 系列） | [tongzhuo-connector-macos-arm64.zip](https://github.com/IanYet/agent-game/releases/latest/download/tongzhuo-connector-macos-arm64.zip) |
| macOS 13.5+，Intel | [tongzhuo-connector-macos-x64.zip](https://github.com/IanYet/agent-game/releases/latest/download/tongzhuo-connector-macos-x64.zip) |

双端版本保持 **0.4.0、协议 4**，Windows 文件版本保持 0.4.0.0；不会移动既有 v0.4.0 tag。Windows 开发包未 Authenticode 签名；macOS 只有本机 ad-hoc 签名，**没有 Developer ID 签名、未公证**。首次打开 macOS 包可能被 Gatekeeper 拦截：请先核对 Release 来源及对应 `.sha256`，如信任该应用，按 [Apple 官方说明](https://support.apple.com/102445)对单个应用使用「系统设置 → 隐私与安全性 → 仍要打开」。不要关闭 Gatekeeper 或移除下载隔离属性；系统不允许打开时应等待正式签名发行包。

CI 编译、签名结构检查和自动运行不等于真实 Mac 的首次打开、菜单界面、浏览器权限或真实账户对弈验收；待办见[验证记录](docs/validation.md)。

模型来自各 Harness 自己的目录，目录可见不等于推理权益可用。Codex 复用 ChatGPT 登录；dsh/WorkBuddy 使用各自的登录。连接器不要求 API Key，不提取或复制登录凭据。真实推理会消耗对应账户额度。

**WorkBuddy 当前边界：**已验证官方公开 ACP 接口、独立模型目录和会话建立。本机 WorkBuddy 2.161.0 的独立 CLI 在用户完成官方登录后仍返回 `Authentication required`，尚不能视为真实对弈成功。专项任务继续排查；不会用其他厂商模型替代它。

## 文档

- [架构与数据流](docs/architecture.md)：四层职责、身份、并发决策、隐私与会话生命周期。
- [新增游戏指南](docs/developing-games.md)：模块 API、同时竞价示例、界面注册、当前格式的存档与测试。
- [桥接协议与动态工具](docs/protocol.md)：HTTP/SSE、JSON Schema、权限绑定、MCP 结果及版本协商。
- [开发、打包和发布](docs/operations.md)：独立网页部署、连接器构建、原生 Harness 检测、故障排查。
- [验证记录](docs/validation.md)：测试覆盖、同一连接器的跨游戏证据和真实 Harness 验证边界。

## 开发

源码开发需要 Node.js 22+；推荐 Node.js 24。最终 EXE 和 macOS 应用均自带运行时。

```powershell
npm ci
npm run dev
```

网页默认 `http://127.0.0.1:5173`，连接器默认 `http://127.0.0.1:3211`。二者直接跨源连接，没有 Vite 代理。

```powershell
npm test
npm run typecheck
npm run build:web
npm run build:connector
npm run test:dynamic-connector
npm run package:windows
npm run test:windows-ui
npm run test:package
npm run test:windows
```

macOS 原生打包使用 Xcode Command Line Tools：`npm run package:macos`，然后 `npm run test:package`。`test:windows` 是额外的已登录 Codex 真实会话检查；CI 使用无账户、不推理的公开 ACP fixture 检查成品生命周期。

`npm run build` 仍可一次构建网页和连接器。新增游戏只发布 `dist/client/`。连接器在 Actions 中手动触发 **Build and release connectors**（`connector.yml`）；三套构建、测试、打包和成品运行检查全部通过后，自动上传 GitHub Release，详见[运维说明](docs/operations.md)。

## 牌桌行为

- 斗地主每局按需建立独立 Agent 会话，同桌下一局继承积分。
- 德州每手首个行动前为全部 Agent 建立新会话；同桌下一手继承稳定 `playerId` 的筹码，重新建立全部会话。
- 德州发牌前可增减玩家、更换 Agent/Harness/模型/强度。新玩家按本桌初始筹码买入，离桌兑现剩余筹码并记账；一手中不换阵容。
- 暂停取消当前推理，继续沿用原会话；暂停时可修改模型和思考强度。
- 「保留玩家对话」独立于会话重建策略，默认关闭。开启后由对应 Harness 决定本机历史如何显示。
- 新牌桌重新初始化进度与账本；浏览器保留最近 20 局/手记录。刷新后默认暂停，主动继续才会创建新会话。
- 项目仍在开发，**不兼容、不迁移旧存档**。当前平台存档版本为 3，各模块独立声明 `stateVersion`；版本不匹配时新建游戏。

德州覆盖完整下注轮、任意合法整数 raise-to、全下、累计不足额加注重开、未跟注退款、主池/边池、平分和零头。无抽水，每步检查筹码守恒。具体约定见网页规则和模块源码；[Poker TDA 规则](https://www.pokertda.com/view-poker-tda-rules/)可作为规则参考。

没有练习机器人或生产环境内置自动玩家。测试驱动仅实现公开协议和明确的测试调用，不调用模型。
