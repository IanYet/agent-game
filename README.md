# 同桌 · Agent Arcade

和本机的 Agent 一起玩斗地主与无限注德州扑克。网页负责游戏规则、界面和浏览器存档，本地连接器负责与 Codex、dsh（DeepSeek Harness）、WorkBuddy 通信。

[游戏网站](https://ianyet.github.io/agent-game/) · [连接器下载](https://github.com/IanYet/agent-game/releases/latest) · [源码](https://github.com/IanYet/agent-game)

网页和连接器独立发布。新增游戏只需添加网页模块并发布静态网站；连接器根据模块提供的工具声明和提示词转发请求，不执行网页发来的代码。当前网页版本为 0.4.1，连接器为 0.4.2，桥接协议为 4。

## 开始游戏

1. 安装并登录要使用的 Harness。
2. 下载对应系统和芯片的连接器。Windows 双击 EXE；macOS 解压 ZIP，将「同桌连接器.app」拖入「应用程序」后打开。两端都自带 Node.js。
3. 打开游戏网站，点击「连接本机」，允许浏览器访问本地网络。
4. 创建牌桌，为每位 Agent 选择 Harness、模型和思考强度。斗地主固定三人，德州支持 2–9 人；最多一位真人，也可全 Agent 观战。
5. 结束时，从 Windows 托盘或 macOS 菜单栏选择「退出连接器」，释放端口并停止它启动的子进程。Windows 关闭窗口会缩到托盘。

| 系统 | 安装包 |
| --- | --- |
| Windows 10/11 x64，需要 .NET Framework 4.8 | [同桌连接器 · Windows 64 位](https://github.com/IanYet/agent-game/releases/latest/download/TongZhuo-Connector-Windows-x64.exe) |
| macOS 13.5+，Apple Silicon（M 系列） | [同桌连接器 · macOS Apple Silicon](https://github.com/IanYet/agent-game/releases/latest/download/TongZhuo-Connector-macOS-Apple-Silicon.zip) |
| macOS 13.5+，Intel | [同桌连接器 · macOS Intel](https://github.com/IanYet/agent-game/releases/latest/download/TongZhuo-Connector-macOS-Intel.zip) |

Windows 包尚未签名；macOS 包只有 ad-hoc 签名，尚未完成 Developer ID 签名与公证。macOS 首次打开受阻时，请核对下载来源和校验和，再按 [Apple 的说明](https://support.apple.com/102445)操作。

模型列表来自各 Harness 自己的配置，可见的模型未必有推理权限。连接器复用各自的登录，不要求额外提供 API Key；真实对弈会使用对应账户额度。WorkBuddy 独立 CLI 的登录可能与桌面端不同，若提示 `Authentication required`，需要先在支持 ACP 的官方 CLI 中完成登录。

## 牌桌与记录

斗地主每局建立独立 Agent 会话，同桌下一局继承积分。德州每手重建会话，并按玩家身份继承筹码；发牌前可以更换 Agent、增减玩家，买入和离桌兑现都会记入账本。一手进行中不能调整阵容。

暂停会取消当前推理，继续时沿用会话。刷新网页后默认暂停，主动继续才会重建会话。浏览器保留最近 20 局或手的记录；「保留玩家对话」只决定 Harness 是否保存会话历史。

项目处于重构期，不保留旧接口或存档兼容层，也不迁移历史格式。存档版本不匹配时需要新建游戏。

## 本地开发

需要 Node.js 22 或更新版本，推荐 Node.js 24。

```powershell
npm ci
npm run dev
```

网页默认运行在 `http://127.0.0.1:5173`，连接器在 `http://127.0.0.1:3211`。两者直接跨源连接，没有游戏后端或数据库。

```powershell
npm test
npm run typecheck
npm run build
```

自动测试只维护游戏规则，包含牌型、合法行动、回合推进、信息可见范围和结算。界面、连接器和打包行为通过实际使用检查。

在 Windows 运行 `npm run package:windows` 生成 EXE；在 macOS 安装 Xcode Command Line Tools 后运行 `npm run package:macos` 生成 ZIP。产物写入 `release/`。

## 开发文档

- [项目约定](AGENTS.md)：分支清理、重构边界、测试范围和文档风格。
- [架构与数据流](docs/architecture.md)：模块、运行时、连接器和 Harness 的职责。
- [新增游戏](docs/developing-games.md)：规则引擎、模块 API、工具和界面注册。
- [桥接协议](docs/protocol.md)：HTTP/SSE、动态 MCP 工具和授权。
- [构建与发布](docs/operations.md)：网页部署、连接器打包、配置和排查。
- [开发检查](docs/validation.md)：游戏规则测试和实际操作检查。
