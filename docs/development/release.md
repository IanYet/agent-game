# 构建与发布

[文档目录](../README.md) · [本地开发](README.md)

## 发布前

确认改动已通过对应的[规则测试、类型检查和实际操作检查](testing.md)。网页与连接器独立管理版本：只改游戏和界面时只发布网页；修改连接器实现或协议能力时，更新连接器版本及所需能力声明。

项目通过 PR 合并到 `main`。需要升级连接器时，先在需求分支构建并发布对应连接器，确认三平台下载就绪，再合并 PR 触发网页部署。合并后确认改动已保存，清理本地和远端需求分支。

## 原生打包

先运行 `npm run build:connector`，再在对应系统运行 `npm run package:windows` 或 `npm run package:macos`。

产物在 `release/`，每个安装包附带 `.sha256` 校验和及 `.build.json` 构建信息。Windows 打包还会生成静态下载分片与清单，写入 `apps/web/public/downloads/` 和 `dist/client/downloads/`，供使用静态下载的网页拼接并校验。

Windows 构建需要 .NET 10 SDK；可用 `DOTNET_EXE` 指定绝对路径。`Connector.csproj` 使用 WinUI 3 与 Windows App SDK 2.5.1，自包含发布 .NET 和原生运行时，再用便携 EXE 封装。用户无需安装开发 SDK、Windows App Runtime 或 Node.js。构建会通过 NuGet 获取 Windows SDK 工具。

界面使用微软推荐的 [WinUI](https://developer.microsoft.com/en-us/windows/apps/build-a-windows-app)、[NavigationView](https://learn.microsoft.com/en-us/windows/apps/design/controls/navigationview) 和 [Mica](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/materials)，保留系统窗口框与控件。发布模型参考[非打包 WinUI 应用分发](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/unpackage-winui-app)。项目显式发布自身 PRI 资源，避免当前 SDK 的[非打包资源发布问题](https://github.com/microsoft/WindowsAppSDK/issues/6720)。

macOS 构建需要包含 macOS SDK 26 或更新版本的 Xcode 工具链，可用 `DEVELOPER_DIR` 选择；脚本会检查实际 SDK，不假定 runner 自带哪个版本。应用使用 SwiftUI 的标准窗口、分栏、工具栏、设置和菜单栏，在新系统采用系统外观，在旧系统采用对应原生外观，最低运行系统仍是 Node.js 24 要求的 macOS 13.5。原生代码必须在 Mac 上完成编译和使用检查。

Actions 会从 runner 已安装的稳定版 Xcode 中选择最高版本（至少 26），记录实际 Xcode 与 SDK 版本，避免默认工具链较旧导致构建失败。预览版不参与选择。

macOS 的布局采用 Apple [窗口规范](https://developer.apple.com/design/human-interface-guidelines/windows)、[侧栏规范](https://developer.apple.com/design/human-interface-guidelines/sidebars)、[设置规范](https://developer.apple.com/design/human-interface-guidelines/settings)及 [NavigationSplitView](https://developer.apple.com/documentation/swiftui/navigationsplitview)、[MenuBarExtra](https://developer.apple.com/documentation/swiftui/menubarextra)；材质交给标准控件适配，遵循 [Liquid Glass 采用指南](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)。`NavigationSplitView` 与 `MenuBarExtra` 从 macOS 13 可用；最低 13.5 来自[随包 Node.js 24 的要求](https://nodejs.org/en/blog/migrations/v22-to-v24)，与构建 SDK 版本分别约束。

图标源是 `apps/connector/assets/icon.svg`，经完整 SVG 渲染生成多尺寸 ICO、ICNS、窗口与托盘素材；macOS 菜单栏使用去掉底板的模板图，颜色由系统适配。

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

安装包名称和 Release 显示名统一放在 [connector-assets.mjs](../../scripts/connector-assets.mjs)，从连接器版本文件自动读取版本。Actions 下载产物与 Release 显示名写明产品、版本、系统和芯片，例如「同桌连接器 v0.5.7 · Windows 64 位」。新打包文件使用带版本的 ASCII 名称，例如：

- `TongZhuo-Connector-v0.5.7-Windows-x64.exe`
- `TongZhuo-Connector-v0.5.7-macOS-Apple-Silicon.zip`
- `TongZhuo-Connector-v0.5.7-macOS-Intel.zip`

校验和与构建信息沿用完整安装包文件名，分别追加 `.sha256` 与 `.build.json`。客户端检查更新时，按最新正式 Release 的版本查找对应系统和芯片的安装包。

三个平台打包完成后，发布作业核对版本、平台、源提交、文件大小与 SHA-256，并生成 `SHA256SUMS.txt`。只有发布作业拥有 Release 写权限，同一仓库的连接器发布按顺序运行。

新版本先创建草稿 Release，上传全部文件并核对 GitHub 返回的摘要，再公开并通过正式 tag 下载地址检查文件大小与 SHA-256。发布失败时回滚本次资产操作；重试会复用同版本草稿，下载地址短暂未就绪时会限次等待。重跑已有版本时保留原 tag、标题和正文，且 tag 必须指向安装包的源提交；实际构建信息保存在 `.build.json`。

连接器版本来自 `apps/connector/version.json`。修改时同步 Windows `Launcher.cs` 和 `Bootstrap.cs` 的 `AssemblyVersion`、`AssemblyFileVersion`；打包会核对它们。macOS 的应用版本由打包脚本生成。本地未提交的构建会在 `.build.json` 标记 `sourceDirty: true`；CI 拒绝从未保存到 Git 的源码发布。

Windows 可用 `Get-FileHash .\TongZhuo-Connector-v0.5.7-Windows-x64.exe -Algorithm SHA256` 查看校验和；macOS 可运行 `shasum -a 256 -c TongZhuo-Connector-v0.5.7-macOS-Apple-Silicon.zip.sha256`，按实际下载文件名替换。下载地址见[开始游戏](../guide/README.md#安装连接器)。

连接器运行配置与日志位置见[连接器配置](../guide/connector.md)，安装与首次打开见[开始游戏](../guide/README.md)。
