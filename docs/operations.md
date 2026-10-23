# 开发、构建、运行与发布

## 开发与独立交付

使用 Node.js 22+，推荐 24：

```powershell
npm ci
npm run dev
```

也可分别运行 `dev:web` 和 `dev:connector`。网页默认端口 5173，连接器默认 3211。开发入口先生成受版本检查保护的 Codex ACP 临时会话扩展，不修改 node_modules 或用户安装。

| 命令 | 产物/作用 |
| --- | --- |
| `npm run build:web` | 类型检查和静态网站 `dist/client/`，不生成连接器 bundle 或 EXE |
| `npm run build:connector` | `dist/connector/index.cjs` 和固定版本的 Codex ACP 适配器 |
| `npm run build` | 同时构建两者的便利命令 |
| `npm run package:windows` | Windows x64 上嵌入当前 Node 运行时、桥、适配器和许可证，生成单文件 EXE |
| `npm run package:macos` | macOS 原生 arm64/x64 上用 clang、Swift/AppKit 生成含 Node 的 `.app` 和 ZIP |
| `npm run test:dynamic-connector` | 对已经存在的生产 bundle 进行跨游戏 HTTP/MCP 验证；不会重建它 |
| `npm run test:package` | 对最终 EXE / 解压后的 ZIP 做无账户 ACP、强制退出、正常退出及端口复用检查 |
| `npm run test:windows-ui` | 渲染窗口在 100%/150%/200% 模拟缩放下的长中文状态、错误和更新提示；不启动连接器 |
| `npm run test:release` | 发布前校验、资产隔离、Release/tag 保留、上传失败及回滚测试 |
| `npm run test:windows` | 对最终 EXE 做真实原生会话、进程树、退出和端口复用检查 |
| `npm run test:packaged-acp` | 对最终 EXE 做真实 ACP 四人德州、暂停继续及筹码守恒验证；显式消耗已登录账户额度 |

生成包位于 `release/同桌连接器.exe`。打包脚本同时生成静态分片和 SHA-256 下载清单到 `apps/web/public/downloads/`、`dist/client/downloads/`；浏览器下载时自动拼接为单个 EXE 并校验，不需要用户合并文件。它们是被忽略的构建产物。

## 只发布游戏/网页

1. 修改模块目录及 `games/registry.ts`。
2. 运行测试和 `build:web`。
3. 部署整个 `dist/client/`。

`.github/workflows/pages.yml` 在 main 推送时只测试、构建和发布静态网页，不打包或替换连接器。下载按钮通过 VITE_CONNECTOR_DOWNLOAD_URL 指向既有 GitHub Release。

Pages Settings 的 Source 选择 GitHub Actions。工作流从 Pages 获取 base_path；本地可用 PAGES_BASE_PATH=/agent-game/，默认相对路径。新增游戏保持同一 origin 时无连接器配置变更。

## 手动触发，自动发布连接器

在 GitHub → Actions → **Build and release connectors** → **Run workflow** 选择包含改动的分支并手动运行；或使用：

```sh
gh workflow run connector.yml --repo IanYet/agent-game --ref <分支>
gh run list --repo IanYet/agent-game --workflow connector.yml
gh run view <run-id> --repo IanYet/agent-game
```

v0.4.1 修复 Codex ACP 出牌审批及网页的已结算任务收尾。网页最低版本要求连接器至少为 0.4.1；本次 0.4.2 纳入这份已实机验证的修复，并提供 Windows UI/图标更新和 macOS 支持。原始实机证据与本次构建记录分别见验证文档。

此工作流不接受 push/tag 触发。矩阵使用 `windows-latest`（x64）、`macos-15`（arm64）、`macos-15-intel`（x64）；后两个标签已核对 [GitHub 官方 runner 列表](https://github.com/actions/runner-images)。CI 固定 Node 24.19.0，将本机相同架构运行时放入最终包。

每个 runner 依次执行自动测试、类型检查、发布器测试、网页与连接器构建、生产桥跨游戏验证、原生打包、最终包生命周期检查。Windows 额外渲染界面；macOS 检查 app/Node 架构、Info.plist、ad-hoc 签名完整性，并从解压到带空格目录的成品启动。fixture 显式通过 DSH_PATH 注入，包含拒绝 SIGTERM 的孙进程；强制退出只杀启动器本身，从而验证原生所有权。fixture 不进入发行包，也不调用模型。

全部构建通过后才运行唯一的 `publish` 作业。只有该作业有 `contents: write`；构建和 Pages 作业不持有 Release 写权限。仓库范围 concurrency 将手动运行排队，双架构不会同时修改 Release。打包或验证失败时发布作业被跳过。

本次以已发布的 ACP 修复为基线，双端统一为 **0.4.2、协议 4**，Windows AssemblyVersion/AssemblyFileVersion 为 0.4.2.0。macOS Info.plist、包内元数据和 Release tag 均从 `apps/connector/version.json` 读取；打包时检查 Windows 两个版本属性一致。新建 v0.4.2 时 tag 指向已验证源提交，既有 v0.4.0 / v0.4.1 tag 和资产不变；重跑同版本时保留目标 Release 的标题和正文；不同于 tag 指向提交的补包来源以资产 `.build.json` 为准。没有对应 Release 时才创建新 Release，绝不移动已有 tag。

稳定资产：`tongzhuo-connector-windows-x64.exe`、`tongzhuo-connector-macos-arm64.zip`、`tongzhuo-connector-macos-x64.zip`。各有 `.sha256` 和 `.build.json`；另有 `package-win32-x64.json`、`package-darwin-arm64.json`、`package-darwin-x64.json` 记录对应自动运行检查。发布器先核对三个包的源提交、版本、大小、SHA-256 和运行证据，再上传临时命名资产并核对 GitHub digest；所有上传成功后才换成稳定名称，失败时尽力回滚本次变更。唯一发布器还会从三份已验证成品统一生成 SHA256SUMS.txt，替换既有 Windows 总校验文件，避免补包后遗留旧哈希；构建矩阵不写共享清单。Release 正文保留，各架构的说明和独立校验和分别上传。Actions artifact 用于作业交接/诊断，最终下载来自 [GitHub Release](https://github.com/IanYet/agent-game/releases/latest)。

下载对应 `.sha256` 后，可在 macOS 用 `shasum -a 256 -c tongzhuo-connector-macos-arm64.zip.sha256`（Intel 改 x64）；Windows 可用 `Get-FileHash .\tongzhuo-connector-windows-x64.exe -Algorithm SHA256` 与 sidecar 对比。同版本补包不触发 Windows 的「发现新版本」提示，应比较 build.json 的 sourceCommit 和哈希。

连接器首次支持协议 4 时需要一次基线更新；此后新游戏不再触发 EXE 重建。旧协议连接器会在握手前被网页明确拒绝。

## 来源与运行目录

连接器校验 loopback Host、Origin 和控制令牌，不使用通配 CORS。Windows 自建网站可将完整 origin 加入 EXE 旁的 `connector.config.json`；macOS 放在 `~/Library/Application Support/AgentArcade/connector.config.json`，启动器会读取它，不修改 app 包。默认配置包括本地开发/预览与项目公开站点。

| 环境变量 | 用途 |
| --- | --- |
| CODEX_PATH | 本机 Codex 可执行文件或官方 Node 入口 |
| CODEX_ACP_PATH | 支持 ACP v1 与 HTTP MCP 的适配器入口 |
| DSH_PATH | 官方 DeepSeek Harness CLI；支持桌面附带的 dsh.cmd/Electron Node carrier |
| DSH_PROFILE | dsh ACP profile，默认 acp |
| WORKBUDDY_PATH | WorkBuddy/CodeBuddy 官方公开 ACP CLI；保留官方 wrapper 的产品/版本初始化 |
| AGENT_GAME_WEB_ORIGINS | 逗号分隔的可信 origin，覆盖配置文件 |
| AGENT_GAME_DATA_DIR | 隔离会话工作目录；不保存权威游戏状态 |
| AGENT_GAME_CONFIG | 自定义 connector.config.json 的绝对路径；macOS 启动器设置为数据目录中的配置（若存在） |
| AGENT_GAME_PORT | 开发/测试端口；网页默认连接 3211 |

Windows 运行时按内容哈希展开到系统临时目录 AgentArcade/runtime-*，可复用，不改注册表；会话默认在 `%LOCALAPPDATA%/AgentArcade/sessions`。macOS 直接读取 app 的 `Contents/Resources`，不写应用包；会话在 `~/Library/Application Support/AgentArcade/sessions`，GUI 日志在 `~/Library/Logs/AgentArcade/connector.log`，每次启动覆盖，限 1 MiB。临时会话结束后回收目录；历史保留由原生 Harness 决定。

## macOS 安装、发现与退出

macOS 13.5+（[Node 24 官方二进制的最低系统要求](https://nodejs.org/en/blog/migrations/v22-to-v24)）；M 系列用 arm64，Intel 用 x64。解压 ZIP，将「同桌连接器.app」拖到「应用程序」后双击；顶部菜单栏「同桌」显示启动/等待/连接状态，提供网页、数据文件夹、下载说明和「退出连接器」。已内置 Node；没有 Harness 也能启动，网页会显示未就绪原因。

Finder 不继承终端 PATH。桥会以四秒超时读取 zsh login PATH，并补上内置 Node、Homebrew、`~/.local/bin`、npm-global、Volta、asdf、fnm 和 nvm 安装目录。然后查找 Codex/dsh/workbuddy/codebuddy；支持常见 `/Applications` 和 `~/Applications` 的桌面 CLI 位置，特殊布局使用 CODEX_PATH、DSH_PATH、WORKBUDDY_PATH 指向官方 CLI。不能找到或无法验证公开接口时报告未就绪，不自动安装 Harness、不读取或复制认证材料。

菜单退出、SIGTERM/SIGINT 会关闭启动器持有的 lifetime pipe；SIGKILL/强制退出也会由内核关闭该 pipe。独立 Guardian 在同一把端口锁下用原子 posix_spawn process group 启动 Node，先 TERM，最多约 1.8 秒后 KILL 该组及同组 Harness 后代，等 Node 退出后释放锁。启动器正常退出等待 Guardian 完成，因此可立即复用端口；不向其他用户桌面应用广播 kill。

macOS 当前只有 ad-hoc 签名（用于本机代码完整性/Apple Silicon 加载），无 Developer ID 证书、未公证、未 staple。CI `codesign --verify` 不能证明 Gatekeeper 接受来自浏览器的下载。首次打开受阻时先核对来源和校验和，如信任应用，按 [Apple 官方说明](https://support.apple.com/102445)在「隐私与安全性」对本应用选择「仍要打开」。禁止把全局关闭 Gatekeeper 或删除 quarantine 当作安装步骤。实际首次打开和真实账户验收清单见[验证记录](validation.md)。

## Harness 检测与真实推理

```powershell
npm run check:codex
npm run check:harnesses
npx tsx scripts/smoke-game.ts --harness dsh --dsh-effort low
npx tsx scripts/smoke-game.ts --harness codex-acp,dsh,codex --holdem --dsh-effort low
```

check 命令检测原生目录/接口，不证明账户推理成功。smoke 明确发起真实推理，会消耗账户额度；使用 --<harness>-model / --<harness>-effort 指定原生目录返回的值。

dsh 创建会话后等待原生配置目录稳定，以免遗漏延迟注册的账户模型。smoke 默认仅选择原生目录里的账户 Flash，不改用需要 API Key 的 provider。opaque provider/model ID 原样传给 dsh，不映射为 Codex 模型。

WorkBuddy 使用公开 ACP stdio 与 HTTP MCP。桌面 lite bundle 的独立 gateway 使用随机 loopback 端口及本次随机密码，不修改全局 gateway。session/new 成功不代表 session/prompt 已认证，登录问题见专项任务及验证记录。

Codex 在进程范围关闭无关工具、hooks、插件和 MCP；复用自身 ChatGPT 认证。独立 provider 配置仅关闭不稳定的 WebSocket 路由，保留其认证对应的默认 endpoint，不提取 token 或直接调用私有推理接口。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 连接不上 | 确认 EXE/Node 桥已就绪、网页允许本地网络访问，检查可信 origin 和 3211 端口 |
| 已被另一网页占用 | 关闭原游戏网页，或在原网页主动断开；单连接器一次只服务一个控制页 |
| 协议/能力不兼容 | 下载满足网页要求的连接器，退出旧版后启动；无需网页/连接器同 minor |
| 模型存在但推理失败 | 在对应原生 Harness 确认登录、模型权益与网络；目录只证明配置可见 |
| Agent 未完成决策 | 网页暂停；查看原生错误/模型状态后继续，保留当前会话上下文 |
| 刷新后暂停 | 预期行为；点击继续会新建会话，不自动消耗额度 |
| 存档版本变化 | 开发期不迁移；新建游戏，或清除 agent-arcade.games.v3 |
| 端口未释放 | 从托盘选择退出，确认由此连接器启动的进程树结束；不要批量终止其他桌面应用 |

`test:package` 无需账户，适合 CI；额外的 `test:windows` 才需要已安装并登录 Codex。两者的强制退出检查只杀启动器本身，不使用 /T 或预先杀进程组，以免掩盖生命周期缺陷。手工检查还应确认窗口/托盘/菜单退出、下载首次打开、原生登录和真实推理。
