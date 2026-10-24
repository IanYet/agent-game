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
await copyFile(join(icons.directory, 'menu-18.png'), join(resources, 'MenuIcon.png'));
await copyFile(join(icons.directory, 'menu-36.png'), join(resources, 'MenuIcon@2x.png'));
await copyFile(join(icons.directory, 'menu-54.png'), join(resources, 'MenuIcon@3x.png'));
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
const sdk = execFileSync('xcrun', ['--sdk', 'macosx', '--show-sdk-version'], { encoding: 'utf8' }).trim();
if (Number(sdk.split('.')[0]) < 26) throw new Error(`macOS SDK ${sdk} is too old. Select Xcode with macOS SDK 26 or newer (DEVELOPER_DIR). The app still targets macOS ${minimum}.`);
run('xcrun', ['clang', '-O2', '-Wall', '-Wextra', '-Werror', '-target', target, 'apps/connector/macos/Guardian.c', '-o', join(bin, 'ConnectorGuardian')]);
const identity = join(staging, 'ProcessIdentity.o');
run('xcrun', ['clang', '-O2', '-Wall', '-Wextra', '-Werror', '-target', target, '-c', 'apps/connector/macos/ProcessIdentity.c', '-o', identity]);
run('xcrun', ['swiftc', '-O', '-swift-version', '5', '-parse-as-library', '-target', target, '-framework', 'AppKit', '-framework', 'SwiftUI', '-import-objc-header', 'apps/connector/macos/ProcessIdentity.h', 'apps/connector/macos/Launcher.swift', 'apps/connector/macos/PortInspector.swift', identity, '-o', join(bin, 'TongZhuoConnector')]);
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
<key>NSHighResolutionCapable</key><true/>
<key>NSLocalNetworkUsageDescription</key><string>允许游戏网页连接本机同桌连接器。</string>
</dict></plist>\n`);
await copyFile('apps/connector/macos/请先阅读.txt', join(staging, '请先阅读.txt'));
// Apple Silicon requires a valid local code signature. Ad-hoc is NOT Developer
// ID signing, notarization, or a Gatekeeper approval. Preserve that distinction.
for (const path of [join(resources, 'runtime/node'), join(bin, 'ConnectorGuardian'), app]) run('/usr/bin/codesign', ['--force', '--sign', '-', path]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
run('/usr/bin/plutil', ['-lint', join(contents, 'Info.plist')]);
const asset = resolve('release', connectorPackageName('darwin', arch));
run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, asset]);
// Include the installation/signing notice alongside the .app in the ZIP.
run('/usr/bin/zip', ['-j', asset, join(staging, '请先阅读.txt')]);
await packageMetadata(asset, 'darwin', arch, { type: 'ad-hoc', developerId: false, notarized: false, minimumMacOS: minimum, sdk, manualMacAcceptance: 'pending' });
console.log(`Native app packaged: ${asset}`);
