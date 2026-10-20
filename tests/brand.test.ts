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
  it('renders the seal as vector with an accessible name', async () => {
    const { brandMark, brandPlate } = await import('../src/ui/brand');
    const mark = brandMark(30);
    expect(mark.className).toBe('brand__mark');
    const svg = mark.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toBe('Sanayacorp');
    expect(svg?.querySelector('title')?.textContent).toBe('Sanayacorp');
    expect(svg?.querySelector('.brand-seal__shield')).not.toBeNull();
    expect(svg?.querySelector('.brand-seal__letter')).not.toBeNull();

    const plate = brandPlate(64);
    expect(plate.className).toBe('brand-plate');
    expect(plate.querySelector('svg')?.getAttribute('width')).toBe('64');
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
