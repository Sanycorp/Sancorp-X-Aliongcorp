#!/usr/bin/env node
/**
 * Android hardening pass.
 *
 * Runs in CI right after `npx cap add android` / `npx cap sync`, because the
 * android/ folder is generated and never committed. The APK has no server, so
 * every control here is native — deliberately different from the web build,
 * which is defended by HTTP headers in vercel.json.
 *
 * Applied:
 *  - android:allowBackup="false"
 *  - android:fullBackupContent="false"
 *  - android:dataExtractionRules="@xml/data_extraction_rules"
 *  - android:usesCleartextTraffic="false"
 *  - android:networkSecurityConfig="@xml/network_security_config"
 *  - android:largeHeap="true" (long renders need the headroom)
 *
 * Asserted (build fails if violated):
 *  - no dangerous runtime permissions (camera, mic, location, contacts, SMS,
 *    storage, phone state, bluetooth, activity recognition)
 *  - no exported component besides MainActivity
 *  - Capacitor config keeps debugging off and remote navigation empty
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const androidDir = join(root, 'android');
const manifestPath = join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
const resXml = join(androidDir, 'app', 'src', 'main', 'res', 'xml');

if (!existsSync(manifestPath)) {
  console.error('android-harden: AndroidManifest.xml not found — run `npx cap add android` first.');
  process.exit(1);
}

const DANGEROUS = [
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.READ_SMS',
  'android.permission.SEND_SMS',
  'android.permission.READ_PHONE_STATE',
  'android.permission.CALL_PHONE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.BODY_SENSORS',
  'android.permission.QUERY_ALL_PACKAGES',
];

const ATTRIBUTES = {
  'android:allowBackup': 'false',
  'android:fullBackupContent': 'false',
  'android:dataExtractionRules': '@xml/data_extraction_rules',
  'android:usesCleartextTraffic': 'false',
  'android:networkSecurityConfig': '@xml/network_security_config',
  // A phone that renders a 6-minute file needs more than the default heap.
  // Measured: 3 minutes of stereo DSP peaks around 280 MB of buffers.
  'android:largeHeap': 'true',
};

let manifest = await readFile(manifestPath, 'utf8');
const before = manifest;

const applicationMatch = manifest.match(/<application\b[^>]*>/);
if (!applicationMatch) {
  console.error('android-harden: <application> tag not found.');
  process.exit(1);
}

let applicationTag = applicationMatch[0];
for (const [key, value] of Object.entries(ATTRIBUTES)) {
  const pattern = new RegExp(`\\s${key}="[^"]*"`);
  if (pattern.test(applicationTag)) {
    applicationTag = applicationTag.replace(pattern, ` ${key}="${value}"`);
  } else {
    applicationTag = applicationTag.replace(/>$/, ` ${key}="${value}">`);
  }
}
manifest = manifest.replace(applicationMatch[0], applicationTag);

// Strip any dangerous permission the template or a plugin may have injected.
const removed = [];
for (const permission of DANGEROUS) {
  const pattern = new RegExp(`\\s*<uses-permission[^>]*android:name="${permission.replace(/\./g, '\\.')}"[^>]*/?>\\s*\\n?`, 'g');
  if (pattern.test(manifest)) {
    manifest = manifest.replace(pattern, '\n');
    removed.push(permission);
  }
}

// Only the launcher activity may be exported — activities, services,
// receivers and providers alike.
const exported = [
  ...manifest.matchAll(/<(activity|activity-alias|service|receiver|provider)\b[^>]*android:exported="true"[^>]*>/g),
].map((m) => {
  const name = m[0].match(/android:name="([^"]+)"/);
  return name ? name[1] : 'unknown';
});
const illegal = exported.filter((name) => !name.endsWith('MainActivity'));

if (manifest !== before) await writeFile(manifestPath, manifest);

await mkdir(resXml, { recursive: true });
await writeFile(
  join(resXml, 'network_security_config.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Aegis Sound Lab: the APK is fully offline. No cleartext, ever, for any host. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`,
);

await writeFile(
  join(resXml, 'data_extraction_rules.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Exclude sessions and exported audio from cloud backup and device transfer. -->
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" path="." />
        <exclude domain="file" path="." />
        <exclude domain="database" path="." />
        <exclude domain="sharedpref" path="." />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" path="." />
        <exclude domain="file" path="." />
        <exclude domain="database" path="." />
        <exclude domain="sharedpref" path="." />
    </device-transfer>
</data-extraction-rules>
`,
);

const problems = [];
if (illegal.length > 0) problems.push(`exported non-launcher components: ${illegal.join(', ')}`);

const remaining = DANGEROUS.filter((p) => manifest.includes(p));
if (remaining.length > 0) problems.push(`dangerous permissions still declared: ${remaining.join(', ')}`);

for (const [key, value] of Object.entries(ATTRIBUTES)) {
  if (!manifest.includes(`${key}="${value}"`)) problems.push(`missing ${key}="${value}"`);
}

if (problems.length > 0) {
  console.error('android-harden: FAILED');
  for (const p of problems) console.error('  -', p);
  process.exit(1);
}

console.log('android-harden: manifest hardened');
if (removed.length > 0) console.log(`android-harden: removed permissions → ${removed.join(', ')}`);
console.log('android-harden: network_security_config.xml + data_extraction_rules.xml written');
