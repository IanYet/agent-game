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
| `npm run test:dynamic-connector` | 对已经存在的生产 bundle 进行跨游戏 HTTP/MCP 验证；不会重建它 |
| `npm run test:windows` | 对最终 EXE 做真实原生会话、进程树、退出和端口复用检查 |

生成包位于 `release/同桌连接器.exe`。打包脚本同时生成静态分片和 SHA-256 下载清单到 `apps/web/public/downloads/`、`dist/client/downloads/`；浏览器下载时自动拼接为单个 EXE 并校验，不需要用户合并文件。它们是被忽略的构建产物。

## 只发布游戏/网页

1. 修改模块目录及 `games/registry.ts`。
2. 运行测试和 `build:web`。
3. 部署整个 `dist/client/`。

`.github/workflows/pages.yml` 在 main 推送时只测试、构建和发布静态网页，不打包或替换连接器。下载按钮通过 VITE_CONNECTOR_DOWNLOAD_URL 指向既有 GitHub Release。

Pages Settings 的 Source 选择 GitHub Actions。工作流从 Pages 获取 base_path；本地可用 PAGES_BASE_PATH=/agent-game/，默认相对路径。新增游戏保持同一 origin 时无连接器配置变更。

## 连接器基线发行

v0.4.0 是协议 4 的首个连接器基线。本次先发布已验证的功能，WorkBuddy 独立 CLI 的认证/真实推理问题继续在专项任务中处理，发行说明明确标注这一限制。

只有桥接协议、原生 Harness 适配/能力、权限或连接器修复需要新的连接器发行。届时：

1. 更新 `apps/connector/version.json` 与 Windows Launcher 的 AssemblyVersion/AssemblyFileVersion。网页版本无需同步。
2. 运行 `npm test`、`typecheck`、`build:connector`、`test:dynamic-connector`。
3. 在 Windows x64 打包，再对该 EXE 运行 `test:windows` 和必要的真实 Harness smoke。
4. 确认下载文件、许可证、托盘退出、更新检查和端口复用。
5. 人工发布验证过的 EXE 到 GitHub Release，资产名 `tongzhuo-connector-windows-x64.exe`。

独立的 `.github/workflows/connector.yml` 通过 workflow_dispatch 构建并保存 Windows artifact，不自动创建 Release。Release 标签使用可解析的版本号，例如 v0.4.0，供窗口内检查更新使用。

连接器首次支持协议 4 时需要一次基线更新；此后新游戏不再触发 EXE 重建。旧协议连接器会在握手前被网页明确拒绝。

## 来源与运行目录

连接器校验 loopback Host、Origin 和控制令牌，不使用通配 CORS。自建网站可将完整 origin 加入 EXE 旁的 `connector.config.json` 覆盖配置；无需为了增加可信来源重新编译。默认配置包括本地开发/预览与项目公开站点。

| 环境变量 | 用途 |
| --- | --- |
| CODEX_PATH | 本机 Codex 可执行文件或官方 Node 入口 |
| CODEX_ACP_PATH | 支持 ACP v1 与 HTTP MCP 的适配器入口 |
| DSH_PATH | 官方 DeepSeek Harness CLI；支持桌面附带的 dsh.cmd/Electron Node carrier |
| DSH_PROFILE | dsh ACP profile，默认 acp |
| WORKBUDDY_PATH | WorkBuddy/CodeBuddy 官方公开 ACP CLI；保留官方 wrapper 的产品/版本初始化 |
| AGENT_GAME_WEB_ORIGINS | 逗号分隔的可信 origin，覆盖配置文件 |
| AGENT_GAME_DATA_DIR | 隔离会话工作目录；不保存权威游戏状态 |
| AGENT_GAME_PORT | 开发/测试端口；网页默认连接 3211 |

运行时按内容哈希展开到系统临时目录 AgentArcade/runtime-*，可复用，不改注册表。隔离会话默认在 %LOCALAPPDATA%/AgentArcade/sessions。默认临时会话结束后回收目录；开启历史保留则由原生 Harness 保留自己的记录。

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

最终 EXE 的生命周期测试需要本机已安装并登录 Codex，普通 CI 不配置账户。强制退出检查只杀 EXE 本身，不使用 /T，以免掩盖 Job Object 缺陷。
