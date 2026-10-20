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
): Promise<SavedExport> {
  if (IS_NATIVE) {
    const base64 = await blobToBase64(encoded.blob);
    const result = await Filesystem.writeFile({
      path: `exports/${fileName}`,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    return {
      name: fileName,
      uri: result.uri ?? null,
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

/** Opens the system share sheet (native) or the Web Share API. */
export async function shareExport(
  encoded: EncodedAudio,
  fileName: string,
): Promise<boolean> {
  if (IS_NATIVE) {
    const base64 = await blobToBase64(encoded.blob);
    const written = await Filesystem.writeFile({
      path: `share/${fileName}`,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    if (!written.uri) return false;
    await Share.share({
      title: fileName,
      url: Capacitor.convertFileSrc(written.uri),
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
