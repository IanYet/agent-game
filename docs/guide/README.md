# 开始游戏

[文档目录](../README.md) · [游戏目录](../games/README.md)

同桌在浏览器中运行游戏规则和保存对局，本地连接器负责与已登录的 Codex、dsh（DeepSeek Harness）或 WorkBuddy 通信。页面最低支持 **1920×1080**。

## 安装连接器

先安装并登录准备使用的 Agent 程序，再下载对应系统和芯片的连接器。当前网页 v0.5.15 需要连接器 v0.5.7 或更新版本；两者分别管理版本。

| 系统 | 安装包 |
| --- | --- |
| Windows 10 2004（19041）及更新版本，x64 | [同桌连接器 v0.5.7 · Windows 64 位](https://github.com/IanYet/agent-game/releases/download/v0.5.7/TongZhuo-Connector-v0.5.7-Windows-x64.exe) |
| macOS 13.5+，Apple Silicon（M 系列） | [同桌连接器 v0.5.7 · macOS Apple Silicon](https://github.com/IanYet/agent-game/releases/download/v0.5.7/TongZhuo-Connector-v0.5.7-macOS-Apple-Silicon.zip) |
| macOS 13.5+，Intel | [同桌连接器 v0.5.7 · macOS Intel](https://github.com/IanYet/agent-game/releases/download/v0.5.7/TongZhuo-Connector-v0.5.7-macOS-Intel.zip) |

Windows 双击 EXE；macOS 解压 ZIP，将「同桌连接器.app」拖入「应用程序」后打开。安装包自带 Node.js；Windows 还自带 .NET 与 Windows App SDK，无需另装开发环境。

Windows 包尚未做 Authenticode 签名。macOS 包只有 ad-hoc 本地签名，没有 Developer ID 身份签名，也未经过 Apple 公证；ad-hoc 不表示 Apple 已审核或认证。每个安装包附带 `.sha256` 校验和，Release 中的 `SHA256SUMS.txt` 汇总三平台文件。

macOS 首次打开受阻时，先核对下载来源和校验和。确认信任且文件未被篡改后，先尝试打开一次，再进入「系统设置」→「隐私与安全性」，针对本应用点击「仍要打开」，按要求验证身份并在警告中点「打开」。受管理的 Mac 可能限制此操作；恶意软件、将损坏电脑或应用已损坏的提示不能当作普通身份提示放行。无需关闭 Gatekeeper 或删除下载隔离属性，完整条件见 [Apple 官方说明](https://support.apple.com/zh-cn/102445)。ZIP 根目录附有[首次启动说明](../../apps/connector/macos/请先阅读.txt)。

## 连接并开桌

1. 启动连接器，在「可用程序」中检查 Agent 程序和登录状态。
2. 打开[游戏网站](https://ianyet.github.io/agent-game/)，选择游戏后连接本机，允许浏览器访问本地网络，查看检测结果并手动继续。
3. 在玩家名单中新增或移除玩家，为每位 Agent 选择程序、模型和思考强度；拖拽左侧手柄调整座位和新桌开局顺序。最多一位真人，也可全部使用 Agent。
4. 确认开始。已有当前桌时，网页会先要求确认替换；各游戏人数和规则版本见[游戏目录](../games/README.md)。

未连接时也能浏览游戏并先配置桌面，读取模型和开始对局前需要连接本机。模型目录来自各 Harness，自带的登录和模型权限分别生效；能够读到模型目录不代表一定有推理权限。WorkBuddy 独立 CLI 的登录可能与桌面端不同。

关闭连接器窗口后，服务仍在 Windows 托盘或 macOS 菜单栏运行；选择「退出连接器」才会停止本次启动的进程并释放端口。日常使用见[连接器配置](connector.md)和[游戏桌与记录](playing.md)，遇到错误看[常见问题](troubleshooting.md)。
