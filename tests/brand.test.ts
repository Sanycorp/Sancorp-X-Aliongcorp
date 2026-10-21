// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, render, renderPadded } from '../tools/brand-icon.mjs';

const ROOT = process.cwd();
const FIELD = [0xe8, 0xec, 0xf3];

function png(rel: string) {
  return decodePng(readFileSync(join(ROOT, rel)));
}

function pixelAt(image: { width: number; channels: number; pixels: Buffer }, x: number, y: number) {
  const i = (y * image.width + x) * image.channels;
  return [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]];
}

describe('png plumbing', () => {
  it('round-trips RGBA pixels through the encoder and decoder', () => {
    const width = 4;
    const height = 3;
    const pixels = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      pixels[i * 4] = i * 7;
      pixels[i * 4 + 1] = 255 - i;
      pixels[i * 4 + 2] = 128;
      pixels[i * 4 + 3] = 255;
    }
    const back = decodePng(encodePng(width, height, pixels));
    expect(back.width).toBe(width);
    expect(back.channels).toBe(4);
    expect(Buffer.compare(back.pixels, pixels)).toBe(0);
  });
});

describe('icon set', () => {
  it('ships every size the manifest and the browser ask for', () => {
    const expected: [string, number][] = [
      ['public/icons/icon-512.png', 512],
      ['public/icons/icon-192.png', 192],
      ['public/icons/icon-maskable-512.png', 512],
      ['public/icons/favicon-64.png', 64],
      ['store/icon-512.png', 512],
    ];
    for (const [rel, size] of expected) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(true);
      const image = png(rel);
      expect(image.width, rel).toBe(size);
      expect(image.height, rel).toBe(size);
    }
  });

  it('paints the flat field, not the master paper grain', () => {
    for (const rel of ['public/icons/icon-512.png', 'public/icons/favicon-64.png']) {
      const image = png(rel);
      for (const [x, y] of [
        [2, 2],
        [image.width - 3, 2],
        [2, image.height - 3],
      ]) {
        const [r, g, b] = pixelAt(image, x, y);
        expect([r, g, b], `${rel} ${x},${y}`).toEqual(FIELD);
      }
    }
  });

  it('keeps the artwork inside the maskable safe area', () => {
    const image = png('public/icons/icon-maskable-512.png');
    // A 10% ring must stay flat: Android crops heavily on round launchers.
    const ring = Math.round(image.width * 0.09);
    for (let y = 0; y < image.height; y += 7) {
      for (const x of [0, ring - 1, image.width - ring, image.width - 1]) {
        const [r, g, b] = pixelAt(image, x, y);
        expect([r, g, b]).toEqual(FIELD);
      }
    }
  });

  it('renders ink where the seal is, so the icon is not blank', () => {
    const image = png('public/icons/icon-512.png');
    let dark = 0;
    for (let i = 0; i < image.pixels.length; i += 4) {
      if (image.pixels[i] < 60 && image.pixels[i + 1] < 60 && image.pixels[i + 2] < 70) dark += 1;
    }
    const share = dark / (image.width * image.height);
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.6);
  });

  it('pads a small render on the same field colour', () => {
    const pixels = renderPadded(64, 0.78);
    expect(pixels.length).toBe(64 * 64 * 4);
    const corner = [pixels[0], pixels[1], pixels[2]];
    expect(corner).toEqual(FIELD);
    const centre = ((32 * 64 + 32) * 4);
    const centreIsField =
      pixels[centre] === FIELD[0] && pixels[centre + 1] === FIELD[1] && pixels[centre + 2] === FIELD[2];
    expect(centreIsField).toBe(false);
  });

  it('scales down without changing the average brightness much', () => {
    const mean = (pixels: Buffer) => {
      let total = 0;
      for (let i = 0; i < pixels.length; i += 4) total += pixels[i];
      return total / (pixels.length / 4);
    };
    const big = render(256).pixels;
    const small = render(64).pixels;
    expect(Math.abs(mean(big) - mean(small))).toBeLessThan(6);
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8'));

  it('names the product, not the company', () => {
    expect(manifest.name).toContain('Aegis Sound Lab');
    expect(manifest.short_name).toBe('Aegis Sound');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it('points at icons that exist', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(join(ROOT, 'public', icon.src)), icon.src).toBe(true);
      expect(icon.src).not.toMatch(/^\//);
    }
  });

  it('keeps the operator shortcut out of the tab bar but in the manifest', () => {
    const shortcuts = manifest.shortcuts.map((s: { url: string }) => s.url);
    expect(shortcuts.some((url: string) => url.includes('#/control'))).toBe(true);
  });
});

describe('brand mark', () => {
  it('renders the seal as vector, decorative next to the wordmark', async () => {
    const { brandMark } = await import('../src/ui/brand');
    const mark = brandMark(30);
    expect(mark.className).toBe('brand__mark');
    // The name is already written next to it; a second "Sanayacorp" would be
    // read out twice by a screen reader.
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    const svg = mark.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
    expect(svg?.querySelector('title')).toBeNull();
    expect(svg?.querySelector('.brand-seal__shield')).not.toBeNull();
    expect(svg?.querySelector('.brand-seal__letter')).not.toBeNull();
  });

  it('keeps the company mark out of the pages and in the browser chrome', async () => {
    // The seal is the tab icon, the installed icon and the header mark. Rendering
    // it again as a plate inside TENTANG was the thing the owner asked to drop.
    const screen = readFileSync(join(ROOT, 'src/ui/screens/system.ts'), 'utf8');
    expect(screen).not.toContain('brand-block');
    expect(screen).not.toContain('brandPlate');

    const head = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(head).toContain('rel="icon" type="image/svg+xml" href="/icons/seal.svg"');
    expect(head).toContain('rel="mask-icon" href="/icons/seal.svg"');
    expect(head).toContain('property="og:image" content="https://sanayacorp-aegismusic.vercel.app/icons/icon-512.png"');
  });

  it('ships the vector tab icon the head refers to', () => {
    const file = join(ROOT, 'public/icons/seal.svg');
    expect(existsSync(file)).toBe(true);
    const svg = readFileSync(file, 'utf8');
    expect(svg).toContain('viewBox="0 0 44 48"');
    expect(svg).toContain('<title>Sanayacorp</title>');
    expect(svg).toContain('aria-label="Sanayacorp"');
    // Same four shapes as the vector mark in the header: field, shield, wires, S.
    expect(svg.match(/<path /g)?.length).toBe(4);
    expect(readFileSync(join(ROOT, 'public/sw.js'), 'utf8')).toContain("'./icons/seal.svg'");
  });

  it('gives every instance its own gradient id so the two marks do not collide', async () => {
    const { brandMark } = await import('../src/ui/brand');
    const a = brandMark().querySelector('linearGradient')?.id;
    const b = brandMark().querySelector('linearGradient')?.id;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
