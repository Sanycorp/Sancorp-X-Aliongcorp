#!/usr/bin/env node
/**
 * Rewrites `api/_lib/revoked.js` from an operator input.
 *
 * Run by the `revoke` workflow. Keeping the deny list in the repository means
 * every revocation is dated, attributed and reversible with a normal revert —
 * the same audit trail as the rest of the product, and no database to keep
 * alive for a handful of serials.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'api/_lib/revoked.js';
const MODE = (process.env.MODE || 'add').trim().toLowerCase();

if (!['add', 'replace', 'clear'].includes(MODE)) {
  console.error(`unknown mode: ${MODE}`);
  process.exit(1);
}

const requested = String(process.env.SERIALS || '')
  .toUpperCase()
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

const invalid = requested.filter((s) => !/^[A-Z0-9]{4}$/.test(s));
if (invalid.length > 0) {
  console.error(`serial harus 4 karakter A–Z / 0–9: ${invalid.join(', ')}`);
  process.exit(1);
}

function currentSerials() {
  const source = readFileSync(FILE, 'utf8');
  const match = source.match(/export const REVOKED = (\[[\s\S]*?\]);/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed.map((s) => String(s).toUpperCase()) : [];
  } catch {
    return [];
  }
}

const before = MODE === 'clear' || MODE === 'replace' ? [] : currentSerials();
const next = [...new Set([...before, ...requested])].sort();

const body = `/**
 * Revoked licence serials, checked on every session read.
 *
 * Updated by the \`revoke\` workflow — edit through that workflow rather than by
 * hand so the change carries who, when and why. A serial here stops working on
 * the next request even though its signature is still valid.
 */
export const REVOKED = ${JSON.stringify(next, null, 2)};
`;

writeFileSync(FILE, body);
console.log(`revoke ${MODE}: ${before.length} → ${next.length} serial`);
