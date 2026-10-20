/* eslint-disable @typescript-eslint/no-explicit-any */
import { setHtml } from '../security/sanitize';

export type Child = Node | string | number | null | undefined | false;

export interface ElProps {
  class?: string;
  text?: string;
  html?: string;
  id?: string;
  title?: string;
  role?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
  on?: Record<string, (ev: Event) => void>;
  attrs?: Record<string, string | number | boolean | null | undefined>;
}

/** Minimal hyperscript: builds a real element, no virtual DOM. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.id) node.id = props.id;
  if (props.title) node.title = props.title;
  if (props.role) node.setAttribute('role', props.role);
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) setHtml(node, props.html);
  // CSSOM assignment (not a style attribute) so CSP can stay strict on styles.
  if (typeof props.style === 'string') node.style.cssText = props.style;
  else if (props.style) Object.assign(node.style, props.style);
  if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) node.dataset[k] = v;
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === false || v === null || v === undefined) node.removeAttribute(k);
      else node.setAttribute(k, String(v));
    }
  }
  if (props.on) {
    for (const [k, fn] of Object.entries(props.on)) node.addEventListener(k, fn);
  }
  append(node, children);
  return node;
}

export function append(parent: HTMLElement, children: (Child | Child[])[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (typeof child === 'number') parent.appendChild(document.createTextNode(String(child)));
    else if (typeof child === 'string') parent.appendChild(document.createTextNode(child));
    else parent.appendChild(child);
  }
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export const svg = (path: string, size = 16): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" stroke-linejoin="miter">${path}</svg>`;

export const ICONS = {
  deck: '<path d="M3 17V7l4 3 5-6 5 6 4-3v10H3z"/><path d="M3 20h18"/>',
  lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>',
  arsenal: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  system: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.2 2.2M16.8 16.8L19 19M19 5l-2.2 2.2M7.2 16.8L5 19"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  forge: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  share: '<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  download: '<path d="M12 4v12"/><path d="M8 12l4 4 4-4"/><path d="M4 20h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  reset: '<path d="M4 10a8 8 0 1 1 2 7"/><path d="M4 4v6h6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<path d="M9 9h11v11H9z"/><path d="M15 5H4v11h5"/>',
  cpu: '<path d="M7 7h10v10H7z"/><path d="M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3"/>',
  bolt: '<path d="M12 2L6 13h5l-1 9 7-12h-5z"/>',
  wave: '<path d="M2 12h3l2-6 3 12 3-9 2 5 2-3h5"/>',
};

export function icon(name: keyof typeof ICONS, size = 16): HTMLElement {
  const span = document.createElement('span');
  span.className = 'ico';
  setHtml(span, svg(ICONS[name], size));
  span.style.display = 'inline-flex';
  return span;
}

// ---------------------------------------------------------------------------
// Composite controls
// ---------------------------------------------------------------------------

export interface FaderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  hint?: string;
  bipolar?: boolean;
  detent?: number;
  onInput: (v: number) => void;
  onChange?: (v: number) => void;
}

export interface Fader {
  wrap: HTMLElement;
  input: HTMLInputElement;
  set(v: number): void;
}

export function fader(opts: FaderOptions): Fader {
  const value = el('span', { class: 'fader__value' });
  const input = el('input', {
    class: 'range',
    attrs: {
      type: 'range',
      min: opts.min,
      max: opts.max,
      step: opts.step,
      value: opts.value,
      'aria-label': opts.label,
    },
  });
  const wrap = el(
    'label',
    { class: `fader${opts.bipolar ? ' fader--bipolar' : ''}` },
    el(
      'span',
      { class: 'fader__head' },
      el('span', { class: 'fader__name', text: opts.label }),
      value,
    ),
    input,
    opts.hint ? el('span', { class: 'fader__hint', text: opts.hint }) : null,
  );

  const paint = (v: number) => {
    const pct = ((v - opts.min) / (opts.max - opts.min)) * 100;
    input.style.setProperty('--fill', `${opts.bipolar ? 50 : 0}%`);
    input.style.setProperty('--fill-to', `${pct}%`);
    input.style.setProperty('--at', `${pct}%`);
    value.textContent = opts.format(v);
    wrap.classList.toggle('is-active', Math.abs(v) > 1e-6);
  };

  input.addEventListener('input', () => {
    const v = Number(input.value);
    paint(v);
    opts.onInput(v);
  });
  input.addEventListener('change', () => opts.onChange?.(Number(input.value)));
  // Detent: double-click returns the neutral value.
  const detent = opts.detent;
  if (detent !== undefined) {
    input.addEventListener('dblclick', () => {
      input.value = String(detent);
      paint(detent);
      opts.onInput(detent);
      opts.onChange?.(detent);
    });
  }

  paint(opts.value);
  return {
    wrap,
    input,
    set(v: number) {
      input.value = String(v);
      paint(v);
    },
  };
}

export interface Toggle {
  wrap: HTMLElement;
  input: HTMLInputElement;
  set(v: boolean): void;
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void): Toggle {
  const input = el('input', { attrs: { type: 'checkbox', 'aria-label': label } });
  input.checked = value;
  const state = el('span', { class: 'toggle__state', text: value ? 'ON' : 'OFF' });
  const wrap = el(
    'label',
    { class: 'toggle' },
    el('span', { class: 'toggle__label', text: label }),
    input,
    el('span', { class: 'toggle__track' }),
    state,
  );
  input.addEventListener('change', () => {
    state.textContent = input.checked ? 'ON' : 'OFF';
    onChange(input.checked);
  });
  return {
    wrap,
    input,
    set(v: boolean) {
      input.checked = v;
      state.textContent = v ? 'ON' : 'OFF';
    },
  };
}

export interface SegmentOption {
  value: string;
  label: string;
  sub?: string;
  /** Renders a PRO lock and calls `onLocked` instead of `onPick`. */
  locked?: boolean;
}

export interface Segmented {
  wrap: HTMLElement;
  set(value: string): void;
  /** Re-evaluate which options are locked (tier changes without a reload). */
  lock(test: (value: string) => boolean): void;
}

export function segmented(
  options: SegmentOption[],
  value: string,
  onPick: (v: string) => void,
  onLocked?: (option: SegmentOption) => void,
): Segmented {
  const buttons = options.map((o) => {
    const b = el(
      'button',
      {
        class: o.locked ? 'is-locked' : undefined,
        attrs: {
          type: 'button',
          'aria-pressed': String(o.value === value),
          'aria-disabled': o.locked ? 'true' : null,
          'data-locked': o.locked ? '1' : null,
        },
        on: {
          click: () => {
            if (o.locked) {
              onLocked?.(o);
              return;
            }
            for (const other of buttons) other.setAttribute('aria-pressed', 'false');
            b.setAttribute('aria-pressed', 'true');
            onPick(o.value);
          },
        },
      },
      el('span', { text: o.label }),
      o.sub ? el('em', { text: o.sub }) : null,
      o.locked ? el('i', { class: 'lock', text: 'PRO', attrs: { 'aria-hidden': 'true' } }) : null,
    );
    return b;
  });
  const wrap = el('div', { class: 'segment', attrs: { role: 'group' } }, buttons);
  return {
    wrap,
    set(v: string) {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
    },
    lock(test: (value: string) => boolean) {
      options.forEach((o, i) => {
        const locked = test(o.value);
        if (o.locked === locked) return;
        o.locked = locked;
        const b = buttons[i];
        b.classList.toggle('is-locked', locked);
        if (locked) b.setAttribute('aria-disabled', 'true');
        else b.removeAttribute('aria-disabled');
        let badge = b.querySelector<HTMLElement>('.lock');
        if (locked && !badge) b.append(el('i', { class: 'lock', text: 'PRO', attrs: { 'aria-hidden': 'true' } }));
        if (!locked && badge) badge.remove();
      });
    },
  };
}

export function select(
  label: string,
  options: SegmentOption[],
  value: string,
  onPick: (v: string) => void,
): { wrap: HTMLElement; select: HTMLSelectElement } {
  const sel = el('select', { attrs: { 'aria-label': label } }, ...options.map((o) => el('option', { attrs: { value: o.value }, text: o.label })));
  sel.value = value;
  sel.addEventListener('change', () => onPick(sel.value));
  const wrap = el(
    'label',
    { class: 'field' },
    el('span', { class: 'label', text: label }),
    el('span', { class: 'select-wrap' }, sel),
  );
  return { wrap, select: sel };
}

export function button(
  label: string,
  options: {
    tone?: 'primary' | 'danger' | 'ghost' | 'plain';
    size?: 'sm' | 'md';
    icon?: keyof typeof ICONS;
    block?: boolean;
    onClick?: () => void;
    title?: string;
  } = {},
): HTMLButtonElement {
  const classes = ['btn'];
  if (options.tone && options.tone !== 'plain') classes.push(`btn--${options.tone}`);
  if (options.size === 'sm') classes.push('btn--sm');
  if (options.block) classes.push('btn--block');
  const btn = el('button', {
    class: classes.join(' '),
    title: options.title,
    attrs: { type: 'button' },
  });
  if (options.icon) btn.appendChild(icon(options.icon, 15));
  btn.appendChild(el('span', { text: label }));
  if (options.onClick) btn.addEventListener('click', options.onClick);
  return btn;
}

export function iconButton(name: keyof typeof ICONS, label: string, onClick: () => void): HTMLButtonElement {
  return el(
    'button',
    {
      class: 'icon-btn',
      title: label,
      attrs: { type: 'button', 'aria-label': label },
      on: { click: onClick },
    },
    (() => {
      const s = document.createElement('span');
      setHtml(s, svg(ICONS[name], 16));
      s.style.display = 'inline-flex';
      return s;
    })(),
  );
}

export function sectionHead(index: string, title: string): HTMLElement {
  return el(
    'div',
    { class: 'section-head' },
    el('span', { class: 'idx', text: index }),
    el('h2', { text: title }),
    el('span', { class: 'rule' }),
  );
}

export function toast(
  message: string,
  tone: 'info' | 'ok' | 'err' = 'info',
  ms = 2600,
): HTMLElement | null {
  const host = document.getElementById('toast-host');
  if (!host) return null;
  const node = el(
    'div',
    { class: `toast toast--${tone}`, role: 'status' },
    el('span', { class: 'toast__bar' }),
    el('span', { class: 'toast__text', text: message }),
  );
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  setTimeout(() => {
    node.classList.remove('is-in');
    setTimeout(() => node.remove(), 320);
  }, ms);
  return node;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
