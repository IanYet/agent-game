# 开发、构建与发布

## 本地开发

使用 Node.js 22 或更新版本，推荐 24。运行 `npm ci` 后，用 `npm run dev` 同时启动网页和连接器，也可分别运行 `dev:web` 与 `dev:connector`。

网页默认端口为 5173，连接器为 3211。开发入口会生成固定版本的 Codex ACP 适配器及临时会话扩展，不修改 `node_modules` 或用户安装。

并行开发时可用 `npm run dev:web -- --port <网页端口>` 启动独立网页，并在该进程设置 `VITE_CONNECTOR_URL=http://127.0.0.1:<连接器端口>`（或写入被忽略的 `apps/web/.env`）。连接器设置对应的 `AGENT_GAME_PORT`，并在 `AGENT_GAME_WEB_ORIGINS` 包含该网页完整 origin。默认发布仍连接本机 3211。

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

Windows 构建需要 .NET 10 SDK；可用 `DOTNET_EXE` 指定绝对路径。`Connector.csproj` 使用 WinUI 3 与 Windows App SDK 2.5.1，自包含发布 .NET 和原生运行时，再用便携 EXE 封装。用户无需安装开发 SDK、Windows App Runtime 或 Node.js。构建会通过 NuGet 获取 Windows SDK 工具。

界面使用微软推荐的 [WinUI](https://developer.microsoft.com/en-us/windows/apps/build-a-windows-app)、[NavigationView](https://learn.microsoft.com/en-us/windows/apps/design/controls/navigationview) 和 [Mica](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/materials)，保留系统窗口框与控件。发布模型参考[非打包 WinUI 应用分发](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/unpackage-winui-app)。项目显式发布自身 PRI 资源，避免当前 SDK 的[非打包资源发布问题](https://github.com/microsoft/WindowsAppSDK/issues/6720)。

macOS 构建需要包含 macOS SDK 26 或更新版本的 Xcode 工具链，可用 `DEVELOPER_DIR` 选择；脚本会检查实际 SDK，不假定 runner 自带哪个版本。应用使用 SwiftUI 的标准窗口、分栏、工具栏、设置和菜单栏，在新系统采用系统外观，在旧系统采用对应原生外观，最低运行系统仍是 Node.js 24 要求的 macOS 13.5。原生代码必须在 Mac 上完成编译和使用检查。

Actions 会从 runner 已安装的稳定版 Xcode 中选择最高版本（至少 26），记录实际 Xcode 与 SDK 版本，避免默认工具链较旧导致构建失败。预览版不参与选择。

macOS 的布局采用 Apple [窗口规范](https://developer.apple.com/design/human-interface-guidelines/windows)、[侧栏规范](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[设置规范](https://developer.apple.com/design/human-interface-guidelines/settings)及 [NavigationSplitView](https://developer.apple.com/documentation/swiftui/navigationsplitview)、[MenuBarExtra](https://developer.apple.com/documentation/swiftui/menubarextra)；材质交给标准控件适配，遵循 [Liquid Glass 采用指南](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)。`NavigationSplitView` 与 `MenuBarExtra` 从 macOS 13 可用；最低 13.5 来自[随包 Node.js 24 的要求](https://nodejs.org/en/blog/migrations/v22-to-v24)，与构建 SDK 版本分别约束。

## 界面人工检查

页面最低支持 1920×1080。开发服务启动后，打开 `/src/games/preview.html`，逐个切换游戏，分别检查最大人数的「真人 + Agent」和「全 Agent 观战」；公共牌桌、玩家卡与操作按钮应完整显示，不产生布局滚动条。

富饶之城的 `/src/games/citadels/preview.html` 提供八座城区、四张手牌及各身份操作场景，用于检查操作切换时玩家卡高度是否稳定。璀璨宝石的 `/src/games/splendor/preview.html` 提供满背包场景，点击「检查卡牌动画」后可按真实规则拿取宝石、购买、预留、暗抽和推进行动，检查卡牌与宝石移动、选中牌的光照过渡和当局声望。这些预览使用正式牌桌组件，不连接模型，也不读取或写入真实游戏存档。

## 发布网页

网页与连接器分别管理版本。只修改游戏规则、界面、材质、透镜或动态桌面时，更新 `package.json` 和 `package-lock.json` 中的网页版本，运行 `npm test` 与 `npm run build:web`，再发布整个 `dist/client/`。连接器实现和协议未变时，保留连接器版本，不触发连接器发布；新增游戏也不需要重新打包连接器。

`.github/workflows/pages.yml` 在 `main` 推送时构建并部署网页。仓库 Pages 设置的 Source 应选择 GitHub Actions；工作流会读取站点路径，本地也可用 `PAGES_BASE_PATH` 指定。

网页下载名称使用 `apps/connector/version.json` 中的连接器版本。Pages 构建会读取该版本正式 Release，按系统和芯片选择实际安装包地址，后续 Release 不会改变已部署网页的下载目标。只调整打包命名时，无需重新发布已有连接器。升级连接器版本时，先发布对应连接器，再部署网页；目标 Release 缺少安装包时，网页构建会停止。

Pages 通过 `VITE_CONNECTOR_RELEASES_URL` 指定仓库的 Releases 地址，并将实际下载地址写入 `VITE_CONNECTOR_DOWNLOAD_URL`、`VITE_CONNECTOR_MACOS_ARM64_DOWNLOAD_URL` 和 `VITE_CONNECTOR_MACOS_X64_DOWNLOAD_URL`。自建网站也可设置这些变量；未设置直接下载地址时，入口打开对应版本的 Release 页面。

## 发布连接器

在 GitHub Actions 中选择 **Build and release connectors**，用 **Run workflow** 手动触发。默认只构建并上传 Actions 产物，可用于 Mac 编译检查；只有勾选 `publish_release` 才会执行 Release 发布。也可显式执行：

```sh
gh workflow run connector.yml --repo IanYet/agent-game --ref <分支> --field publish_release=true
gh run list --repo IanYet/agent-game --workflow connector.yml
```

若三个平台的构建已成功，只有发布作业失败，可勾选 `publish_release`，在 `build_run_id` 填写原构建的运行 ID。工作流直接复用该次产物，发布器从 GitHub 核对原运行所属仓库、工作流和源提交；产物过期后需要重新构建。留空时仍构建三个平台。

工作流分别在 Windows x64、macOS Apple Silicon 和 macOS Intel 上构建，使用 Node.js 24.19.0。各作业运行游戏规则测试、类型检查和构建，再生成原生安装包；Intel runner 串行运行同一套规则测试，避免多个进程争抢 CPU 导致长对局测试超时。不运行连接器、界面、协议或发布器自动测试。

安装包名称和 Release 显示名统一放在 [connector-assets.mjs](../scripts/connector-assets.mjs)，从连接器版本文件自动读取版本。Actions 下载产物与 Release 显示名写明产品、版本、系统和芯片，例如「同桌连接器 v0.5.7 · Windows 64 位」。新打包文件使用带版本的 ASCII 名称，例如：

- `TongZhuo-Connector-v0.5.7-Windows-x64.exe`
- `TongZhuo-Connector-v0.5.7-macOS-Apple-Silicon.zip`
- `TongZhuo-Connector-v0.5.7-macOS-Intel.zip`

校验和与构建信息沿用完整安装包文件名，分别追加 `.sha256` 与 `.build.json`。客户端检查更新时，按最新正式 Release 的版本查找对应系统和芯片的安装包。

三个平台打包完成后，发布作业核对版本、平台、源提交、文件大小与 SHA-256，并生成 `SHA256SUMS.txt`。只有发布作业拥有 Release 写权限，同一仓库的连接器发布按顺序运行。

新版本先创建草稿 Release，上传全部文件并核对 GitHub 返回的摘要，再公开并通过正式 tag 下载地址检查文件大小与 SHA-256。发布失败时回滚本次资产操作；重试会复用同版本草稿，下载地址短暂未就绪时会限次等待。重跑已有版本时保留原 tag、标题和正文，且 tag 必须指向安装包的源提交；实际构建信息保存在 `.build.json`。

连接器版本来自 `apps/connector/version.json`。修改时同步 Windows `Launcher.cs` 和 `Bootstrap.cs` 的 `AssemblyVersion`、`AssemblyFileVersion`；打包会核对它们。macOS 的应用版本由打包脚本生成。本地未提交的构建会在 `.build.json` 标记 `sourceDirty: true`；CI 拒绝从未保存到 Git 的源码发布。

Windows 可用 `Get-FileHash .\TongZhuo-Connector-v0.5.7-Windows-x64.exe -Algorithm SHA256` 查看校验和；macOS 可运行 `shasum -a 256 -c TongZhuo-Connector-v0.5.7-macOS-Apple-Silicon.zip.sha256`，按实际下载文件名替换。下载地址见 README。

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

Windows 将运行时按内容哈希展开到 `%LOCALAPPDATA%/TongZhuo/connector-<hash>`，会话默认保存在 `%LOCALAPPDATA%/AgentArcade/sessions`。macOS 直接读取应用内的运行时，会话在 `~/Library/Application Support/AgentArcade/sessions`，日志在 `~/Library/Logs/AgentArcade/connector.log`；指定 `AGENT_GAME_DATA_DIR` 时，macOS 日志改存该目录的 `logs/`。两端在数据目录的 `cooldowns.json` 保存上游冷却截止时间；该文件不包含登录凭据、对话或游戏存档。

macOS 的 Finder 环境与终端不同。连接器会读取登录 shell 的 PATH，并查找常见的 Homebrew、Node 和官方桌面 CLI 安装位置；特殊路径可用上表的变量指定。

macOS 包只有 ad-hoc 本地签名，没有 Developer ID 身份签名，未经过 Apple 公证。打包脚本将[请先阅读.txt](../apps/connector/macos/请先阅读.txt)放入 ZIP 根目录，不藏在应用内部。先解压并将应用拖入「应用程序」，尝试打开一次；仅在核实来源和文件完整性且信任该应用时，进入「系统设置」→「隐私与安全性」，向下滚动，针对本应用点「仍要打开」，按要求验证身份，再在警告中点「打开」。受管理的 Mac 可能禁止放行；恶意软件、将损坏电脑、撤销或损坏提示不属于普通身份例外。不要全局关闭 Gatekeeper 或删除隔离属性。步骤和条件以 [Apple 官方说明](https://support.apple.com/zh-cn/102445)为准。

## 原生窗口与端口处理

两端窗口按「概览」「可用程序」「端口与进程」「关于与更新」组织。关闭窗口继续在托盘／菜单栏运行；最小化留在任务栏／程序坞，图标可恢复窗口。macOS 可用 ⌘, 设置打开应用时是否启动服务，⌘Q 退出。停止服务保留窗口，退出应用同时停止服务与它启动的全部 Agent 会话。

端口页读取操作系统实际 TCP 监听信息：Windows 使用 IP Helper API，macOS 使用系统 `lsof`。合并同一 PID 的 IPv4／IPv6 地址，显示名称、可读取的路径与身份来源。路径或进程创建时间不可读时明确显示限制；无法安全确认身份时不提供强制结束。端口未显示监听者也可能被系统保留，启动绑定结果仍会给出错误。

优先停止本连接器或请求已识别的连接器正常退出。Windows 通过仅当前用户可访问的命名管道请求正常退出；不支持该接口的旧版应先从原托盘退出。macOS 核对应用标识、父进程和创建时间后向原应用请求退出。未知程序须由用户在原程序退出，或在连接器中逐个确认强制结束。确认框列出 PID、路径、地址和中断风险，操作前再次核对身份与监听状态，只结束该 PID，不批量结束 Node、Codex 或同名程序。macOS 发信号前核对微秒级创建时间；系统不提供 Windows 式进程句柄。

每次操作后重新检测。进程已退出、身份改变、无权限、端口被重新占用或仍未释放时显示实际结果，并保留重新检测／启动入口。连接器不自动提权。

启动器只消费 `TONGZHUO_UI:` 后的 JSON 状态事件，不解析人类日志文案。Windows 在暂停状态创建子进程，先加入带 `KILL_ON_JOB_CLOSE` 的 Job Object 再恢复；正常停止通过私有 stdin 请求后台清理，超时由 Job 约束全部后代。macOS 的 Guardian 由关闭租约管道触发进程组 TERM/KILL，启动器异常消失也会清理它启动的进程。

图标源是 `apps/connector/assets/icon.svg`，经完整 SVG 渲染生成多尺寸 ICO、ICNS、窗口与托盘素材；macOS 菜单栏使用去掉底板的模板图，颜色由系统适配。网页并行迭代时，验收前应与主目录最新 favicon 和 Logo 核对。

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
| 决策超过 180 秒 | 连接器会取消上游任务并暂停牌局；5 秒内仍未结束则关闭该玩家会话，点击继续时重建。180 秒也包含 Harness 的限流重试等待；遇到 429 时先等待上游限制恢复 |
| 上游暂时限流，程序正在退避重试 | 程序仍在处理本次决策，连接器不会提前取消或启动共享冷却；这段等待计入 180 秒决策时限，也可以主动暂停 |
| 上游限流，仍需等待 | 在对话中查看上游错误原因，区分短时请求限流和账户额度耗尽。冷却结束后再点继续；账户额度耗尽时还需等待账户用量窗口恢复。同一程序的玩家共享等待，Codex 的两种接入也共用；重连和重启不会重置。优先采用上游提供的恢复时间，程序未透传时保守冷却 10 分钟，这只是本地估计 |
| 刷新后暂停 | 点击继续，会建立新的原生会话 |
| 存档格式不匹配 | 新建游戏，开发期不迁移旧存档 |

退出连接器会结束它启动的子进程并释放端口。Windows 通过 Job Object 管理进程树；macOS 由 Guardian 管理进程组。实际操作检查见[开发检查](validation.md)。

429 不能单凭状态码判断原因，也不能由 3 秒消息间隔保证消除。OpenAI 的[错误说明](https://developers.openai.com/api/docs/guides/error-codes)区分请求限流与额度相关错误；Codex 使用 ChatGPT 订阅登录时，应查看 Codex 自己的账户用量，而不是套用 API Key 的限额。开发排查可通过[App Server 的 `account/rateLimits/read`](https://learn.chatgpt.com/docs/app-server)读取用量窗口与恢复时间。Codex 的[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)说明程序自带请求与流重试，连接器应等待原生重试结果。
