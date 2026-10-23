# 开发、构建与发布

## 本地开发

使用 Node.js 22 或更新版本，推荐 24。运行 `npm ci` 后，用 `npm run dev` 同时启动网页和连接器，也可分别运行 `dev:web` 与 `dev:connector`。

网页默认端口为 5173，连接器为 3211。开发入口会生成固定版本的 Codex ACP 适配器及临时会话扩展，不修改 `node_modules` 或用户安装。

| 命令 | 用途 |
| --- | --- |
| `npm test` | 运行各游戏的规则测试 |
| `npm run test:watch` | 在编辑规则时持续运行测试 |
| `npm run typecheck` | 检查 TypeScript 类型 |
| `npm run build:web` | 检查类型，生成静态网站 `dist/client/` |
| `npm run build:connector` | 生成 `dist/connector/index.cjs` 和 Codex ACP 适配器 |
| `npm run build` | 构建网页与连接器 |
| `npm run package:windows` | 在 Windows x64 上生成自带 Node.js 的单文件 EXE |
| `npm run package:macos` | 在 macOS 上生成与本机芯片一致的应用 ZIP |

打包前先构建连接器。产物在 `release/`，每个安装包附带 `.sha256` 校验和及 `.build.json` 构建信息。Windows 打包还会生成静态下载分片与清单，写入 `apps/web/public/downloads/` 和 `dist/client/downloads/`，供使用静态下载的网页拼接并校验。

## 发布网页

修改游戏模块和注册表后，运行 `npm test` 与 `npm run build:web`，再发布整个 `dist/client/`。新增游戏不需要重新打包连接器。

`.github/workflows/pages.yml` 在 `main` 推送时构建并部署网页。仓库 Pages 设置的 Source 应选择 GitHub Actions；工作流会读取站点路径，本地也可用 `PAGES_BASE_PATH` 指定。

下载地址通过 `VITE_CONNECTOR_DOWNLOAD_URL`、`VITE_CONNECTOR_MACOS_ARM64_DOWNLOAD_URL` 和 `VITE_CONNECTOR_MACOS_X64_DOWNLOAD_URL` 写入网页。调整安装包名称时，先发布带有新名称的连接器，再部署引用新地址的网页。

## 发布连接器

在 GitHub Actions 中选择 **Build and release connectors**，用 **Run workflow** 手动触发；也可执行：

```sh
gh workflow run connector.yml --repo IanYet/agent-game --ref <分支>
gh run list --repo IanYet/agent-game --workflow connector.yml
```

工作流分别在 Windows x64、macOS Apple Silicon 和 macOS Intel 上构建，使用 Node.js 24.19.0。各作业运行游戏规则测试、类型检查和构建，再生成原生安装包；不运行连接器、界面、协议或发布器自动测试。

安装包名称和 Release 显示名统一放在 [connector-assets.mjs](../scripts/connector-assets.mjs)。Actions 下载产物与 Release 显示名会写明「同桌连接器」、系统和芯片。底层文件使用 ASCII 名称：

- `TongZhuo-Connector-Windows-x64.exe`
- `TongZhuo-Connector-macOS-Apple-Silicon.zip`
- `TongZhuo-Connector-macOS-Intel.zip`

三个平台打包完成后，发布作业核对版本、平台、源提交、文件大小与 SHA-256，并生成 `SHA256SUMS.txt`。只有发布作业拥有 Release 写权限，同一仓库的连接器发布按顺序运行。

新版本先创建草稿 Release，上传全部文件并核对 GitHub 返回的摘要，再公开并检查下载内容。上传失败时回滚本次资产操作。重跑已有版本时保留原 tag、标题和正文；安装包的实际源提交以 `.build.json` 为准。

连接器版本来自 `apps/connector/version.json`。修改时同步 Windows 启动器的 `AssemblyVersion` 和 `AssemblyFileVersion`；macOS 的应用版本由打包脚本生成。

Windows 可用 `Get-FileHash .\TongZhuo-Connector-Windows-x64.exe -Algorithm SHA256` 查看校验和；macOS 可运行 `shasum -a 256 -c TongZhuo-Connector-macOS-Apple-Silicon.zip.sha256`，Intel 替换相应文件名。

## 配置与运行目录

连接器只监听本机，并检查 Host、Origin 和控制令牌。自建网站需要将完整 origin 加入 `connector.config.json`。Windows 将配置放在 EXE 旁；macOS 放在 `~/Library/Application Support/AgentArcade/`。

| 环境变量 | 用途 |
| --- | --- |
| `CODEX_PATH` | Codex 可执行文件或官方 Node 入口 |
| `CODEX_ACP_PATH` | 支持 ACP v1 与 HTTP MCP 的适配器入口 |
| `DSH_PATH` | DeepSeek Harness 官方 CLI |
| `DSH_PROFILE` | dsh ACP profile，默认 `acp` |
| `WORKBUDDY_PATH` | WorkBuddy/CodeBuddy 官方公开 ACP CLI |
| `AGENT_GAME_WEB_ORIGINS` | 用逗号分隔的可信 origin，覆盖配置文件 |
| `AGENT_GAME_DATA_DIR` | 本机会话目录，不保存权威游戏状态 |
| `AGENT_GAME_CONFIG` | 自定义配置文件的绝对路径 |
| `AGENT_GAME_PORT` | 连接器端口，默认 3211 |

Windows 将运行时按内容哈希展开到系统临时目录，会话默认保存在 `%LOCALAPPDATA%/AgentArcade/sessions`。macOS 直接读取应用内的运行时，会话在 `~/Library/Application Support/AgentArcade/sessions`，日志在 `~/Library/Logs/AgentArcade/connector.log`。

macOS 的 Finder 环境与终端不同。连接器会读取登录 shell 的 PATH，并查找常见的 Homebrew、Node 和官方桌面 CLI 安装位置；特殊路径可用上表的变量指定。安装包只有 ad-hoc 签名，尚未公证，首次打开受阻时按 [Apple 官方说明](https://support.apple.com/102445)处理。

## Harness 与故障排查

`npm run check:codex` 和 `npm run check:harnesses` 用于查看本机安装、登录状态和模型目录。这些是诊断命令，不调用模型；真实推理是否可用，需要在原生 Harness 或牌桌中实际确认。

各 Harness 使用自己的模型 ID 和登录，不在不同厂商之间替换模型。WorkBuddy 的独立 CLI 可能需要单独登录；建立会话或读到模型目录并不代表已经有推理权限。

| 现象 | 处理 |
| --- | --- |
| 连接不上 | 确认连接器已启动，浏览器允许本地网络访问，origin 和端口配置正确 |
| 已被另一网页占用 | 在原网页断开连接，或关闭原游戏网页 |
| 提示协议或能力不符 | 下载当前网页要求的连接器，退出旧进程后启动 |
| 能选模型但推理失败 | 在对应 Harness 中检查登录、模型权限与网络 |
| Agent 未完成决策 | 查看错误信息，处理原因后继续牌局 |
| 刷新后暂停 | 点击继续，会建立新的原生会话 |
| 存档格式不匹配 | 新建游戏，开发期不迁移旧存档 |

退出连接器会结束它启动的子进程并释放端口。Windows 通过 Job Object 管理进程树；macOS 由 Guardian 管理进程组。实际操作检查见[开发检查](validation.md)。
