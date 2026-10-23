export const connectorPackages = [
  { platform: 'win32', arch: 'x64', name: 'TongZhuo-Connector-Windows-x64.exe', label: '同桌连接器 · Windows 64 位' },
  { platform: 'darwin', arch: 'arm64', name: 'TongZhuo-Connector-macOS-Apple-Silicon.zip', label: '同桌连接器 · macOS Apple Silicon' },
  { platform: 'darwin', arch: 'x64', name: 'TongZhuo-Connector-macOS-Intel.zip', label: '同桌连接器 · macOS Intel' },
];

export function connectorPackageName(platform, arch) {
  const asset = connectorPackages.find(asset => asset.platform === platform && asset.arch === arch);
  if (!asset) throw new Error(`Unsupported connector platform: ${platform}/${arch}`);
  return asset.name;
}
