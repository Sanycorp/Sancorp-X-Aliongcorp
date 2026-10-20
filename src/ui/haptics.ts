import { Capacitor } from '@capacitor/core';
import { Haptics as NativeHaptics, ImpactStyle } from '@capacitor/haptics';
import { store } from '../state/store';

/**
 * Haptics: native Taptic/Impact on Android & iOS, `navigator.vibrate` on the
 * web. Every call is a no-op when the user turned haptics off.
 */
const enabled = (): boolean => store.settings.haptics;

function vibrate(pattern: number | number[]): void {
  if (!enabled()) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // some WebViews disable vibration silently
    }
  }
}

export const Haptics = {
  tap(): void {
    if (!enabled()) return;
    if (Capacitor.isNativePlatform()) {
      void NativeHaptics.selectionChanged().catch(() => undefined);
    } else {
      vibrate(8);
    }
  },
  medium(): void {
    if (!enabled()) return;
    if (Capacitor.isNativePlatform()) {
      void NativeHaptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
    } else {
      vibrate(18);
    }
  },
  heavy(): void {
    if (!enabled()) return;
    if (Capacitor.isNativePlatform()) {
      void NativeHaptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
    } else {
      vibrate([24, 30, 24]);
    }
  },
  success(): void {
    if (!enabled()) return;
    if (Capacitor.isNativePlatform()) {
      void NativeHaptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    } else {
      vibrate([10, 40, 16]);
    }
  },
  error(): void {
    if (!enabled()) return;
    if (Capacitor.isNativePlatform()) {
      void NativeHaptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
    } else {
      vibrate([40, 60, 40]);
    }
  },
};
