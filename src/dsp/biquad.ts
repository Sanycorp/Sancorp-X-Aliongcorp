/**
 * RBJ biquad filters, stereo, zero allocation per block.
 * Coefficients are re-designed whenever a parameter changes.
 */
export type FilterKind =
  | 'lowpass'
  | 'highpass'
  | 'peaking'
  | 'lowshelf'
  | 'highshelf'
  | 'bandpass'
  | 'notch';

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export function designBiquad(
  kind: FilterKind,
  freq: number,
  q: number,
  gainDb: number,
  sampleRate: number,
): BiquadCoefficients {
  const nyquist = sampleRate * 0.5;
  const f = Math.min(Math.max(freq, 8), nyquist * 0.94);
  const w0 = (2 * Math.PI * f) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const qq = Math.max(0.05, q);
  const alpha = sin / (2 * qq);
  const A = Math.pow(10, gainDb / 40);

  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;

  switch (kind) {
    case 'lowpass':
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'bandpass':
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'peaking':
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const beta = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cos + beta);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - beta);
      a0 = A + 1 + (A - 1) * cos + beta;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - beta;
      break;
    }
    case 'highshelf': {
      const beta = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cos + beta);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - beta);
      a0 = A + 1 - (A - 1) * cos + beta;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - beta;
      break;
    }
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

/** Direct-form-I biquad with independent left/right state. */
export class Biquad {
  private c: BiquadCoefficients = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
  private x1l = 0;
  private x2l = 0;
  private y1l = 0;
  private y2l = 0;
  private x1r = 0;
  private x2r = 0;
  private y1r = 0;
  private y2r = 0;

  static of(
    kind: FilterKind,
    freq: number,
    q = 0.707,
    gainDb = 0,
    sampleRate = 48000,
  ): Biquad {
    const bq = new Biquad();
    bq.set(designBiquad(kind, freq, q, gainDb, sampleRate));
    return bq;
  }

  set(c: BiquadCoefficients): void {
    this.c = c;
  }

  reset(): void {
    this.x1l = this.x2l = this.y1l = this.y2l = 0;
    this.x1r = this.x2r = this.y1r = this.y2r = 0;
  }

  /** Processes in place. */
  process(left: Float32Array, right: Float32Array): void {
    const { b0, b1, b2, a1, a2 } = this.c;
    for (let i = 0; i < left.length; i++) {
      const xl = left[i];
      const yl = b0 * xl + b1 * this.x1l + b2 * this.x2l - a1 * this.y1l - a2 * this.y2l;
      this.x2l = this.x1l;
      this.x1l = xl;
      this.y2l = this.y1l;
      this.y1l = yl;
      left[i] = yl;

      const xr = right[i];
      const yr = b0 * xr + b1 * this.x1r + b2 * this.x2r - a1 * this.y1r - a2 * this.y2r;
      this.x2r = this.x1r;
      this.x1r = xr;
      this.y2r = this.y1r;
      this.y1r = yr;
      right[i] = yr;
    }
  }

  /** Single sample, left channel only — used by analysis filters. */
  tick(x: number): number {
    const { b0, b1, b2, a1, a2 } = this.c;
    const y = b0 * x + b1 * this.x1l + b2 * this.x2l - a1 * this.y1l - a2 * this.y2l;
    this.x2l = this.x1l;
    this.x1l = x;
    this.y2l = this.y1l;
    this.y1l = y;
    return y;
  }
}
