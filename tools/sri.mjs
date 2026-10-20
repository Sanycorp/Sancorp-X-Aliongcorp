#!/usr/bin/env node
/**
 * Sub-resource integrity for the production build.
 *
 * Vite emits content-hashed filenames but no SRI. This walks dist/index.html,
 * computes sha384 over the exact bytes we ship for every module script and
 * stylesheet, and writes the integrity attribute back into the document.
 *
 * If a file is missing, the build fails: shipping an index.html that points at
 * a bundle we could not hash would silently disable the guarantee.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const indexPath = join(dist, 'index.html');

const hashFile = async (file) => {
  const bytes = await readFile(file);
  return `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
};

const strip = (href) => href.replace(/^\.?\//, '').split('?')[0].split('#')[0];

const resolveAsset = async (href) => {
  const rel = strip(href);
  const candidates = [join(dist, rel), join(dist, 'assets', rel.replace(/^assets\//, ''))];
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(`SRI: cannot find asset referenced by index.html → ${href}`);
};

const withIntegrity = (tag, attr, hash) => {
  let next = tag.replace(/\s+integrity="[^"]*"/gi, '').replace(/\s+crossorigin(="[^"]*")?/gi, '');
  next = next.replace(new RegExp(`(\\s${attr}="[^"]*")`, 'i'), `$1 integrity="${hash}" crossorigin="anonymous"`);
  return next;
};

let html = await readFile(indexPath, 'utf8');
const tags = html.match(/<(script|link)\b[^>]*>/gi) ?? [];
let hashed = 0;

for (const tag of tags) {
  const isModuleScript = /^<script/i.test(tag) && /\bsrc=/i.test(tag);
  const isStylesheet = /^<link/i.test(tag) && /rel="stylesheet"/i.test(tag);
  if (!isModuleScript && !isStylesheet) continue;

  const attr = isModuleScript ? 'src' : 'href';
  const match = tag.match(new RegExp(`\\s${attr}="([^"]+)"`, 'i'));
  if (!match) continue;
  const href = match[1];
  if (/^(https?:)?\/\//i.test(href)) continue; // never touch third-party tags

  const file = await resolveAsset(href);
  const hash = await hashFile(file);
  const replaced = withIntegrity(tag, attr, hash);
  html = html.replace(tag, replaced);
  hashed += 1;
}

await writeFile(indexPath, html);
console.log(`SRI: ${hashed} asset(s) signed with sha384`);
