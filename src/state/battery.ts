import { store } from './store';

/**
 * AEGIS BATTERY PROTECTION.
 *
 * One switch, three honest effects — and none of them touch the DSP:
 *
 *  1. `html[data-battery="on"]` stops every decorative animation and the
 *     aurora/grain layers from repainting. CSS does the work, so the GPU idles.
 *  2. The scope and the meters stop drawing while a render is running; the
 *     numbers still update, just on a 1 s tick instead of 60 frames.
 *  3. Background renders keep working: the foreground service already protects
 *     the process, so battery protection never means "cancel my render".
 *
 * It does not slow the renderer down. Making the DSP cheaper would change the
 * output, and a master that depends on the battery level is a bug, not a mode.
 */
export const batteryGuardOn = (): boolean => store.settings.batteryGuard;

export function setBatteryGuard(on: boolean): void {
  store.patchSettings({ batteryGuard: on });
  applyBatteryGuard();
}

/** Mirrors the setting onto <html> so CSS can react without a re-render. */
export function applyBatteryGuard(): void {
  document.documentElement.dataset.battery = batteryGuardOn() ? 'on' : 'off';
}

/**
 * Frames are rationed during a render: with battery protection on, the deck
 * repaints the progress bar at most once a second instead of on every stage.
 */
let lastPaint = 0;
export function shouldPaint(now = Date.now()): boolean {
  if (!batteryGuardOn()) return true;
  if (now - lastPaint < 1000) return false;
  lastPaint = now;
  return true;
}
