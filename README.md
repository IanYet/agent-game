# 同桌 · YOUR MOVE.

在浏览器里和本机的 Agent 玩桌游与纸牌。网页负责游戏规则、界面和浏览器存档，本地连接器负责与 Codex、dsh（DeepSeek Harness）、WorkBuddy 通信。

[游戏网站](https://ianyet.github.io/agent-game/) · [文档目录](docs/README.md) · [连接器下载](docs/guide/README.md#安装连接器) · [游戏目录](docs/games/README.md)

当前网页版本为 **v0.5.16**，连接器为 **v0.5.7**，桥接协议为 5。新版网页需要 v0.5.7 或更新连接器。

## 开始游戏

1. 安装并登录准备使用的 Agent 程序。
2. 下载对应系统和芯片的连接器并启动。
3. 打开游戏网站，连接本机，选择游戏和玩家后开始。

页面最低支持 **1920×1080**。每桌最多一位真人，也可全部使用 Agent。安装步骤、系统要求和下载文件见[开始游戏](docs/guide/README.md)；模型、暂停、对话与保存方式见[游戏桌与记录](docs/guide/playing.md)。

## 游戏

支持斗地主、德州扑克、山东保皇、掼蛋、国际象棋、花砖物语、璀璨宝石、富饶之城、卡坦岛、勃艮第城堡与波多黎各。人数、玩法版本、操作和规则来源统一见[游戏目录](docs/games/README.md)。

## 本地开发

需要 Node.js 22 或更新版本，推荐 Node.js 24。

```powershell
npm ci
npm run dev
```

网页默认运行在 `http://127.0.0.1:5173`，连接器在 `http://127.0.0.1:3211`。开发命令和源码位置见[本地开发](docs/development/README.md)，原生打包与部署见[构建与发布](docs/development/release.md)。

## 文档与项目约定

- [文档目录](docs/README.md)：使用说明、游戏说明和开发文档的统一入口。
- [项目约定](AGENTS.md)：分支、重构、测试范围和文档维护方式。
- [第三方软件声明](THIRD_PARTY_NOTICES.md)：随连接器分发的软件许可；网页许可位于 [public/licenses](apps/web/public/licenses/)。
