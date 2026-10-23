import { Capacitor, registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../security/platform';

/**
 * Background render, on Android only.
 *
 * The DSP runs in a web worker. What a phone needs on top of that is a process
 * Android refuses to freeze — a foreground service with a notification — and a
 * STOP button that reaches the webview even when the app is in the background.
 *
 * On the web every call is a no-op, so the same code path ships both places.
 */
interface AegisRenderPlugin {
  start(options: { text: string; progress: number }): Promise<{ running: boolean }>;
  update(options: { text: string; progress: number }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: 'stopRequested',
    listener: (payload: { source: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const plugin = registerPlugin<AegisRenderPlugin>('AegisRender');

export const backgroundRenderAvailable = (): boolean => isNativeApp();

let stopHandler: (() => void) | null = null;

/** Registers the one listener that turns the notification's STOP into a cancel. */
export async function onBackgroundStop(handler: () => void): Promise<void> {
  if (!backgroundRenderAvailable()) return;
  if (stopHandler) return;
  stopHandler = handler;
  try {
    await plugin.addListener('stopRequested', () => handler());
  } catch {
    // Older shell without the plugin: in-app cancel still works.
    stopHandler = null;
  }
}

export async function startRenderService(text: string): Promise<void> {
  if (!backgroundRenderAvailable() || Capacitor.getPlatform() !== 'android') return;
  try {
    await plugin.start({ text, progress: 0 });
  } catch {
    /* the render keeps going in the foreground */
  }
}

let lastText = '';
let lastPct = -1;
let lastAt = 0;

/**
 * Notification updates are rationed: one every 900 ms or every 5 points,
 * whichever comes first. Waking the notification manager on every DSP stage is
 * a battery drain with no benefit — the number on screen still moves.
 */
export async function updateRenderService(text: string, progress: number): Promise<void> {
  if (!backgroundRenderAvailable() || Capacitor.getPlatform() !== 'android') return;
  const pct = Math.round(progress * 100);
  const now = Date.now();
  if (text === lastText && Math.abs(pct - lastPct) < 5 && now - lastAt < 900) return;
  lastText = text;
  lastPct = pct;
  lastAt = now;
  try {
    await plugin.update({ text, progress: pct });
  } catch {
    /* ignore */
  }
}

export async function stopRenderService(): Promise<void> {
  if (!backgroundRenderAvailable() || Capacitor.getPlatform() !== 'android') return;
  lastText = '';
  lastPct = -1;
  try {
    await plugin.stop();
  } catch {
    /* ignore */
  }
}
