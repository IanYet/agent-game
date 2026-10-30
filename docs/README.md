# 文档目录

想开始玩，先看[开始游戏](guide/README.md)；想改代码，先看[本地开发](development/README.md)。

## 使用说明

| 文档 | 内容 |
| --- | --- |
| [开始游戏](guide/README.md) | 下载安装、登录 Agent 程序、连接网页和创建游戏桌 |
| [连接器配置](guide/connector.md) | 窗口与后台运行、端口、程序路径、日志和自建网站 |
| [游戏桌与记录](guide/playing.md) | 玩家和模型、暂停继续、观战、存档、对话与导出 |
| [常见问题](guide/troubleshooting.md) | 连接失败、模型权限、限流、超时和保存失败 |

## 游戏说明

[游戏目录](games/README.md)列出所有游戏的人数、玩法版本、操作说明和源码入口。各游戏的规则来源、实现边界与操作集中在同一篇文档中。

## 开发文档

| 文档 | 内容 |
| --- | --- |
| [本地开发](development/README.md) | 环境、启动命令、源码目录和 Harness 诊断 |
| [架构与数据流](development/architecture.md) | 游戏模块、网页运行时、连接器和 Harness 的职责 |
| [新增游戏](development/developing-games.md) | 模块 API、行动参数、观察、工具和界面注册 |
| [桥接协议](development/protocol.md) | HTTP/SSE、会话配置、动态 MCP 和授权 |
| [公共镭射卡组件](development/holographic-card.md) | 卡面、光照、纹路、饰圈与受光图标 |
| [测试与人工检查](development/testing.md) | 游戏规则用例、类型检查和实际操作检查 |
| [构建与发布](development/release.md) | 原生打包、三平台连接器发布和网页部署 |

## 维护约定与许可

项目说明统一放在 `docs/`：面向玩家的内容放 `guide/`，游戏说明按模块 ID 放 `games/<id>.md`，开发资料放 `development/`。目录的 `README.md` 是入口，根 README 保留项目简介和快速开始。新增游戏时同步补充游戏说明和目录入口。

[项目约定](../AGENTS.md)保留在仓库根目录。[第三方软件声明](../THIRD_PARTY_NOTICES.md)、[网页许可资源](../apps/web/public/licenses/)和[安装包首次启动说明](../apps/connector/macos/请先阅读.txt)位于实际分发使用的位置。
