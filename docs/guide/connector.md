# 连接器配置

[文档目录](../README.md) · [开始游戏](README.md)

## 窗口与后台运行

两端窗口按「概览」「可用程序」「端口与进程」「关于与更新」组织。「概览」显示服务与网页状态，「可用程序」说明程序未就绪的原因，「端口与进程」显示 PID、路径及 IPv4／IPv6 监听地址。

关闭窗口后继续在 Windows 托盘或 macOS 菜单栏运行；最小化保留在任务栏／程序坞，从图标可以恢复窗口。macOS 可用 ⌘, 设置打开应用时是否启动服务，⌘Q 退出。停止服务保留窗口，退出应用会停止服务与本次启动的全部 Agent 会话。

## 端口与进程

连接器默认监听本机 `127.0.0.1:3211`，可用 `AGENT_GAME_PORT` 更改。它读取操作系统的 TCP 监听信息，合并同一 PID 的 IPv4／IPv6 地址；路径或进程创建时间不可读时，会显示限制。端口没有监听者也可能被系统保留，最终以启动绑定结果为准。

优先停止本连接器，或请求已识别的连接器正常退出。未知程序应在原程序中退出；需要强制结束时，逐个确认 PID、路径、地址和中断影响。操作前会再次核对身份与监听状态，只结束所选 PID，不批量结束 Node、Codex 或同名程序，也不自动提权。无法安全确认身份时不提供强制结束。

操作后重新检测。进程已退出、身份改变、没有权限或端口仍被占用时，界面显示实际结果；端口释放后再点「重新检测并启动」。

## 程序路径与自建网站

连接器只监听本机，并检查 Host、可信网页 origin 和控制令牌。自建网站需将完整 origin 加入[连接器配置文件](../../connector.config.json)：Windows 放在 EXE 旁，macOS 放在 `~/Library/Application Support/AgentArcade/`。连接方式和控制权见[桥接协议](../development/protocol.md#http-与事件)。

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

Codex 按 `CODEX_PATH`、系统 PATH、桌面版内置程序的顺序查找，支持 Windows npm 启动脚本。如果 PATH 中有其他项目的 Codex，可用 `CODEX_PATH` 指定程序；修改环境变量后退出并重新打开连接器。

macOS 的 Finder 环境与终端不同。连接器会读取登录 shell 的 PATH，并查找常见的 Homebrew、Node 和官方桌面 CLI 安装位置；特殊路径可用上表变量指定。

## 运行目录与日志

| 内容 | Windows | macOS |
| --- | --- | --- |
| 运行时 | `%LOCALAPPDATA%/TongZhuo/connector-<hash>`，按内容哈希展开 | 应用包内 |
| 会话 | `%LOCALAPPDATA%/AgentArcade/sessions` | `~/Library/Application Support/AgentArcade/sessions` |
| 日志与启动错误 | 界面异常：`%LOCALAPPDATA%/AgentArcade/launcher-error.log` | 运行日志：`~/Library/Logs/AgentArcade/connector.log` |

指定 `AGENT_GAME_DATA_DIR` 后使用该数据目录，macOS 日志改存其中的 `logs/`。两端在数据目录的 `cooldowns.json` 保存上游冷却截止时间，文件不包含登录凭据、对话或游戏存档。浏览器中的对局与对话存档见[游戏桌与记录](playing.md#保存与导出)。

首次安装与签名限制见[开始游戏](README.md#安装连接器)，编译和安装包生成见[构建与发布](../development/release.md)。
