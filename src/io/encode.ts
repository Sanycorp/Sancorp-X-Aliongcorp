import type { Stereo } from '../dsp/buffer';
import type { OutputFormat } from '../model/settings';

/** Interleaved 16-bit PCM. */
function toInt16(left: Float32Array, right: Float32Array): Int16Array {
  const frames = left.length;
  const out = new Int16Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    out[i * 2] = l < 0 ? l * 0x8000 : l * 0x7fff;
    out[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7fff;
  }
  return out;
}

function infoChunk(meta: Record<string, string>): Uint8Array | null {
  const entries = Object.entries(meta);
  if (entries.length === 0) return null;
  const parts: number[] = [];
  const push = (s: string) => {
    for (let i = 0; i < s.length; i++) parts.push(s.charCodeAt(i) & 0xff);
  };
  const push32 = (n: number) => {
    parts.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
  };
  for (const [key, value] of entries) {
    const body = `${value}\0`;
    const id = key.toUpperCase().padEnd(4, ' ').slice(0, 4);
    push(id);
    push32(body.length);
    push(body);
    if (body.length % 2 === 1) parts.push(0);
  }
  return new Uint8Array(parts);
}

/** WAV with 16/24-bit integer or 32-bit float samples + LIST/INFO metadata. */
export function encodeWav(
  audio: Stereo,
  bitDepth: 16 | 24 | 32,
  meta: Record<string, string> = {},
): Blob {
  const channels = 2;
  const sr = audio.sampleRate;
  const frames = audio.left.length;
  const bytesPer = bitDepth / 8;
  const format = bitDepth === 32 ? 3 : 1;
  const data = new Uint8Array(frames * channels * bytesPer);
  const view = new DataView(data.buffer);

  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, audio.left[i]));
    const r = Math.max(-1, Math.min(1, audio.right[i]));
    for (let c = 0; c < 2; c++) {
      const v = c === 0 ? l : r;
      const off = (i * 2 + c) * bytesPer;
      if (bitDepth === 16) {
        view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      } else if (bitDepth === 24) {
        const s = Math.round(v < 0 ? v * 0x800000 : v * 0x7fffff);
        view.setUint8(off, s & 0xff);
        view.setUint8(off + 1, (s >> 8) & 0xff);
        view.setUint8(off + 2, (s >> 16) & 0xff);
      } else {
        view.setFloat32(off, v, true);
      }
    }
  }

  const info = infoChunk(meta);
  const total = 12 + 8 + 16 + (info ? 12 + info.length : 0) + 8 + data.length + (data.length % 2);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let p = 0;
  const ascii = (s: string) => {
    for (let i = 0; i < s.length; i++) out[p + i] = s.charCodeAt(i);
    p += s.length;
  };

  ascii('RIFF');
  dv.setUint32(p, total - 8, true);
  p += 4;
  ascii('WAVE');
  ascii('fmt ');
  dv.setUint32(p, 16, true);
  p += 4;
  dv.setUint16(p, format, true);
  p += 2;
  dv.setUint16(p, channels, true);
  p += 2;
  dv.setUint32(p, sr, true);
  p += 4;
  dv.setUint32(p, sr * channels * bytesPer, true);
  p += 4;
  dv.setUint16(p, channels * bytesPer, true);
  p += 2;
  dv.setUint16(p, bitDepth, true);
  p += 2;

  if (info) {
    ascii('LIST');
    dv.setUint32(p, info.length + 4, true);
    p += 4;
    ascii('INFO');
    out.set(info, p);
    p += info.length;
  }

  ascii('data');
  dv.setUint32(p, data.length, true);
  p += 4;
  out.set(data, p);

  return new Blob([out], { type: 'audio/wav' });
}

// ---------------------------------------------------------------------------
// FLAC (verbatim subframes, real CRC-8/CRC-16 — plays in any FLAC decoder)
// ---------------------------------------------------------------------------

const CRC8_TABLE = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let b = 0; b < 8; b++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    t[i] = c;
  }
  return t;
})();

const CRC16_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff;
    t[i] = c;
  }
  return t;
})();

function crc8(bytes: Uint8Array, from: number, to: number): number {
  let c = 0;
  for (let i = from; i < to; i++) c = CRC8_TABLE[c ^ bytes[i]];
  return c;
}

function crc16(bytes: Uint8Array, from: number, to: number): number {
  let c = 0;
  for (let i = from; i < to; i++) c = ((c << 8) & 0xffff) ^ CRC16_TABLE[(c >> 8) ^ bytes[i]];
  return c;
}

function utf8FrameNumber(n: number): number[] {
  if (n < 0x80) return [n];
  if (n < 0x800) return [0xc0 | (n >> 6), 0x80 | (n & 0x3f)];
  if (n < 0x10000) return [0xe0 | (n >> 12), 0x80 | ((n >> 6) & 0x3f), 0x80 | (n & 0x3f)];
  if (n < 0x200000) {
    return [
      0xf0 | (n >> 18),
      0x80 | ((n >> 12) & 0x3f),
      0x80 | ((n >> 6) & 0x3f),
      0x80 | (n & 0x3f),
    ];
  }
  return [
    0xf8 | (n >> 24),
    0x80 | ((n >> 18) & 0x3f),
    0x80 | ((n >> 12) & 0x3f),
    0x80 | ((n >> 6) & 0x3f),
    0x80 | (n & 0x3f),
  ];
}

function sampleRateCode(sr: number): { code: number; extra: number[]; extraLen: number } {
  const fixed: Record<number, number> = {
    88200: 0b0001,
    176400: 0b0010,
    192000: 0b0011,
    8000: 0b0100,
    16000: 0b0101,
    22050: 0b0110,
    24000: 0b0111,
    32000: 0b1000,
    44100: 0b1001,
    48000: 0b1010,
    96000: 0b1011,
  };
  if (fixed[sr] !== undefined) return { code: fixed[sr], extra: [], extraLen: 0 };
  return { code: 0b1101, extra: [sr & 0xff, (sr >> 8) & 0xff], extraLen: 2 };
}

/**
 * Bit-perfect FLAC: verbatim subframes keep the file lossless without pulling
 * in a 200 kB encoder. Frames carry correct CRC-8 (header) and CRC-16 (frame),
 * so every mainstream decoder accepts the stream.
 */
export function encodeFlac(audio: Stereo, meta: Record<string, string> = {}): Blob {
  const sr = audio.sampleRate;
  const frames = audio.left.length;
  const bits = 24;
  const blockSize = 4096;
  const nBlocks = Math.max(1, Math.ceil(frames / blockSize));
  const totalSamples = frames;

  // ---- STREAMINFO (34 bytes)
  const streamInfo = new Uint8Array(34);
  const sview = new DataView(streamInfo.buffer);
  sview.setUint16(0, blockSize, false);
  sview.setUint16(2, blockSize, false);
  sview.setUint8(4, 0); // min frame size unknown
  sview.setUint8(5, 0);
  sview.setUint8(6, 0);
  sview.setUint8(7, 0); // max frame size unknown
  const packed = new Uint8Array(8);
  packed[0] = (sr >> 12) & 0xff;
  packed[1] = (sr >> 4) & 0xff;
  packed[2] = ((sr & 0x0f) << 4) | (1 << 1) | ((bits - 1) >> 4);
  packed[3] = (((bits - 1) & 0x0f) << 4) | ((totalSamples / 0x100000000) & 0x0f);
  packed[4] = (totalSamples >>> 24) & 0xff;
  packed[5] = (totalSamples >>> 16) & 0xff;
  packed[6] = (totalSamples >>> 8) & 0xff;
  packed[7] = totalSamples & 0xff;
  streamInfo.set(packed, 10);
  // bytes 18..33: MD5 of raw audio, zero = unknown (valid)

  const srMeta = sampleRateCode(sr);
  const chunks: BlobPart[] = [];
  chunks.push(new Uint8Array([0x66, 0x4c, 0x61, 0x43])); // "fLaC"
  // Metadata block 0 (STREAMINFO, 34 bytes). The "last" flag is set below if
  // no VORBIS_COMMENT block follows.
  chunks.push(new Uint8Array([0x00, 0x00, 0x00, 0x22]), streamInfo);

  // Optional VORBIS_COMMENT block with tags (type 4, not last).
  const tags = Object.entries(meta);
  if (tags.length > 0) {
    const vendor = new TextEncoder().encode('SANAYACORP AEGIS SOUND LAB');
    const parts: number[] = [];
    const u32le = (n: number) => parts.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
    u32le(vendor.length);
    parts.push(...vendor);
    u32le(tags.length);
    for (const [k, v] of tags) {
      const s = new TextEncoder().encode(`${k.toUpperCase()}=${v}`);
      u32le(s.length);
      parts.push(...s);
    }
    const block = new Uint8Array(parts);
    const header = new Uint8Array(4);
    header[0] = 0x84; // type 4 (VORBIS_COMMENT), last metadata block
    header[1] = (block.length >> 16) & 0xff;
    header[2] = (block.length >> 8) & 0xff;
    header[3] = block.length & 0xff;
    chunks.push(header, block);
  } else {
    // Mark STREAMINFO as the last block since nothing follows.
    (chunks[1] as Uint8Array)[0] = 0x80;
  }

  for (let blk = 0; blk < nBlocks; blk++) {
    const start = blk * blockSize;
    const count = Math.min(blockSize, frames - start);
    const maxSize = 16 + count * 2 * 3 + 64;
    const frame = new Uint8Array(maxSize);
    let p = 0;

    frame[p++] = 0xff;
    frame[p++] = 0xf8; // sync 14 bits + reserved 0 + fixed block size
    const bsCode = count === blockSize ? 0b1100 : 0b0111; // 4096 or 16-bit explicit
    frame[p++] = (bsCode << 4) | srMeta.code;
    frame[p++] = (0b0001 << 4) | (0b110 << 1); // stereo independent, 24-bit
    for (const b of utf8FrameNumber(blk)) frame[p++] = b;
    if (bsCode === 0b0111) {
      const v = count - 1;
      frame[p++] = (v >> 8) & 0xff;
      frame[p++] = v & 0xff;
    }
    for (const b of srMeta.extra) frame[p++] = b;
    const headerCrc = crc8(frame, 0, p);
    frame[p++] = headerCrc;

    for (let c = 0; c < 2; c++) {
      frame[p++] = 0x02; // subframe: verbatim, no wasted bits
      const src = c === 0 ? audio.left : audio.right;
      for (let i = 0; i < count; i++) {
        const v = Math.max(-1, Math.min(1, src[start + i]));
        const iv = Math.round(v < 0 ? v * 0x800000 : v * 0x7fffff);
        frame[p++] = (iv >> 16) & 0xff;
        frame[p++] = (iv >> 8) & 0xff;
        frame[p++] = iv & 0xff;
      }
    }
    const c16 = crc16(frame, 0, p);
    frame[p++] = (c16 >> 8) & 0xff;
    frame[p++] = c16 & 0xff;
    chunks.push(frame.slice(0, p));
  }

  return new Blob(chunks, { type: 'audio/flac' });
}

// ---------------------------------------------------------------------------
// Public encoder
// ---------------------------------------------------------------------------

export interface EncodedAudio {
  blob: Blob;
  ext: string;
  mime: string;
}

export async function encode(
  audio: Stereo,
  format: OutputFormat,
  bitrate: number,
  meta: Record<string, string> = {},
): Promise<EncodedAudio> {
  switch (format) {
    case 'wav16':
      return { blob: encodeWav(audio, 16, meta), ext: 'wav', mime: 'audio/wav' };
    case 'wav24':
      return { blob: encodeWav(audio, 24, meta), ext: 'wav', mime: 'audio/wav' };
    case 'wav32':
      return { blob: encodeWav(audio, 32, meta), ext: 'wav', mime: 'audio/wav' };
    case 'flac':
      return { blob: encodeFlac(audio, meta), ext: 'flac', mime: 'audio/flac' };
    case 'mp3':
    default:
      return { blob: await encodeMp3(audio, bitrate), ext: 'mp3', mime: 'audio/mpeg' };
  }
}

async function encodeMp3(audio: Stereo, bitrate: number): Promise<Blob> {
  const lame = await import('@breezystack/lamejs');
  type Encoder = {
    encodeBuffer: (l: Int16Array, r: Int16Array) => Int8Array;
    flush: () => Int8Array;
  };
  const Mp3Encoder = (lame as unknown as {
    Mp3Encoder: new (ch: number, sr: number, kbps: number) => Encoder;
  }).Mp3Encoder;
  const kbps = [128, 192, 256, 320].includes(bitrate) ? bitrate : 320;
  const enc = new Mp3Encoder(2, audio.sampleRate, kbps);
  const interleaved = toInt16(audio.left, audio.right);
  const frames = audio.left.length;
  const left = new Int16Array(frames);
  const right = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = interleaved[i * 2];
    right[i] = interleaved[i * 2 + 1];
  }
  const block = 1152;
  const chunks: BlobPart[] = [];
  for (let i = 0; i < frames; i += block) {
    const l = left.subarray(i, Math.min(i + block, frames));
    const r = right.subarray(i, Math.min(i + block, frames));
    const buf = enc.encodeBuffer(l, r);
    if (buf.length > 0) chunks.push(new Uint8Array(buf));
  }
  const tail = enc.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));
  return new Blob(chunks, { type: 'audio/mpeg' });
}
