// Rasterize the small, deliberately restricted SVG primitive set without adding
// a browser or a native image dependency to native packaging. SVG is the source.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const table = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function chunk(type, data) {
  const name = Buffer.from(type), body = Buffer.concat([name, data]); let crc = 0xffffffff;
  for (const value of body) crc = table[(crc ^ value) & 255] ^ (crc >>> 8);
  const header = Buffer.alloc(4), tail = Buffer.alloc(4); header.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, body, tail]);
}

export async function connectorIcons() {
  const directory = resolve('.cache/generated-icons'); await mkdir(directory, { recursive: true });
  const svg = await readFile('apps/connector/assets/icon.svg', 'utf8');
  const shapes = [...svg.matchAll(/<(rect|circle)\b([^>]+)\/>/g)].map(([, type, text]) => {
    const a = Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    const rotate = /rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)/.exec(a.transform ?? '');
    return { type, a, color: [1, 3, 5].map(i => parseInt(a.fill.slice(i, i + 2), 16)), rotation: rotate ? rotate.slice(1).map(Number) : [0, 0, 0] };
  });
  if (shapes.length !== 10) throw new Error('Review SVG rasterizer when changing icon primitives.');
  function png(size) {
    const scan = Buffer.alloc(size * (size * 4 + 1)), scale = size / 256;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (const { type, a, color, rotation: [angle, originX, originY] } of shapes) {
        const radians = angle * Math.PI / 180, px = (x + 0.5) / scale - originX, py = (y + 0.5) / scale - originY;
        const rx = px * Math.cos(radians) + py * Math.sin(radians) + originX, ry = -px * Math.sin(radians) + py * Math.cos(radians) + originY;
        let distance;
        if (type === 'circle') distance = Math.hypot(rx - Number(a.cx), ry - Number(a.cy)) - Number(a.r);
        else {
          const radius = Number(a.rx ?? 0), qx = Math.abs(rx - Number(a.x) - Number(a.width) / 2) - Number(a.width) / 2 + radius;
          const qy = Math.abs(ry - Number(a.y) - Number(a.height) / 2) - Number(a.height) / 2 + radius;
          distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
        }
        const cover = Math.max(0, Math.min(1, 0.5 - distance * scale));
        red = color[0] * cover + red * (1 - cover); green = color[1] * cover + green * (1 - cover); blue = color[2] * cover + blue * (1 - cover); alpha = cover + alpha * (1 - cover);
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      scan[offset] = alpha ? red / alpha : 0; scan[offset + 1] = alpha ? green / alpha : 0; scan[offset + 2] = alpha ? blue / alpha : 0; scan[offset + 3] = alpha * 255;
    }
    const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]);
  }
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024], images = new Map();
  for (const size of sizes) { const bytes = png(size); images.set(size, bytes); await writeFile(join(directory, `icon-${size}.png`), bytes); }
  const icoSizes = sizes.filter(size => size <= 256), header = Buffer.alloc(6 + 16 * icoSizes.length);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4); let offset = header.length;
  for (let i = 0; i < icoSizes.length; i++) {
    const size = icoSizes[i], entry = 6 + i * 16; header[entry] = size % 256; header[entry + 1] = size % 256;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6); header.writeUInt32LE(images.get(size).length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += images.get(size).length;
  }
  const ico = join(directory, 'connector.ico'); await writeFile(ico, Buffer.concat([header, ...icoSizes.map(size => images.get(size))]));
  return { directory, ico };
}
