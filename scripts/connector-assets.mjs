import { readFileSync } from 'node:fs';

export const connectorVersion = JSON.parse(readFileSync(new URL('../apps/connector/version.json', import.meta.url), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(connectorVersion)) throw new Error('Invalid connector version.');

export const connectorPackages = [
  { platform: 'win32', arch: 'x64', name: `TongZhuo-Connector-v${connectorVersion}-Windows-x64.exe`, label: `同桌连接器 v${connectorVersion} · Windows 64 位` },
  { platform: 'darwin', arch: 'arm64', name: `TongZhuo-Connector-v${connectorVersion}-macOS-Apple-Silicon.zip`, label: `同桌连接器 v${connectorVersion} · macOS Apple Silicon` },
  { platform: 'darwin', arch: 'x64', name: `TongZhuo-Connector-v${connectorVersion}-macOS-Intel.zip`, label: `同桌连接器 v${connectorVersion} · macOS Intel` },
];

export function connectorPackageName(platform, arch) {
  const asset = connectorPackages.find(asset => asset.platform === platform && asset.arch === arch);
  if (!asset) throw new Error(`Unsupported connector platform: ${platform}/${arch}`);
  return asset.name;
}
