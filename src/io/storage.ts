import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { EncodedAudio } from './encode';

export const IS_NATIVE = Capacitor.isNativePlatform();

export interface SavedExport {
  name: string;
  /** Path or content URI, when the platform exposes one. */
  uri: string | null;
  where: 'documents' | 'cache' | 'download';
}

/**
 * Base64 chunks must be a multiple of 3 bytes or the padding of one chunk
 * corrupts the next. 3 MiB keeps each bridge string around 4 MB — small enough
 * that a 10-minute WAV does not blow the WebView heap.
 */
const WRITE_CHUNK = 3 * 1024 * 1024;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Writes a blob without ever building one giant base64 string.
 *
 * This is the fix for the crash at 94%: the app used to turn the whole export
 * into a data URL (1.33× bytes, as UTF-16, then again in the bridge JSON) and
 * an 8-minute WAV ran the WebView out of memory right before the write.
 */
async function writeBlobNative(
  blob: Blob,
  path: string,
  directory: Directory,
  onProgress?: (fraction: number) => void,
): Promise<string | null> {
  let uri: string | null = null;
  if (blob.size === 0) {
    const empty = await Filesystem.writeFile({ path, data: '', directory, recursive: true });
    return empty.uri ?? null;
  }
  for (let offset = 0; offset < blob.size; offset += WRITE_CHUNK) {
    const part = blob.slice(offset, Math.min(offset + WRITE_CHUNK, blob.size));
    const base64 = await blobToBase64(part);
    if (offset === 0) {
      const first = await Filesystem.writeFile({ path, data: base64, directory, recursive: true });
      uri = first.uri ?? null;
    } else {
      await Filesystem.appendFile({ path, data: base64, directory });
    }
    onProgress?.(Math.min(1, (offset + part.size) / blob.size));
  }
  return uri;
}

/**
 * Saves an export where the user can actually find it.
 *
 * Native: Capacitor Filesystem writes into the app documents folder and, when
 * the platform allows it, mirrors the file into the public Downloads folder
 * through the share sheet.
 * Web: a plain browser download (the PWA keeps the file in Downloads).
 */
export async function saveExport(
  encoded: EncodedAudio,
  fileName: string,
  onProgress?: (fraction: number) => void,
): Promise<SavedExport> {
  if (IS_NATIVE) {
    const uri = await writeBlobNative(encoded.blob, `exports/${fileName}`, Directory.Documents, onProgress);
    return {
      name: fileName,
      uri,
      where: 'documents',
    };
  }

  const url = URL.createObjectURL(encoded.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return { name: fileName, uri: null, where: 'download' };
}

/** Deletes an export that was interrupted. Silent: nothing to report. */
export async function removeExport(fileName: string): Promise<void> {
  if (!IS_NATIVE) return;
  try {
    await Filesystem.deleteFile({ path: `exports/${fileName}`, directory: Directory.Documents });
  } catch {
    /* never written, or already gone */
  }
}

/** Opens the system share sheet (native) or the Web Share API. */
export async function shareExport(
  encoded: EncodedAudio,
  fileName: string,
): Promise<boolean> {
  if (IS_NATIVE) {
    const uri = await writeBlobNative(encoded.blob, `share/${fileName}`, Directory.Cache);
    if (!uri) return false;
    await Share.share({
      title: fileName,
      url: Capacitor.convertFileSrc(uri),
      dialogTitle: 'Share export',
    });
    return true;
  }

  const file = new File([encoded.blob], fileName, { type: encoded.mime });
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({ files: [file], title: fileName });
    return true;
  }
  return false;
}

/** Persists the working session so a reload never loses the chain. */
const SESSION_KEY = 'aegis.session.v8';

export function saveSession(data: Record<string, unknown>): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    // storage full or disabled — never block the render.
  }
}

export function loadSession(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Reads a text asset from the bundle without a network round trip. */
export async function readAsset(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`asset missing: ${path}`);
  return res.text();
}

export { Encoding };
