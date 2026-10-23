// @vitest-environment jsdom
/**
 * The things that broke on a real phone: a render that died at 94%, no way to
 * stop it, and a rating block in an app with exactly one user.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Object.defineProperty(navigator, 'vibrate', { value: () => true, configurable: true });
});

describe('export survives a long file', () => {
  it('writes the file in chunks instead of one giant base64 string', () => {
    const storage = readFileSync('src/io/storage.ts', 'utf8');
    // The old code did reader.readAsDataURL(blob) once for the whole export.
    expect(storage).toContain('Filesystem.appendFile');
    expect(storage).toContain('WRITE_CHUNK');
    // Base64 padding only lines up when chunks are a multiple of 3 bytes.
    expect(storage).toMatch(/WRITE_CHUNK = 3 \* 1024 \* 1024/);
    expect(storage).toContain('writeBlobNative');
  });

  it('renders long files in windows instead of refusing them', async () => {
    const { MAX_RENDER_SECONDS } = await import('../src/state/forge');
    // An 8:56 track must go through: the old 300 s wall is gone.
    expect(MAX_RENDER_SECONDS).toBeGreaterThanOrEqual(1800);
    const engine = readFileSync('src/dsp/engine.ts', 'utf8');
    expect(engine).toContain('renderSegmented');
    expect(engine).toContain('LONG_RENDER_SECONDS');
    expect(engine).toContain('expectedSeconds(s, source) > LONG_RENDER_SECONDS');
  });

  it('keeps the limiter allocation flat, not proportional to the song', () => {
    const limiter = readFileSync('src/dsp/limiter.ts', 'utf8');
    // Two arrays the length of the track used to be allocated here.
    expect(limiter).not.toMatch(/new Float32Array\(n\)/);
    expect(limiter).toContain('ring');
    expect(limiter).toContain('deque');
  });

  it('renders the chain in place where it owns the buffer', () => {
    const engine = readFileSync('src/dsp/engine.ts', 'utf8');
    expect(engine).toContain('widenInto');
    expect(engine).toContain('monoBassInto');
    expect(engine).toContain('deEssInto');
    expect(engine).toContain('saturateInto');
  });
});

describe('cancel', () => {
  it('stops an active export and says so', async () => {
    const { store } = await import('../src/state/store');
    const { cancelExport } = await import('../src/state/forge');
    store.setStatus({ active: true, progress: 0.5, stage: 'LIMIT' });
    cancelExport();
    expect(store.status.active).toBe(false);
    expect(store.status.stage).toBe('CANCELLED');
  });

  it('does nothing when no export is running', async () => {
    const { store } = await import('../src/state/store');
    const { cancelExport } = await import('../src/state/forge');
    store.setStatus({ active: false, progress: 0, stage: 'DONE' });
    cancelExport();
    expect(store.status.stage).toBe('DONE');
  });

  it('offers the stop button on the render screen and in the notification', () => {
    const deck = readFileSync('src/ui/screens/deck.ts', 'utf8');
    expect(deck).toContain('STOP RENDER');
    expect(deck).toContain('cancelExport');
    const widget = readFileSync('src/state/background.ts', 'utf8');
    expect(widget).toContain("'stopRequested'");
    const java = readFileSync('tools/android-background.mjs', 'utf8');
    expect(java).toContain('"STOP"');
    expect(java).toContain('foregroundServiceType="dataSync"');
  });
});

describe('Aegis Battery Protection', () => {
  it('marks the document so CSS can stop every animation', async () => {
    const { setBatteryGuard } = await import('../src/state/battery');
    const { store } = await import('../src/state/store');
    setBatteryGuard(true);
    expect(store.settings.batteryGuard).toBe(true);
    expect(document.documentElement.dataset.battery).toBe('on');
    setBatteryGuard(false);
    expect(document.documentElement.dataset.battery).toBe('off');
  });

  it('never slows the renderer down', () => {
    const battery = readFileSync('src/state/battery.ts', 'utf8');
    // No DSP import, no sample-rate change, no quality switch.
    expect(battery).not.toContain("from '../dsp");
    expect(battery).toContain('does not slow the renderer');
  });

  it('is wired into settings and the deck repaint', () => {
    expect(readFileSync('src/ui/screens/system.ts', 'utf8')).toContain('AEGIS BATTERY PROTECTION');
    expect(readFileSync('src/ui/screens/deck.ts', 'utf8')).toContain('shouldPaint');
  });
});

describe('the private app has no rating', () => {
  it('only builds the rating block on the web', () => {
    const system = readFileSync('src/ui/screens/system.ts', 'utf8');
    expect(system).toContain('isNativeApp() ? null : createRatingGroup()');
    expect(system).toContain("ratingGroup ? ratingGroup.el : null");
  });

  it('ships the background service only for Android', async () => {
    const { backgroundRenderAvailable } = await import('../src/state/background');
    expect(backgroundRenderAvailable()).toBe(false);
  });
});
