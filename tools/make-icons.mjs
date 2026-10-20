#!/usr/bin/env node
/**
 * Regenerates every icon from `brand/aegis-music-icon.png`.
 *
 *   npm run icons
 *
 * The artwork is the single source of truth; sizes are derived, never edited by
 * hand. Android mipmaps are refreshed only when `android/` has been generated
 * by Capacitor, so the same command is safe on a plain checkout.
 */
import { MASTER, writeAndroidIcons, writeIconSet } from './brand-icon.mjs';
import { existsSync } from 'node:fs';

if (!existsSync(MASTER)) {
  console.error(`missing master artwork: ${MASTER}`);
  process.exit(1);
}

for (const line of writeIconSet()) console.log(`icons/${line}`);

const android = writeAndroidIcons();
if (android.length > 0) console.log(`android: ${android.join(', ')}`);
else console.log('android: no platform folder, skipped');

console.log('done');
