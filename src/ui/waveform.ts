import { formatDuration } from '../io/audioFile';
import { setHtml } from '../security/sanitize';
import type { Store } from '../state/store';

export interface Waveform {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  redraw(): void;
  setPlayhead(seconds: number | null): void;
}

/**
 * Timeline with draggable trim handles. The peaks are pre-computed once per
 * source; the canvas only re-paints on change, so dragging stays at 60 fps.
 */
export function createWaveform(store: Store, onTrimChange: () => void): Waveform {
  const canvas = document.createElement('canvas');
  canvas.className = 'wave-canvas';
  canvas.setAttribute('aria-label', 'Timeline');
  canvas.setAttribute('role', 'img');

  const readout = document.createElement('div');
  readout.className = 'wave-readout mono';

  const wrap = document.createElement('div');
  wrap.className = 'wave';
  wrap.append(canvas, readout);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let playhead: number | null = null;
  let drag: 'start' | 'end' | null = null;

  const duration = (): number => store.source?.duration ?? 0;

  const trim = (): { start: number; end: number } => {
    const d = duration();
    const start = Math.max(0, Math.min(store.edit.trimStart, d));
    const end = store.edit.trimEnd > 0 ? Math.min(store.edit.trimEnd, d) : d;
    return { start, end: Math.max(start + 0.05, end) };
  };

  const xToSeconds = (x: number): number => {
    const rect = canvas.getBoundingClientRect();
    const rel = (x - rect.left) / Math.max(1, rect.width);
    return Math.max(0, Math.min(1, rel)) * duration();
  };

  const draw = (): void => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(document.body);
    const line = css.getPropertyValue('--line').trim() || '#c9d2e0';
    const inset = css.getPropertyValue('--inset').trim() || '#edf1f8';
    const cobalt = css.getPropertyValue('--cobalt').trim() || '#0b4fd6';
    const crimson = css.getPropertyValue('--crimson').trim() || '#d91e2b';
    const ink = css.getPropertyValue('--ink').trim() || '#0a0d12';
    const faint = css.getPropertyValue('--ink-faint').trim() || '#8b97a8';

    // background
    ctx.fillStyle = inset;
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    const gridStep = 32;
    for (let x = gridStep; x < w; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, Math.round(h / 2) + 0.5);
    ctx.lineTo(w, Math.round(h / 2) + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const { start, end } = trim();
    const d = duration() || 1;
    const xStart = (start / d) * w;
    const xEnd = (end / d) * w;

    // trimmed-out regions
    ctx.fillStyle = css.getPropertyValue('--canvas-deep').trim() || '#dde4ee';
    ctx.globalAlpha = 0.82;
    ctx.fillRect(0, 0, xStart, h);
    ctx.fillRect(xEnd, 0, w - xEnd, h);
    ctx.globalAlpha = 1;

    // waveform
    const peaks = store.peaks;
    if (peaks) {
      const barW = Math.max(1, w / peaks.length);
      for (let i = 0; i < peaks.length; i++) {
        const x = i * barW;
        const inside = x >= xStart && x <= xEnd;
        const amp = Math.max(0.008, peaks[i]) * (h * 0.44);
        ctx.fillStyle = inside ? cobalt : faint;
        ctx.globalAlpha = inside ? 0.92 : 0.4;
        const top = h / 2 - amp;
        const bw = Math.max(1, barW - 1);
        ctx.fillRect(x, top, bw, amp * 2);
      }
      ctx.globalAlpha = 1;
    }

    // playhead
    if (playhead !== null && duration() > 0) {
      const px = (playhead / duration()) * w;
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(px - 5, 0);
      ctx.lineTo(px + 5, 0);
      ctx.lineTo(px, 7);
      ctx.closePath();
      ctx.fill();
    }

    // trim markers
    const handle = (x: number, color: string, side: 'l' | 'r') => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(side === 'l' ? x : x - 6, 0, 6, 16);
      ctx.fillStyle = '#fff';
      ctx.fillRect(side === 'l' ? x + 1.5 : x - 3, 1.5, 3, 13);
    };
    if (duration() > 0) {
      handle(xStart, cobalt, 'l');
      handle(xEnd, crimson, 'r');
    }

    // time labels
    ctx.fillStyle = faint;
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textBaseline = 'bottom';
    const label = (t: number, x: number, align: CanvasTextAlign) => {
      ctx.textAlign = align;
      ctx.fillText(formatDuration(t), x, h - 3);
    };
    if (duration() > 0) {
      label(0, 4, 'left');
      label(start, Math.min(xStart + 4, w - 4), 'left');
      label(end, Math.max(xEnd - 4, 4), 'right');
      label(duration(), w - 4, 'right');
    }
  };

  const updateReadout = (): void => {
    const { start, end } = trim();
    const len = Math.max(0, end - start);
    setHtml(
      readout,
      `<span>IN <b>${formatDuration(start, true)}</b></span><span>LEN <b>${formatDuration(len, true)}</b></span><span>OUT <b>${formatDuration(end, true)}</b></span>`,
    );
  };

  canvas.addEventListener('pointerdown', (ev) => {
    if (duration() <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const { start, end } = trim();
    const sx = (start / duration()) * rect.width;
    const ex = (end / duration()) * rect.width;
    if (Math.abs(x - sx) < Math.abs(x - ex)) drag = 'start';
    else drag = 'end';
    canvas.setPointerCapture(ev.pointerId);
    applyDrag(ev.clientX);
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (duration() <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const { start, end } = trim();
    const sx = (start / duration()) * rect.width;
    const ex = (end / duration()) * rect.width;
    const near = Math.min(Math.abs(x - sx), Math.abs(x - ex)) < 14;
    canvas.style.cursor = drag ? 'ew-resize' : near ? 'ew-resize' : 'crosshair';
    if (drag) applyDrag(ev.clientX);
  });

  const endDrag = (ev: PointerEvent) => {
    if (!drag) return;
    drag = null;
    canvas.releasePointerCapture?.(ev.pointerId);
    onTrimChange();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function applyDrag(clientX: number): void {
    const t = xToSeconds(clientX);
    const d = duration();
    const { start, end } = trim();
    if (drag === 'start') {
      const next = Math.min(t, end - 0.1);
      store.edit = { ...store.edit, trimStart: Math.max(0, next) };
    } else if (drag === 'end') {
      const next = Math.max(t, start + 0.1);
      store.edit = { ...store.edit, trimEnd: next >= d - 0.02 ? 0 : next };
    }
    updateReadout();
    draw();
  }

  const ro = new ResizeObserver(() => draw());
  requestAnimationFrame(() => {
    ro.observe(canvas);
    draw();
    updateReadout();
  });

  window.addEventListener('resize', () => draw());

  return {
    el: wrap,
    canvas,
    redraw: () => {
      updateReadout();
      draw();
    },
    setPlayhead: (seconds) => {
      playhead = seconds;
      draw();
    },
  };
}
