#!/usr/bin/env node
/**
 * Generates the AEGIS-M icon set with zero dependencies.
 * Draws at 1024² with 2× supersampling, then box-filters down to each size and
 * writes PNGs with Node's zlib. Run: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');
const STORE = join(ROOT, 'store');

const SS = 2;
const BASE = 1024 * SS;

// ---------------------------------------------------------------- PNG writer
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- pixels
const canvas = Buffer.alloc(BASE * BASE * 4);

function put(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= BASE || y >= BASE) return;
  const i = (y * BASE + x) * 4;
  if (a >= 255) {
    canvas[i] = r;
    canvas[i + 1] = g;
    canvas[i + 2] = b;
    canvas[i + 3] = 255;
    return;
  }
  const t = a / 255;
  canvas[i] = Math.round(canvas[i] * (1 - t) + r * t);
  canvas[i + 1] = Math.round(canvas[i + 1] * (1 - t) + g * t);
  canvas[i + 2] = Math.round(canvas[i + 2] * (1 - t) + b * t);
  canvas[i + 3] = Math.max(canvas[i + 3], a);
}

function fillRect(x0, y0, w, h, [r, g, b], alpha = 255) {
  const xs = Math.round(x0 * BASE);
  const ys = Math.round(y0 * BASE);
  const xe = Math.round((x0 + w) * BASE);
  const ye = Math.round((y0 + h) * BASE);
  for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) put(x, y, r, g, b, alpha);
}

/** Distance from a point to a segment. */
function sdSegment(px, py, ax, ay, bx, by) {
  const ex = bx - ax;
  const ey = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len = ex * ex + ey * ey || 1;
  const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / len));
  return Math.hypot(wx - ex * t, wy - ey * t);
}

/** Even-odd point-in-polygon (works for concave shapes). */
function insidePoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance to the polygon outline. */
function edgeDist(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    d = Math.min(d, sdSegment(px, py, ax, ay, bx, by));
  }
  return d;
}

function fillPoly(pts, color, alpha = 255) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const xs = Math.max(0, Math.floor(minX * BASE));
  const ys = Math.max(0, Math.floor(minY * BASE));
  const xe = Math.min(BASE - 1, Math.ceil(maxX * BASE));
  const ye = Math.min(BASE - 1, Math.ceil(maxY * BASE));
  for (let y = ys; y <= ye; y++) {
    for (let x = xs; x <= xe; x++) {
      if (insidePoly(x / BASE, y / BASE, pts)) put(x, y, color[0], color[1], color[2], alpha);
    }
  }
}

/** Thick outline of an open polyline. */
function strokeLine(pts, widthPx, color) {
  const half = widthPx / 2 / BASE;
  for (let y = 0; y < BASE; y++) {
    for (let x = 0; x < BASE; x++) {
      const px = x / BASE;
      const py = y / BASE;
      let d = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        d = Math.min(d, sdSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
      }
      if (d <= half) put(x, y, color[0], color[1], color[2], 255);
    }
  }
}

/** Closed outline of a polygon (inner + outer edge). */
function strokePoly(pts, widthPx, color) {
  const half = widthPx / 2 / BASE;
  for (let y = 0; y < BASE; y++) {
    for (let x = 0; x < BASE; x++) {
      const d = edgeDist(x / BASE, y / BASE, pts);
      if (d <= half) put(x, y, color[0], color[1], color[2], 255);
    }
  }
}

// ---------------------------------------------------------------- artwork
const NAVY = [7, 14, 30];
const COBALT = [11, 79, 214];
const COBALT_HI = [61, 123, 255];
const CRIMSON = [217, 30, 43];
const WHITE = [232, 236, 243];

// background: deep navy with a cobalt diagonal glow
for (let y = 0; y < BASE; y++) {
  for (let x = 0; x < BASE; x++) {
    const u = x / BASE;
    const v = y / BASE;
    const glow = Math.max(0, 1 - Math.hypot(u - 0.18, v - 0.12) * 1.35);
    const r = Math.round(NAVY[0] + (COBALT[0] - NAVY[0]) * glow * 0.85);
    const g = Math.round(NAVY[1] + (COBALT[1] - NAVY[1]) * glow * 0.85);
    const b = Math.round(NAVY[2] + (COBALT[2] - NAVY[2]) * glow * 0.85);
    put(x, y, r, g, b, 255);
  }
}

// HUD grid
for (let i = 0; i <= 16; i++) {
  const p = i / 16;
  fillRect(0, p, 1, 1 / BASE, WHITE, 10);
  fillRect(p, 0, 1 / BASE, 1, WHITE, 10);
}

// shield
const SHIELD = [
  [0.5, 0.1],
  [0.86, 0.26],
  [0.86, 0.6],
  [0.5, 0.9],
  [0.14, 0.6],
  [0.14, 0.26],
];
fillPoly(SHIELD, NAVY, 255);
strokePoly(SHIELD, 22 * SS, COBALT_HI);

// inner hairline
const INNER = SHIELD.map(([x, y]) => [0.5 + (x - 0.5) * 0.88, 0.5 + (y - 0.5) * 0.88]);
strokePoly(INNER, 4 * SS, WHITE);

// crimson chevron under the monogram
strokeLine(
  [
    [0.31, 0.66],
    [0.5, 0.75],
    [0.69, 0.66],
  ],
  20 * SS,
  CRIMSON,
);
// small diamond bolt at the shield tip
fillPoly(
  [
    [0.5, 0.565],
    [0.532, 0.615],
    [0.5, 0.665],
    [0.468, 0.615],
  ],
  CRIMSON,
);

// "E/T" monogram (blocky, mecha stencil)
const GLYPH = [
  { x: 0.27, y: 0.3, w: 0.1, h: 0.03 },
  { x: 0.27, y: 0.3, w: 0.03, h: 0.15 },
  { x: 0.27, y: 0.36, w: 0.08, h: 0.03 },
  { x: 0.27, y: 0.42, w: 0.1, h: 0.03 },
  // slash
  { x: 0.45, y: 0.31, w: 0.035, h: 0.05 },
  { x: 0.435, y: 0.36, w: 0.035, h: 0.05 },
  { x: 0.42, y: 0.41, w: 0.035, h: 0.05 },
  // T
  { x: 0.55, y: 0.3, w: 0.16, h: 0.03 },
  { x: 0.615, y: 0.3, w: 0.03, h: 0.15 },
];
for (const g of GLYPH) fillRect(g.x, g.y, g.w, g.h, WHITE);

// corner crop marks
fillRect(0.06, 0.06, 0.1, 0.006, COBALT_HI);
fillRect(0.06, 0.06, 0.006, 0.1, COBALT_HI);
fillRect(0.84, 0.9, 0.1, 0.006, CRIMSON);
fillRect(0.94, 0.8, 0.006, 0.1, CRIMSON);

// ---------------------------------------------------------------- downsample
function resize(size) {
  const out = Buffer.alloc(size * size * 4);
  const scale = BASE / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      const sx = Math.floor(x * scale);
      const sy = Math.floor(y * scale);
      const step = Math.max(1, Math.floor(scale));
      for (let yy = 0; yy < step; yy++) {
        for (let xx = 0; xx < step; xx++) {
          const i = ((sy + yy) * BASE + (sx + xx)) * 4;
          r += canvas[i];
          g += canvas[i + 1];
          b += canvas[i + 2];
          a += canvas[i + 3];
          n++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

mkdirSync(OUT, { recursive: true });

const targets = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-maskable-512.png', pad: true },
  { size: 64, name: 'favicon-64.png' },
];

for (const t of targets) {
  let pixels = resize(t.size);
  if (t.pad) {
    // Maskable icons need a 20% safe margin: draw the art at 80% on a flat field.
    const inner = Math.round(t.size * 0.8);
    const src = resize(inner);
    pixels = Buffer.alloc(t.size * t.size * 4);
    const off = Math.round((t.size - inner) / 2);
    for (let y = 0; y < t.size; y++) {
      for (let x = 0; x < t.size; x++) {
        const o = (y * t.size + x) * 4;
        const inside = x >= off && y >= off && x < off + inner && y < off + inner;
        if (inside) {
          const si = ((y - off) * inner + (x - off)) * 4;
          pixels[o] = src[si];
          pixels[o + 1] = src[si + 1];
          pixels[o + 2] = src[si + 2];
          pixels[o + 3] = 255;
        } else {
          pixels[o] = NAVY[0];
          pixels[o + 1] = NAVY[1];
          pixels[o + 2] = NAVY[2];
          pixels[o + 3] = 255;
        }
      }
    }
  }
  const png = encodePng(t.size, t.size, pixels);
  writeFileSync(join(OUT, t.name), png);
  if (t.name === 'icon-512.png') {
    mkdirSync(STORE, { recursive: true });
    writeFileSync(join(STORE, 'icon-512.png'), png);
  }
  console.log(`icons/${t.name}  ${t.size}×${t.size}  ${(png.length / 1024).toFixed(1)} kB`);
}

// ---------------------------------------------------------------- android
// If a Capacitor android/ project exists, refresh the launcher icons too.
const ANDROID = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const densities = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

if (existsSync(ANDROID)) {
  for (const [name, size] of densities) {
    const dir = join(ANDROID, `mipmap-${name}`);
    mkdirSync(dir, { recursive: true });
    const png = encodePng(size, size, resize(size));
    writeFileSync(join(dir, 'ic_launcher.png'), png);
    writeFileSync(join(dir, 'ic_launcher_round.png'), png);
    // Adaptive foreground: 108dp canvas, art at 66% with transparent padding.
    const fg = size * 2;
    const inner = Math.round(fg * 0.66);
    const art = resize(inner);
    const pixels = Buffer.alloc(fg * fg * 4);
    const off = Math.round((fg - inner) / 2);
    for (let y = 0; y < fg; y++) {
      for (let x = 0; x < fg; x++) {
        const o = (y * fg + x) * 4;
        const inside = x >= off && y >= off && x < off + inner && y < off + inner;
        if (inside) {
          const si = ((y - off) * inner + (x - off)) * 4;
          pixels[o] = art[si];
          pixels[o + 1] = art[si + 1];
          pixels[o + 2] = art[si + 2];
          pixels[o + 3] = 255;
        } else {
          pixels[o] = 0;
          pixels[o + 1] = 0;
          pixels[o + 2] = 0;
          pixels[o + 3] = 0;
        }
      }
    }
    writeFileSync(join(dir, 'ic_launcher_foreground.png'), encodePng(fg, fg, pixels));
  }
  console.log('android mipmaps refreshed');
}

console.log('done');
