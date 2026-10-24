import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

// One reviewed SVG is the source for EXE, window, tray, Dock and menu bar.
// Use a full SVG renderer: the brand contains rotated, stroked ellipses.
export async function connectorIcons() {
  const directory = resolve('.cache/generated-icons'); await mkdir(directory, { recursive: true });
  const svg = await readFile('apps/connector/assets/icon.svg', 'utf8');
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024], images = new Map();
  for (const size of sizes) {
    const bytes = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
    images.set(size, bytes); await writeFile(join(directory, `icon-${size}.png`), bytes);
  }
  // Template images have no tile: macOS supplies the light/dark foreground.
  const template = svg.replace(/<rect\b[^>]*\/>/g, '').replaceAll('#f0f0e9', '#000000');
  for (const size of [18, 36, 54]) await writeFile(join(directory, `menu-${size}.png`), new Resvg(template, { fitTo: { mode: 'width', value: size } }).render().asPng());
  const icoSizes = sizes.filter(size => size <= 256), header = Buffer.alloc(6 + 16 * icoSizes.length);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4); let offset = header.length;
  for (let i = 0; i < icoSizes.length; i++) {
    const size = icoSizes[i], entry = 6 + i * 16; header[entry] = size % 256; header[entry + 1] = size % 256;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6); header.writeUInt32LE(images.get(size).length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += images.get(size).length;
  }
  const ico = join(directory, 'connector.ico'); await writeFile(ico, Buffer.concat([header, ...icoSizes.map(size => images.get(size))]));
  return { directory, ico };
}
