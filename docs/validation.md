# 协议 4 开发验证记录

## 2026-10-24：跨平台连接器与发布补包

此轮纳入 main 已发布的 0.4.1 ACP 审批与网页收尾修复，增加 UI/图标更新和 macOS 支持，双端统一升至连接器 **0.4.2、协议 4**，Windows 文件版本为 0.4.2.0；macOS Info.plist 从同一 version.json 生成。新增 macOS arm64/x64 `.app`（自带 Node、原生菜单栏、退出入口、Guardian）、macOS Application Support 路径、GUI PATH/Harness 发现；Windows 窗口改为自动布局、完整换行和一次 DPI 缩放。两端应用、Windows 窗口/托盘、macOS 菜单栏使用同一 SVG 源图标。

合并 0.4.1 前的本地 Windows 已通过：107 项单元/集成测试、类型检查、网页构建、生产桥跨三种游戏不重建验证、7 项发布器失败/回滚测试、最终 EXE 无账户生命周期检查。界面以一致的 96-DPI 基准，分别放大几何和字体到 100%/150%/200%，渲染启动/已就绪/已连接/长错误和更新提示；检查文本首选高度、列边界及按钮在窗口内。高 DPI 桌面另有实际显示渲染检查；这不代替其他显示器/系统字体的人工验收。

首次 [GitHub 原生矩阵运行](https://github.com/IanYet/agent-game/actions/runs/39986533838)中，macos-15（arm64）与 macos-15-intel（x64）均通过完整构建、打包、代码签名结构检查以及最终 ZIP 的自动运行检查：

- 解压到带空格的路径，核对内置 Node 的真实 Mach-O 架构和应用版本。
- 在生产桥中建立公开 ACP fixture 会话及忽略 SIGTERM 的孙进程。
- 重复启动不影响原实例；只向启动器发 SIGKILL 后整组退出，监听端口可立即复用。
- SIGTERM、正常 timed Quit 均清理子进程和端口，再次启动成功。
- runner 上执行 AppKit 正常入口并自动退出；最小 Finder PATH、无 Node 安装入口和无可用 Harness 时仍可启动桥。

首次 Windows CI 在大尺寸界面渲染时被 runner 的虚拟屏幕边界限制，发布作业按预期跳过。渲染测试已允许截图窗口按内容扩展，保留所有内容/边界断言；实际应用在小屏仍可滚动。随后还修正最低系统为 macOS 13.5，匹配 [Node 24 官方要求](https://nodejs.org/en/blog/migrations/v22-to-v24)。最终发布运行与资产哈希在完成后记录于本节。

### 真实 Mac 仍需完成的验收

当前开发机是 Windows，没有 Mac 真机或 Developer ID/公证凭据。以上 runner 自动运行结果不表示下列项目已完成：

1. 分别在 Apple Silicon / Intel 真机上从浏览器下载 Release，保留系统下载隔离，验证解压、拖入 Applications、Finder 双击和应用图标。
2. 核对当前 ad-hoc 包的真实 Gatekeeper 提示，并按 Apple 单应用「仍要打开」流程验证；禁止关闭 Gatekeeper 或删除隔离属性。系统不提供该入口时应等待正式签名包。
3. 目视检查菜单栏深色/浅色外观、图标、状态、网页/数据/版本入口和「退出连接器」；测试强制退出后网页即时断开及 3211 端口释放。
4. 在真实 Codex/dsh/WorkBuddy 安装布局中验证 Finder PATH、官方 CLI 发现、原生账户登录、模型目录以及各自真实推理/对弈，逐一记录权益与认证限制。CI fixture 不证明真实账户可用，WorkBuddy 的独立修复仍另行验收。
5. 检查 Safari/Chrome 对公开 HTTPS 网页访问 loopback 的权限提示、建立/断开/重连；检查最低支持 macOS 13.5 及常见显示缩放。
6. 获得证书后另行完成 Developer ID 签名、hardened runtime/entitlements 评估、notarytool 公证、staple 和全新下载验收。当前包不得标记为已完成这些步骤。

下面先保留 Windows 0.4.1 授权修复首发包的实机验证，再保留 0.4.0 基线记录；历史包哈希不表示本次跨平台补包哈希。

## 0.4.1 实机补丁验证（2026-10-24）

修复 Codex ACP 的只读预设触发工具审批后，连接器无条件取消合法出牌的问题。现在按当前原生会话、活动任务、MCP 通知中的服务器/已注册工具与 call ID 关联，仅选择一次性授权；暂停、结束、工具完成及参数变化会撤销关联。另修复真人结算立即关闭会话时，把尚未返回的 Agent 任务错误上报到已结束牌局的竞态。

本版验证：

- 118 项自动测试、类型检查和网页/连接器构建通过。新增审批回归覆盖没有标题的原生请求、动态工具名、未知工具、其他 MCP、跨会话、重复授权、永久授权选项及暂停后旧 call ID；收尾竞态用延迟返回的原生任务 fixture 复现后修复。
- **最终 Windows EXE 的真实账户推理**：一位测试驱动的真人位 + Atlas/Nova/Echo 三个独立 Codex ACP 会话，模型均为 `gpt-6.1-sol`、`low`，盲注 5/10，完成整手德州至 revision 11、摊牌结束。三位 Agent 均完成行动；总筹码 4000，结算后守恒。不是模拟模型或 ACP fixture。
- 在真实推理中暂停，然后恢复同样的三个原生会话，后续出牌及结算成功。复现命令 `npm run test:packaged-acp` 会显式使用真实账户额度，读取已经构建好的 `release/同桌连接器.exe`，不重建或替换它。
- Chrome 原始报错牌桌连接同一个最终 EXE 后，Echo 正常提交弃牌，轮到真人；未再出现原错误，浏览器控制台无警告/错误。
- 最终 EXE 正常退出、仅强制结束启动器、全部 7 个所属子进程回收、端口释放和立即重启通过。
- 同一个生产连接器 bundle 依次完成斗地主、德州及 12 人同时竞价，期间进程和 bundle 哈希保持不变。

最终 EXE SHA-256：`d0caa249f8a138719ecc3a518f747288840c4a15cb26a3d3ace4f3ea3b240e43`。

本机证据：`.cache/validation/packaged-acp-proof.json`、`packaged-acp-v0.4.1.log`、`windows-lifecycle-v0.4.1.log`、`browser-v0.4.1.png` 与 `dynamic-connector-proof.json`；不提交临时会话或凭据。网页最低连接器版本提升到 0.4.1，桥接协议仍为 4。

以下保留 0.4.0 基线的历史验证记录。

日期：2026-10-23。此记录区分协议 fixture、真实账户推理和最终 EXE。

本轮完成：105 项自动测试、类型检查与完整源码构建通过。浏览器验证了两款模块牌桌、德州 2–9 人配置、独立原生模型目录和刷新后暂停恢复。

## 自动测试

`npm test` 覆盖：

- 斗地主牌型/比较、100 局合法自动测试序列的牌与分数守恒。
- 德州牌力、加注权、短筹码、边池、平分/零头、退款及 1000 手随机测试序列的筹码与牌守恒。
- 四种 Harness 的独立设置与协议适配；各自模型目录和原始模型 ID。
- 真实 HTTP MCP 整局斗地主/德州、手牌隔离、重复动作拒绝、断线、暂停、九座位、跨手重新建会话、筹码/买入/离桌继承、新桌重置。
- 非牌类同时竞价：12 人、不同工具名与参数、多次草案交互、私有视图、结构化和图片结果、多个并发决策、重复/过期授权、超时和 room 会话复用。
- JSON Schema 的整数、范围、枚举、额外字段、输出结构、2020-12/draft-07，以及非法/外部引用拒绝。
- 网页与连接器版本独立、缺失 capability 拒绝。
- 真实连接器打包依赖图不包含网页/React/规则库；桥、协议、Harness 没有具体游戏或固定牌类工具。
- 当前存档格式恢复且默认暂停；旧格式不迁移。
- Agent 状态与提示词仅带 12 条合法行动预览和总数，可分页读取其余行动；真人界面保留完整列表。

测试驱动不作为产品玩家实现，也不调用订阅推理。

## 同一个已构建连接器服务新游戏

复现：

```powershell
npm run build:connector
npm run test:dynamic-connector
```

第二个命令不会构建连接器。它使用生产 `dist/connector/index.cjs` 的独立进程，通过公开 DSH_PATH 指向明确的测试 ACP 驱动，再经过真实 HTTP/SSE/MCP 链路：

1. 三位玩家完成斗地主。
2. 同进程两位玩家完成德州。
3. 网页注册表此时才加入新的密封竞价模块，十二位玩家并行报价/确认。

每阶段检查进程仍存活和 bundle SHA-256 不变。竞价实际 tools/list 为 auction.peek、auction.offer、auction.confirm；执行 84 次 tools/call，包含 36 次预期拒绝（超预算、伪造玩家参数、重复确认），返回私有结构化观察与图片。每个原生 fixture 的 dsh 工具守卫还校验新声明工具被动态放行、非 MCP 工具被拒绝。

本次验证进程 PID 为 59028；三种游戏之间保持相同 bundle SHA-256：

`c37e672eda19218765fdd9bf6c5b0a5691e185353714de68ef8758ecba9e0c34`

机器可读证据输出到 `.cache/validation/dynamic-connector-proof.json`，包括时间、同一 PID、bundle 哈希、各游戏参与者数和调用数。详细测试日志只存本地忽略目录，不把 capability URL 或凭据提交到仓库。

该验证证明实际生产桥的动态注册、参数/身份绑定、并发与结果转发；**不证明 WorkBuddy 认证或 LLM 推理能力**。

## 原生 Harness

本轮重构前已通过：

- dsh 账户 Flash 模型真实斗地主操作，以及三座位德州推进到翻牌。
- Codex ACP + dsh + Codex App Server 混合真实德州推进到转牌。
- Windows 0.3 EXE 的正常/强制退出、原生 ACP/Codex 子进程回收与端口复用。

协议 4 重构后，再次使用本机 dsh 账户 Flash、low 强度和三个独立会话完成真实斗地主 smoke：55 秒推进到 revision 7，进入出牌阶段并有合法出牌；使用当前网页权威状态、动态 MCP 与原生 Harness。完成后已停止这些会话。

WorkBuddy 2.161.0 的独立公开 ACP：initialize、session/new 和九个原生模型目录可用；用户完成官方 Chrome 登录后，prompt 仍返回 Authentication required。它的修复在独立任务中进行，未通过真实调用前不计为真实对弈成功。

## 最终 Windows 包

v0.4.0 先发布已验证的功能，WorkBuddy 专项修复单独推进。发行说明单独列出 WorkBuddy 限制；旧包历史结果不代替新包验证。

本轮 Windows 0.4.0 单文件 EXE 已通过：真实 ACP/Codex 会话建立、仅强制结束 EXE 本身时回收全部 5 个子进程、正常退出清理、端口释放及立即重启。窗口/托盘逻辑沿用原实现，本轮仅更新原生版本号。静态下载分片重组后逐字节匹配最终 EXE。

最终 EXE SHA-256：`b608facb7516c6353c05b054d549ac2e35942c3d5bd64318a57fd9df5f3fc93d`。
