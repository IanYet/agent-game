import { mkdir, mkdtemp, writeFile, chmod, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { preparePayload, packageMetadata } from './package-shared.mjs';
import { connectorIcons } from './connector-icons.mjs';
import { connectorPackageName } from './connector-assets.mjs';

if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) throw new Error('Package on a native macOS arm64 or x64 runner.');
const arch = process.arch;
if (process.env.PACKAGE_ARCH && process.env.PACKAGE_ARCH !== arch) throw new Error(`Runner architecture ${arch} does not match ${process.env.PACKAGE_ARCH}.`);
await mkdir('release', { recursive: true });
const staging = await mkdtemp(resolve('release/macos-'));
const app = join(staging, '同桌连接器.app'), contents = join(app, 'Contents'), bin = join(contents, 'MacOS'), resources = join(contents, 'Resources');
await mkdir(bin, { recursive: true });
const version = await preparePayload(resources, 'node');
const icons = await connectorIcons(), iconset = join(staging, 'Connector.iconset');
await mkdir(iconset);
for (const size of [16, 32, 128, 256, 512]) {
  await copyFile(join(icons.directory, `icon-${size}.png`), join(iconset, `icon_${size}x${size}.png`));
  await copyFile(join(icons.directory, `icon-${size * 2}.png`), join(iconset, `icon_${size}x${size}@2x.png`));
}
execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(resources, 'Connector.icns')], { stdio: 'inherit' });
// Node 24's official prebuilt binaries require macOS 13.5. Do not advertise
// an older OS merely because the tiny launcher could compile for it.
const minimum = '13.5';
const target = `${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx${minimum}`;
const run = (program, args) => execFileSync(program, args, { stdio: 'inherit' });
run('xcrun', ['clang', '-O2', '-Wall', '-Wextra', '-Werror', '-target', target, 'apps/connector/macos/Guardian.c', '-o', join(bin, 'ConnectorGuardian')]);
run('xcrun', ['swiftc', '-O', '-swift-version', '5', '-target', target, '-framework', 'AppKit', 'apps/connector/macos/Launcher.swift', '-o', join(bin, 'TongZhuoConnector')]);
await chmod(join(resources, 'runtime/node'), 0o755);
await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>io.github.ianyet.agent-game.connector</string>
<key>CFBundleName</key><string>同桌连接器</string>
<key>CFBundleDisplayName</key><string>同桌连接器</string>
<key>CFBundleExecutable</key><string>TongZhuoConnector</string>
<key>CFBundleIconFile</key><string>Connector.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>${minimum}</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>NSLocalNetworkUsageDescription</key><string>允许游戏网页连接本机同桌连接器。</string>
</dict></plist>\n`);
await writeFile(join(staging, '请先阅读.txt'), `同桌 · macOS 本地连接器 v${version} (${arch})

macOS 13.5 或更新版本。Apple Silicon 使用 arm64；Intel 使用 x64。
解压后将「同桌连接器.app」拖到「应用程序」，双击打开，无需安装 Node.js。
顶部菜单栏「同桌」显示运行状态，回到游戏网页点击「连接本机」。
从菜单栏选择「退出连接器」会停止本次连接器和 Harness 子进程，释放端口。
Codex、dsh、WorkBuddy 需自行安装并完成各自的官方登录；模型目录不代表推理权益。

这是开发分发包：只有本机 ad-hoc 签名，没有 Developer ID 签名，也未公证。
首次打开可能被 Gatekeeper 拦截。请先核实 GitHub Release 来源和 .sha256；
如信任该应用，按 Apple 官方说明在系统设置 > 隐私与安全性中对本应用选择「仍要打开」。
https://support.apple.com/102445
不要全局关闭 Gatekeeper，不要移除下载隔离属性。若系统不允许打开，请等待签名发行包。
首次打开、菜单操作和真实账户对弈需要在 Mac 上实际确认。

数据/自定义 connector.config.json：~/Library/Application Support/AgentArcade/
日志：~/Library/Logs/AgentArcade/connector.log
下载旁的 .build.json 记录源提交、架构、运行时、校验和及准确的签名状态。
`);
// Apple Silicon requires a valid local code signature. Ad-hoc is NOT Developer
// ID signing, notarization, or a Gatekeeper approval. Preserve that distinction.
for (const path of [join(resources, 'runtime/node'), join(bin, 'ConnectorGuardian'), app]) run('/usr/bin/codesign', ['--force', '--sign', '-', path]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
run('/usr/bin/plutil', ['-lint', join(contents, 'Info.plist')]);
const asset = resolve('release', connectorPackageName('darwin', arch));
run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, asset]);
// Include the installation/signing notice alongside the .app in the ZIP.
run('/usr/bin/zip', ['-j', asset, join(staging, '请先阅读.txt')]);
await packageMetadata(asset, 'darwin', arch, { type: 'ad-hoc', developerId: false, notarized: false, minimumMacOS: minimum, manualMacAcceptance: 'pending' });
console.log(`Native app packaged: ${asset}`);
