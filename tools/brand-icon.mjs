#!/usr/bin/env node
/**
 * Brand icon pipeline (zero dependencies).
 *
 * `brand/aegis-music-icon.png` is the master artwork: black phoenix over a
 * shield, cyan/violet gradient, circuit branches. This module turns it into
 * every size the product needs — PWA icons, maskable icon, favicon, the store
 * listing and Android mipmaps — with no image library installed.
 *
 * The master is RGB, so decoding is a plain unfilter pass. The paper background
 * is textured, so instead of hardcoding a white key we sample the corners and
 * crop to whatever differs from that sample. That keeps the artwork framed
 * tightly even if the master is re-generated later.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MASTER = join(ROOT, 'brand', 'aegis-music-icon.png');

const TARGET = 1024;

/** Flat field behind the art — must match theme_color in the manifest. */
const FIELD = [0xe8, 0xec, 0xf3];

// ---------------------------------------------------------------- PNG decode
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Minimal PNG reader: 8-bit RGB or RGBA, non-interlaced (what our master is). */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const parts = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error('only 8-bit PNGs are supported');
      if (data[12] !== 0) throw new Error('interlaced PNGs are not supported');
      colorType = data[9];
      if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported colour type ${colorType}`);
    } else if (type === 'IDAT') {
      parts.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = value & 0xff;
    }
    out.copy(pixels, y * stride);
    prev = out;
  }
  return { width, height, channels, pixels };
}

// ---------------------------------------------------------------- framing
function sampleBackground(image) {
  const { width, height, channels, pixels } = image;
  const patch = 24;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const squares = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ];
  for (const [sx, sy] of squares) {
    for (let y = sy; y < sy + patch; y += 1) {
      for (let x = sx; x < sx + patch; x += 1) {
        const i = (y * width + x) * channels;
        r += pixels[i];
        g += pixels[i + 1];
        b += pixels[i + 2];
        n += 1;
      }
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function contentBox(image, bg) {
  const { width, height, channels, pixels } = image;
  const THRESHOLD = 26;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const dr = Math.abs(pixels[i] - bg[0]);
      const dg = Math.abs(pixels[i + 1] - bg[1]);
      const db = Math.abs(pixels[i + 2] - bg[2]);
      if (Math.max(dr, dg, db) > THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, size: Math.min(width, height) };
  // Square the box around its centre so the artwork never stretches.
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const side = Math.max(maxX - minX + 1, maxY - minY + 1);
  const padded = Math.min(Math.min(width, height), Math.round(side * 1.14));
  return {
    x: Math.round(cx - padded / 2),
    y: Math.round(cy - padded / 2),
    size: padded,
  };
}

let cached = null;

/** Master artwork cropped to a square, resampled to TARGET² on a flat field. */
export function loadArt() {
  if (cached) return cached;
  const image = decodePng(readFileSync(MASTER));
  const bg = sampleBackground(image);
  const box = contentBox(image, bg);
  const out = Buffer.alloc(TARGET * TARGET * 4);
  const { width, channels, pixels } = image;

  for (let y = 0; y < TARGET; y += 1) {
    const sy = Math.min(image.height - 1, Math.max(0, Math.round(box.y + (y / TARGET) * box.size)));
    for (let x = 0; x < TARGET; x += 1) {
      const sx = Math.min(width - 1, Math.max(0, Math.round(box.x + (x / TARGET) * box.size)));
      const i = (sy * width + sx) * channels;
      const o = (y * TARGET + x) * 4;
      // The master's paper has generative grain. Snapping near-background
      // pixels to one flat colour removes it, which is also what keeps the
      // PNG small and the edges crisp at 64 px.
      const near =
        Math.abs(pixels[i] - bg[0]) < 22 &&
        Math.abs(pixels[i + 1] - bg[1]) < 22 &&
        Math.abs(pixels[i + 2] - bg[2]) < 22;
      out[o] = near ? FIELD[0] : pixels[i];
      out[o + 1] = near ? FIELD[1] : pixels[i + 1];
      out[o + 2] = near ? FIELD[2] : pixels[i + 2];
      out[o + 3] = 255;
    }
  }
  cached = { pixels: out, background: bg };
  return cached;
}

/** Box-filtered downscale from the framed master. */
export function render(size) {
  const { pixels, background } = loadArt();
  const out = Buffer.alloc(size * size * 4);
  const scale = TARGET / size;
  for (let y = 0; y < size; y += 1) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
    for (let x = 0; x < size; x += 1) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * TARGET + sx) * 4;
          r += pixels[i];
          g += pixels[i + 1];
          b += pixels[i + 2];
          n += 1;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = 255;
    }
  }
  return { pixels: out, background };
}

/** Art shrunk into the middle of a flat field — the maskable/adaptive shape. */
export function renderPadded(size, ratio = 0.78) {
  const inner = Math.max(8, Math.round(size * ratio));
  const art = render(inner).pixels;
  const out = Buffer.alloc(size * size * 4);
  const off = Math.round((size - inner) / 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const o = (y * size + x) * 4;
      const inside = x >= off && y >= off && x < off + inner && y < off + inner;
      if (inside) {
        const si = ((y - off) * inner + (x - off)) * 4;
        out[o] = art[si];
        out[o + 1] = art[si + 1];
        out[o + 2] = art[si + 2];
      } else {
        out[o] = FIELD[0];
        out[o + 1] = FIELD[1];
        out[o + 2] = FIELD[2];
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Writes the PWA set, favicon and the store listing image. */
export function writeIconSet() {
  const icons = join(ROOT, 'public', 'icons');
  const store = join(ROOT, 'store');
  mkdirSync(icons, { recursive: true });
  mkdirSync(store, { recursive: true });

  const files = [
    { name: 'icon-512.png', size: 512, kind: 'art' },
    { name: 'icon-192.png', size: 192, kind: 'art' },
    { name: 'icon-maskable-512.png', size: 512, kind: 'pad' },
    { name: 'favicon-64.png', size: 64, kind: 'art' },
  ];

  const written = [];
  for (const file of files) {
    const png =
      file.kind === 'pad'
        ? encodePng(file.size, file.size, renderPadded(file.size))
        : encodePng(file.size, file.size, render(file.size).pixels);
    writeFileSync(join(icons, file.name), png);
    if (file.name === 'icon-512.png') writeFileSync(join(store, 'icon-512.png'), png);
    written.push(`${file.name} ${(png.length / 1024).toFixed(1)} kB`);
  }
  return written;
}

/** Android launcher icons, only when the platform folder exists. */
export function writeAndroidIcons() {
  const android = join(ROOT, 'android', 'app', 'src', 'main', 'res');
  if (!existsSync(android)) return [];
  const densities = [
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ];
  const written = [];
  for (const [name, size] of densities) {
    const dir = join(android, `mipmap-${name}`);
    mkdirSync(dir, { recursive: true });
    const square = encodePng(size, size, render(size).pixels);
    writeFileSync(join(dir, 'ic_launcher.png'), square);
    writeFileSync(join(dir, 'ic_launcher_round.png'), square);
    const fg = size * 2;
    writeFileSync(join(dir, 'ic_launcher_foreground.png'), encodePng(fg, fg, renderPadded(fg, 0.66)));
    written.push(`mipmap-${name}`);
  }
  return written;
}
