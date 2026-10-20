/**
 * Oscilloscope / spectrum panel. Draws the *rendered preview* when one exists,
 * otherwise a low-amplitude synthetic carrier so the cockpit never looks dead.
 * Runs on one rAF loop and stops when the tab is hidden.
 */
export interface Scope {
  el: HTMLElement;
  setData(left: Float32Array, right: Float32Array, sampleRate: number): void;
  clearData(): void;
  destroy(): void;
}

export function createScope(): Scope {
  const canvas = document.createElement('canvas');
  canvas.className = 'scope-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const label = document.createElement('div');
  label.className = 'scope-meta mono';
  label.innerHTML = '<span>SIG · MON</span><span class="scope-rate">48.0 kHz</span><span>TP −∞</span>';

  const el = document.createElement('div');
  el.className = 'scope';
  el.append(canvas, label);

  let left: Float32Array | null = null;
  let right: Float32Array | null = null;
  let sr = 48000;
  let raf = 0;
  let t = 0;
  let visible = true;

  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    if (visible) start();
  });
  io.observe(el);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (visible) start();
  });

  function start(): void {
    if (raf) return;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      paint();
    };
    raf = requestAnimationFrame(tick);
  }

  function stop(): void {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function paint(): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(document.body);
    const line = css.getPropertyValue('--line').trim() || '#c9d2e0';
    const cobalt = css.getPropertyValue('--cobalt').trim() || '#0b4fd6';
    const crimson = css.getPropertyValue('--crimson').trim() || '#d91e2b';
    const inset = css.getPropertyValue('--inset').trim() || '#edf1f8';

    ctx.fillStyle = inset;
    ctx.fillRect(0, 0, w, h);

    // grid + axis
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += w / 12) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += h / 4) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    t += 1 / 60;
    const usable = left && left.length > 200;
    const drawCh = (data: Float32Array | null, color: string, phase: number, width: number) => {
      ctx.beginPath();
      const mid = h / 2;
      const amp = h * 0.36;
      for (let x = 0; x <= w; x += 1) {
        let v: number;
        if (usable && data) {
          const from = Math.floor((x / w) * Math.max(0, data.length - 1));
          const span = Math.max(1, Math.floor(data.length / w));
          let peak = 0;
          let sum = 0;
          for (let i = 0; i < span; i++) {
            const s = data[Math.min(data.length - 1, from + i)] ?? 0;
            if (Math.abs(s) > Math.abs(peak)) peak = s;
            sum += s;
          }
          v = (peak + sum / span) * 0.5;
        } else {
          const p = (x / w) * Math.PI * 6 + phase;
          v =
            Math.sin(p) * 0.32 * Math.sin(t * 0.9 + phase) +
            Math.sin(p * 2.7 + phase * 1.7) * 0.12 +
            Math.sin(p * 0.7 - t * 0.6) * 0.08;
        }
        const y = mid - Math.max(-1, Math.min(1, v)) * amp;
        if (x === 0) ctx.moveTo(0, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    drawCh(left, cobalt, 0, 1.6);
    if (right) drawCh(right, crimson, 1.2, 1);

    // scanline
    const scanX = ((t * 90) % (w + 60)) - 30;
    const grad = ctx.createLinearGradient(scanX - 30, 0, scanX + 30, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(scanX - 30, 0, 60, h);
  }

  start();

  return {
    el,
    setData(l, r, sampleRate) {
      left = l;
      right = r;
      sr = sampleRate;
      const rate = el.querySelector('.scope-rate');
      if (rate) rate.textContent = `${(sr / 1000).toFixed(1)} kHz`;
    },
    clearData() {
      left = null;
      right = null;
    },
    destroy() {
      stop();
      io.disconnect();
    },
  };
}
