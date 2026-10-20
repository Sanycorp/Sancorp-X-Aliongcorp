import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The android/ folder is generated in CI, so the hardening script is the only
 * thing that guarantees the APK differs from the web build in the right ways.
 * These tests run it against a synthetic Capacitor manifest.
 */

const script = resolve(process.cwd(), 'tools/android-harden.mjs');
const dirs: string[] = [];

const TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <application
        android:allowBackup="true"
        android:label="@string/app_name">
        <activity
            android:name=".MainActivity"
            android:exported="true">
        </activity>
        <service android:name=".LeakyService" android:exported="true" />
    </application>
</manifest>
`;

function workspace(manifest = TEMPLATE): string {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-android-'));
  dirs.push(dir);
  const main = join(dir, 'android', 'app', 'src', 'main');
  mkdirSync(main, { recursive: true });
  writeFileSync(join(main, 'AndroidManifest.xml'), manifest);
  return dir;
}

function run(dir: string): { ok: boolean; out: string } {
  try {
    const out = execFileSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, out };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('android hardening', () => {
  it('refuses a template that exports more than the launcher', () => {
    const dir = workspace();
    const result = run(dir);
    expect(result.ok).toBe(false);
    expect(result.out).toContain('LeakyService');
  });

  it('keeps INTERNET but removes dangerous permissions', () => {
    const dir = workspace(TEMPLATE.replace('<service android:name=".LeakyService" android:exported="true" />', ''));
    const result = run(dir);
    expect(result.ok).toBe(true);
    const manifest = readFileSync(join(dir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('android.permission.INTERNET');
    expect(manifest).not.toContain('android.permission.CAMERA');
  });

  it('writes the offline network and backup policies', () => {
    const dir = workspace(TEMPLATE.replace('<service android:name=".LeakyService" android:exported="true" />', ''));
    expect(run(dir).ok).toBe(true);
    const manifest = readFileSync(join(dir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).toContain('android:networkSecurityConfig="@xml/network_security_config"');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');

    const xml = join(dir, 'android', 'app', 'src', 'main', 'res', 'xml');
    const net = readFileSync(join(xml, 'network_security_config.xml'), 'utf8');
    expect(net).toContain('cleartextTrafficPermitted="false"');

    const backup = readFileSync(join(xml, 'data_extraction_rules.xml'), 'utf8');
    expect(backup).toContain('<cloud-backup>');
    expect(backup).toContain('<device-transfer>');
  });

  it('is idempotent — a second pass changes nothing', () => {
    const dir = workspace(TEMPLATE.replace('<service android:name=".LeakyService" android:exported="true" />', ''));
    expect(run(dir).ok).toBe(true);
    const first = readFileSync(join(dir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    expect(run(dir).ok).toBe(true);
    const second = readFileSync(join(dir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    expect(second).toBe(first);
  });
});

describe('capacitor config keeps the app offline', () => {
  const config = readFileSync(resolve(process.cwd(), 'capacitor.config.ts'), 'utf8');

  it('disables remote navigation and cleartext', () => {
    expect(config).toContain('allowNavigation: []');
    expect(config).toContain('cleartext: false');
  });

  it('disables debugging and mixed content', () => {
    expect(config).toContain('webContentsDebuggingEnabled: false');
    expect(config).toContain('allowMixedContent: false');
  });
});
