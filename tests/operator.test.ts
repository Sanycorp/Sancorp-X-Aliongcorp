// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { parseOperatorKey, scrubOperatorKey } from '../src/state/operatorKey';

describe('operator link', () => {
  it('reads the key out of the console hash', () => {
    expect(parseOperatorKey('#/control?op=AEGIS-T867GT-1KHQVN-93SWHC-2GZCFP')).toBe(
      'AEGIS-T867GT-1KHQVN-93SWHC-2GZCFP',
    );
    expect(parseOperatorKey('#/control?key=AEGIS-TEST-KEY-0001')).toBe('AEGIS-TEST-KEY-0001');
  });

  it('ignores a hash without a key, or with junk in it', () => {
    expect(parseOperatorKey('#/control')).toBeNull();
    expect(parseOperatorKey('#/deck?op=AEGIS-TEST-KEY-0001')).toBeNull();
    expect(parseOperatorKey('#/control?op=')).toBeNull();
    expect(parseOperatorKey('#/control?op=short')).toBeNull();
    expect(parseOperatorKey('#/control?op=<script>alert(1)</script>')).toBeNull();
    expect(parseOperatorKey('#/control?op=AEGIS-OK-0001&x=%20')).toBe('AEGIS-OK-0001');
  });

  it('erases the key from the address bar without leaving history', () => {
    history.replaceState(null, '', '/#/control?op=AEGIS-T867GT-1KHQVN-93SWHC-2GZCFP');
    const before = history.length;

    expect(scrubOperatorKey()).toBe(true);

    expect(location.hash).toBe('#/control');
    expect(decodeURIComponent(location.href)).not.toContain('AEGIS-');
    expect(history.length).toBe(before);
  });

  it('leaves an ordinary hash alone', () => {
    history.replaceState(null, '', '/#/control');
    expect(scrubOperatorKey()).toBe(false);
    expect(location.hash).toBe('#/control');
  });
});

describe('operator key on the server', () => {
  beforeEach(() => {
    process.env.AEGIS_ADMIN_PASSWORD = 'AEGIS-T867GT-1KHQVN-93SWHC-2GZCFP';
  });

  it('accepts the generated key exactly as issued', async () => {
    const { adminPasswordMatches } = await import('../api/_lib/auth.js');
    expect(adminPasswordMatches('AEGIS-T867GT-1KHQVN-93SWHC-2GZCFP')).toBe(true);
  });

  it('survives a lower-cased paste and stray whitespace', async () => {
    const { adminPasswordMatches } = await import('../api/_lib/auth.js');
    expect(adminPasswordMatches('  aegis-t867gt-1khqvn-93swhc-2gzcfp \n')).toBe(true);
  });

  it('rejects a near miss of any length', async () => {
    const { adminPasswordMatches } = await import('../api/_lib/auth.js');
    expect(adminPasswordMatches('AEGIS-T867GT-1KHQVN-93SWHC-2GZCFQ')).toBe(false);
    expect(adminPasswordMatches('AEGIS-T867GT-1KHQVN-93SWHC-2GZCF')).toBe(false);
    expect(adminPasswordMatches('')).toBe(false);
    expect(adminPasswordMatches(undefined)).toBe(false);
  });
});
