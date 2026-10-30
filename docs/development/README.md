# 本地开发

[文档目录](../README.md) · [项目约定](../../AGENTS.md)

## 环境与启动

需要 Node.js 22 或更新版本，推荐 Node.js 24。在仓库根目录执行：

```powershell
npm ci
npm run dev
```

网页默认运行在 `http://127.0.0.1:5173`，连接器在 `http://127.0.0.1:3211`。两者直接跨源连接，没有游戏后端或数据库。开发入口会生成固定版本的 Codex ACP 适配器及临时会话扩展，不修改 `node_modules` 或用户安装。

也可分别运行 `npm run dev:web` 与 `npm run dev:connector`。使用独立端口时：

- 网页运行 `npm run dev:web -- --port <网页端口>`，在该进程设置 `VITE_CONNECTOR_URL=http://127.0.0.1:<连接器端口>`，或写入被忽略的 `apps/web/.env`。
- 连接器设置 `AGENT_GAME_PORT`，并让 `AGENT_GAME_WEB_ORIGINS` 包含该网页的完整 origin。默认发布仍连接本机 3211。

项目正在整体重构，直接使用当前接口、协议和状态格式，不维护历史兼容或存档迁移。分支和工作目录约定见根目录 [AGENTS.md](../../AGENTS.md)。

## 源码目录

| 目录 | 内容 |
| --- | --- |
| [apps/web](../../apps/web/) | React 网页、游戏运行时、游戏模块与画面资源 |
| [apps/web/src/games](../../apps/web/src/games/) | 各游戏的规则、行动、界面及规则测试 |
| [apps/connector](../../apps/connector/) | 本机桥接服务、Harness 接入和原生启动器 |
| [packages/protocol](../../packages/protocol/) | 网页与连接器共用的协议和工具校验 |
| [packages/game-core](../../packages/game-core/) | 共享牌数据、牌堆与规则错误类型 |
| [scripts](../../scripts/) | 开发启动、构建、原生打包与发布脚本 |

项目文档放在 `docs/`；游戏说明按模块 ID 放到 `docs/games/<id>.md`。随安装包分发的首次启动说明与许可证保留在其资源目录。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm test` | 运行游戏规则测试 |
| `npm run test:watch` | 编辑规则时持续运行测试 |
| `npm run typecheck` | 检查 TypeScript 类型 |
| `npm run build:web` | 检查类型，生成 `dist/client/` |
| `npm run build:connector` | 生成 `dist/connector/index.cjs` 和 Codex ACP 适配器 |
| `npm run build` | 完成类型检查及网页、连接器构建 |
| `npm run package:windows` | 在 Windows x64 上生成自带运行时的 EXE |
| `npm run package:macos` | 在 macOS 上生成与本机芯片一致的应用 ZIP |

规则测试和界面预览见[测试与人工检查](testing.md)；原生构建环境、网页部署及三平台发行见[构建与发布](release.md)。

## Harness 诊断

`npm run check:codex` 和 `npm run check:harnesses` 查看本机安装、登录状态和模型目录，不调用模型。真实推理是否可用，需要在原生 Harness 或牌桌中实际确认。

各 Harness 使用自己的模型 ID 和登录，不在厂商之间替换模型。程序路径、环境变量和日志位置见[连接器配置](../guide/connector.md)。

429 的开发排查可参考 OpenAI 的[错误说明](https://developers.openai.com/api/docs/guides/error-codes)、[App Server 的 `account/rateLimits/read`](https://learn.chatgpt.com/docs/app-server)和[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。Codex 使用 ChatGPT 订阅登录时，应查看 Codex 自己的账户用量；连接器等待原生重试结果，最终失败后的暂停与冷却行为见[常见问题](../guide/troubleshooting.md#超时与限流)。
