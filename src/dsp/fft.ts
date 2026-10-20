/** In-place iterative radix-2 FFT. Real signal helpers keep the API small. */
export class FFT {
  readonly size: number;
  private readonly rev: Uint32Array;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;

  constructor(size: number) {
    if ((size & (size - 1)) !== 0) throw new Error('FFT size must be a power of two');
    this.size = size;
    const bits = Math.log2(size) | 0;
    this.rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / size);
    }
  }

  /** Forward transform, in place. */
  forward(re: Float32Array, im: Float32Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const c = this.cos[k];
          const s = this.sin[k];
          const idx = i + j + half;
          const tr = re[idx] * c - im[idx] * s;
          const ti = re[idx] * s + im[idx] * c;
          re[idx] = re[i + j] - tr;
          im[idx] = im[i + j] - ti;
          re[i + j] += tr;
          im[i + j] += ti;
        }
      }
    }
  }

  inverse(re: Float32Array, im: Float32Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const c = this.cos[k];
          const s = -this.sin[k];
          const idx = i + j + half;
          const tr = re[idx] * c - im[idx] * s;
          const ti = re[idx] * s + im[idx] * c;
          re[idx] = re[i + j] - tr;
          im[idx] = im[i + j] - ti;
          re[i + j] += tr;
          im[i + j] += ti;
        }
      }
    }
    const inv = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= inv;
      im[i] *= inv;
    }
  }
}
