// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FORM_LABELS, PLATFORM_LABELS, detectPlatform, readEnvironment } from '../src/model/platform';
import type { PlatformEnv } from '../src/model/platform';

const ROOT = process.cwd();

const base: PlatformEnv = {
  userAgent: '',
  platform: '',
  maxTouchPoints: 0,
  cores: 8,
  memory: 8,
  width: 1440,
  supports: () => true,
  hasAudioContext: true,
  hasWorker: true,
  hasVibrate: true,
};

const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const MAC_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0';

describe('device detection', () => {
  it('recognises an Android phone', () => {
    const info = detectPlatform({ ...base, userAgent: ANDROID_PHONE, maxTouchPoints: 5, width: 412 });
    expect(info.form).toBe('phone');
    expect(info.os).toBe('android');
    expect(info.engine).toBe('blink');
    expect(info.touch).toBe(true);
  });

  it('recognises an iPhone on WebKit', () => {
    const info = detectPlatform({ ...base, userAgent: IPHONE, maxTouchPoints: 5, width: 390 });
    expect(info.os).toBe('ios');
    expect(info.form).toBe('phone');
    expect(info.engine).toBe('webkit');
  });

  it('treats iPadOS as a tablet, not a Mac', () => {
    // iPadOS 13+ sends a desktop Mac user agent; only the touch points reveal it.
    const info = detectPlatform({ ...base, userAgent: IPAD, maxTouchPoints: 5, width: 1024 });
    expect(info.os).toBe('ipados');
    expect(info.form).toBe('tablet');
  });

  it('keeps a desktop a desktop even at phone width', () => {
    const info = detectPlatform({ ...base, userAgent: WINDOWS, maxTouchPoints: 0, width: 420 });
    expect(info.form).toBe('desktop');
    expect(info.os).toBe('windows');
    expect(info.touch).toBe(false);
  });

  it('names Firefox and Chrome engines correctly', () => {
    expect(detectPlatform({ ...base, userAgent: MAC_FIREFOX }).engine).toBe('gecko');
    expect(detectPlatform({ ...base, userAgent: WINDOWS }).engine).toBe('blink');
  });

  it('drops decoration on a slow device, never the audio', () => {
    const lite = detectPlatform({ ...base, userAgent: ANDROID_PHONE, maxTouchPoints: 5, cores: 4, memory: 2 });
    expect(lite.perf).toBe('lite');
    expect(lite.capabilities.audio).toBe(true);

    const saveData = detectPlatform({ ...base, saveData: true });
    expect(saveData.perf).toBe('lite');

    const full = detectPlatform({ ...base, cores: 8, memory: 8 });
    expect(full.perf).toBe('full');
  });

  it('reports missing capabilities instead of assuming them', () => {
    const poor = detectPlatform({
      ...base,
      userAgent: ANDROID_PHONE,
      supports: () => false,
      hasAudioContext: false,
      canShare: false,
    });
    expect(poor.capabilities.audio).toBe(false);
    expect(poor.capabilities.share).toBe(false);
    expect(poor.capabilities.dvh).toBe(false);
    expect(poor.capabilities.blur).toBe(false);
  });

  it('has a label for every enum value', () => {
    for (const os of ['ios', 'ipados', 'android', 'windows', 'macos', 'chromeos', 'linux', 'other'] as const) {
      expect(PLATFORM_LABELS[os]).toBeTruthy();
    }
    for (const form of ['phone', 'tablet', 'desktop'] as const) expect(FORM_LABELS[form]).toBeTruthy();
  });

  it('reads the real environment without throwing outside a browser', () => {
    expect(() => readEnvironment()).not.toThrow();
    const info = detectPlatform(readEnvironment());
    expect(['phone', 'tablet', 'desktop']).toContain(info.form);
  });
});

describe('the stylesheet consumes what the platform module writes', () => {
  const css = readFileSync(join(ROOT, 'src/styles/adaptive.css'), 'utf8');
  const main = readFileSync(join(ROOT, 'src/main.ts'), 'utf8');
  const platform = readFileSync(join(ROOT, 'src/model/platform.ts'), 'utf8');

  it('is imported by the app', () => {
    expect(main).toContain("import './styles/adaptive.css'");
    expect(main).toContain('bootPlatform()');
  });

  it('writes every attribute the stylesheet reads', () => {
    for (const attr of ['data-form', 'data-os', 'data-input', 'data-perf', 'data-standalone']) {
      expect(platform).toContain(`dataset.${attr.replace('data-', '')}`);
    }
    for (const attr of ['data-form', 'data-os', 'data-input', 'data-perf', 'data-standalone', 'data-no-dvh', 'data-no-blur']) {
      expect(css).toContain(attr);
    }
  });

  it('handles the phone-specific hazards', () => {
    // iOS zooms any field under 16px; touch targets need 44px; 100vh jumps when
    // the URL bar appears.
    expect(css).toMatch(/-webkit-touch-callout: none[\s\S]*?font-size: max\(16px, 1em\)/);
    expect(css).toMatch(/@media \(pointer: coarse\)[\s\S]*?min-height: 44px/);
    expect(css).toMatch(/data-no-dvh/);
    expect(css).toContain('-webkit-text-size-adjust: 100%');
    expect(css).toContain('env(safe-area-inset-bottom)');
  });

  it('has a cheap mode that keeps the audio path untouched', () => {
    expect(css).toMatch(/html\[data-perf='lite'\] \.plate/);
    expect(css).toContain('backdrop-filter: none');
    // Nothing in the cheap mode may touch canvas, audio or the engine.
    const liteBlock = css.split("html[data-perf='lite']")[1] ?? '';
    expect(liteBlock).not.toContain('canvas');
  });
});

describe('the gate is mandatory', () => {
  const gate = readFileSync(join(ROOT, 'src/ui/gate.ts'), 'utf8');
  const main = readFileSync(join(ROOT, 'src/main.ts'), 'utf8');

  it('offers no way past the account', () => {
    expect(gate).not.toContain('LANJUT TANPA AKUN');
    expect(gate).not.toContain('continue without');
    // No click-outside dismissal and no Escape dismissal.
    expect(gate).not.toMatch(/ev\.target === gate/);
    expect(gate).toMatch(/ev\.key === 'Escape'[\s\S]{0,120}preventDefault/);
  });

  it('is opened whenever there is no session, not only on the first visit', () => {
    expect(main).not.toContain('gateSeen');
    expect(main).toMatch(/session\.signedIn\) closeGate\(\);\s*else openGate\(/);
  });

  it('makes the shell behind it inert', () => {
    expect(gate).toContain("setAttribute('inert'");
    expect(gate).toContain('gate-open');
  });

  it('leaves the operator console as the only exception', () => {
    expect(main).toMatch(/activeRoute === 'control'[\s\S]{0,80}closeGate\(\)/);
  });

  it('blocks keyboard shortcuts while it is up', () => {
    expect(main).toMatch(/if \(gateOpen\(\)\) return;/);
  });
});
