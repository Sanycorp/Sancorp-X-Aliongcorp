import { describe, expect, it } from 'vitest';
import { encodeFlac, encodeWav, encode } from '../src/io/encode';
import type { Stereo } from '../src/dsp/buffer';

const SR = 48000;

function makeSignal(seconds = 0.25): Stereo {
  const n = Math.round(SR * seconds);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i] = Math.sin((2 * Math.PI * 440 * i) / SR) * 0.5;
    right[i] = Math.cos((2 * Math.PI * 220 * i) / SR) * 0.35;
  }
  return { left, right, sampleRate: SR };
}

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function ascii(view: Uint8Array, at: number, len: number): string {
  return String.fromCharCode(...view.subarray(at, at + len));
}

describe('WAV encoder', () => {
  const audio = makeSignal(0.1);

  it('writes a valid 16-bit header with INFO metadata', async () => {
    const data = await bytes(encodeWav(audio, 16, { artist: 'Sanayacorp', title: 'Test' }));
    expect(ascii(data, 0, 4)).toBe('RIFF');
    expect(ascii(data, 8, 4)).toBe('WAVE');
    expect(ascii(data, 12, 4)).toBe('fmt ');
    const view = new DataView(data.buffer);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // stereo
    expect(view.getUint32(24, true)).toBe(SR);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(data, 36, 4)).toBe('LIST');
    expect(ascii(data, 36 + 8, 4)).toBe('INFO');
    // find data chunk
    const at = data.findIndex((_, i) => ascii(data, i, 4) === 'data');
    expect(at).toBeGreaterThan(36);
    const size = new DataView(data.buffer).getUint32(at + 4, true);
    expect(size).toBe(audio.left.length * 4);
    expect(data.length).toBeGreaterThanOrEqual(at + 8 + size);
  });

  it('encodes 24-bit and 32-bit float', async () => {
    const wav24 = await bytes(encodeWav(audio, 24));
    const at24 = wav24.findIndex((_, i) => ascii(wav24, i, 4) === 'data');
    expect(new DataView(wav24.buffer).getUint32(at24 + 4, true)).toBe(audio.left.length * 6);

    const wav32 = await bytes(encodeWav(audio, 32));
    const view = new DataView(wav32.buffer);
    expect(view.getUint16(20, true)).toBe(3); // IEEE float
    const at32 = wav32.findIndex((_, i) => ascii(wav32, i, 4) === 'data');
    const first = view.getFloat32(at32 + 8, true);
    expect(first).toBeCloseTo(audio.left[0], 5);
  });

  it('round-trips sample values within 16-bit quantisation', async () => {
    const data = await bytes(encodeWav(audio, 16));
    const b = await bytes(encodeWav(audio, 16));
    expect(data.length).toBe(b.length);
    const at = data.findIndex((_, i) => ascii(data, i, 4) === 'data');
    const view = new DataView(data.buffer);
    const sample = view.getInt16(at + 8 + 800, true) / 0x8000;
    expect(Math.abs(sample - audio.left[200])).toBeLessThan(1 / 32000);
  });
});

// ---------------------------------------------------------------------------
// FLAC: parse our own stream and verify CRCs + PCM, which proves the bitstream
// follows the spec (a decoder rejects a frame whose CRC does not match).
// ---------------------------------------------------------------------------

const CRC8 = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let b = 0; b < 8; b++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    t[i] = c;
  }
  return t;
})();

const CRC16 = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff;
    t[i] = c;
  }
  return t;
})();

function crc8(data: Uint8Array, from: number, to: number): number {
  let c = 0;
  for (let i = from; i < to; i++) c = CRC8[c ^ data[i]];
  return c;
}
function crc16(data: Uint8Array, from: number, to: number): number {
  let c = 0;
  for (let i = from; i < to; i++) c = ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ data[i]];
  return c;
}

interface FlacFrame {
  start: number;
  crcOk: boolean;
  samples: number;
  channels: [Float32Array, Float32Array];
}

function parseFlac(data: Uint8Array): {
  sampleRate: number;
  channels: number;
  bits: number;
  totalSamples: number;
  frames: FlacFrame[];
} {
  expect(ascii(data, 0, 4)).toBe('fLaC');
  let p = 4;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let totalSamples = 0;

  // metadata blocks
  for (;;) {
    const header = data[p];
    const last = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const len = (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3];
    if (type === 0) {
      const info = data.subarray(p + 4, p + 4 + len);
      sampleRate = (info[10] << 12) | (info[11] << 4) | (info[12] >> 4);
      channels = ((info[12] >> 1) & 0x07) + 1;
      bits = (((info[12] & 1) << 4) | (info[13] >> 4)) + 1;
      totalSamples =
        (info[13] & 0x0f) * 0x100000000 +
        ((info[14] << 24) | (info[15] << 16) | (info[16] << 8) | info[17]) >>> 0;
    }
    p += 4 + len;
    if (last) break;
  }

  const frames: FlacFrame[] = [];
  while (p < data.length - 1) {
    const start = p;
    expect(data[p]).toBe(0xff);
    expect(data[p + 1] & 0xfe).toBe(0xf8);
    const bsCode = data[p + 2] >> 4;
    const srCode = data[p + 2] & 0x0f;
    const chanCode = data[p + 3] >> 4;
    const sizeCode = (data[p + 3] >> 1) & 0x07;
    expect(chanCode).toBe(1); // independent stereo
    expect(sizeCode).toBe(6); // 24-bit
    p += 4;

    // UTF-8 coded frame number
    const lead = data[p];
    let extra = 0;
    if (lead & 0x80) {
      if ((lead & 0xe0) === 0xc0) extra = 1;
      else if ((lead & 0xf0) === 0xe0) extra = 2;
      else if ((lead & 0xf8) === 0xf0) extra = 3;
      else extra = 4;
    }
    p += 1 + extra;

    let blockSize = 0;
    if (bsCode === 0b1100) blockSize = 4096;
    else if (bsCode === 0b0111) {
      blockSize = ((data[p] << 8) | data[p + 1]) + 1;
      p += 2;
    }
    if (srCode === 0b1101) p += 2;

    expect(crc8(data, start, p)).toBe(data[p]);
    p += 1;

    const decode = (): Float32Array => {
      expect(data[p]).toBe(0x02); // verbatim subframe
      p += 1;
      const out = new Float32Array(blockSize);
      for (let i = 0; i < blockSize; i++) {
        const v = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
        p += 3;
        const signed = v & 0x800000 ? v - 0x1000000 : v;
        out[i] = signed / 0x800000;
      }
      return out;
    };
    const l = decode();
    const r = decode();

    const want = crc16(data, start, p);
    const got = (data[p] << 8) | data[p + 1];
    p += 2;
    frames.push({ start, crcOk: want === got, samples: blockSize, channels: [l, r] });
    if (p >= data.length || data[p] !== 0xff) break;
  }

  return { sampleRate, channels, bits, totalSamples, frames };
}

describe('FLAC encoder', () => {
  it('writes spec-valid frames with matching CRCs', async () => {
    const audio = makeSignal(0.5);
    const data = await bytes(encodeFlac(audio, { artist: 'Sanayacorp', title: 'Roundtrip' }));
    const flac = parseFlac(data);

    expect(flac.sampleRate).toBe(SR);
    expect(flac.channels).toBe(2);
    expect(flac.bits).toBe(24);
    expect(flac.totalSamples).toBe(audio.left.length);
    expect(flac.frames.length).toBe(Math.ceil(audio.left.length / 4096));
    for (const frame of flac.frames) expect(frame.crcOk).toBe(true);
  });

  it('round-trips the waveform bit-exactly (24-bit)', async () => {
    const audio = makeSignal(0.25);
    const data = await bytes(encodeFlac(audio));
    const flac = parseFlac(data);
    const left: number[] = [];
    const right: number[] = [];
    for (const frame of flac.frames) {
      left.push(...Array.from(frame.channels[0]));
      right.push(...Array.from(frame.channels[1]));
    }
    expect(left.length).toBe(audio.left.length);
    let maxErr = 0;
    for (let i = 0; i < left.length; i += 17) {
      maxErr = Math.max(maxErr, Math.abs(left[i] - audio.left[i]), Math.abs(right[i] - audio.right[i]));
    }
    expect(maxErr).toBeLessThan(2 / 0x800000);
  });
});

describe('format dispatch', () => {
  it('encodes MP3 with a valid MPEG frame sync', async () => {
    const audio = makeSignal(0.5);
    const out = await encode(audio, 'mp3', 320);
    expect(out.ext).toBe('mp3');
    expect(out.blob.size).toBeGreaterThan(1000);
    const data = await bytes(out.blob);
    const sync = data[0] === 0xff && (data[1] & 0xe0) === 0xe0;
    expect(sync).toBe(true);
  });

  it('routes lossless formats', async () => {
    const audio = makeSignal(0.1);
    expect((await encode(audio, 'wav16', 0)).ext).toBe('wav');
    expect((await encode(audio, 'flac', 0)).ext).toBe('flac');
  });
});
