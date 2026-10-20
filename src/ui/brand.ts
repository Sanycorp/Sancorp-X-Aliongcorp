/**
 * Sanayacorp brand marks.
 *
 * The master artwork lives in `brand/aegis-music-icon.png`; the icons in
 * `public/icons` are derived from it by `npm run icons`. The two marks below are
 * the same idea reduced to vector so they stay sharp at 26 px in the header and
 * inherit the current finish (ink on white, paper on black).
 *
 * Built with createElementNS, never with markup strings: the CSP forbids inline
 * HTML for scripts and Trusted Types would reject it anyway.
 */

const NS = 'http://www.w3.org/2000/svg';

function node(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

let gradientSeq = 0;

/** Shield outline with a phoenix-feather S — the company seal, vectorised. */
function seal(size: number, title: string): SVGSVGElement {
  const svg = node('svg', {
    viewBox: '0 0 44 48',
    width: String(size),
    height: String(size),
    class: 'brand-seal',
    role: 'img',
    'aria-label': title,
    focusable: 'false',
  }) as SVGSVGElement;

  const titleNode = node('title');
  titleNode.textContent = title;
  svg.appendChild(titleNode);

  // Holographic band, the one place the mark allows colour beyond ink/cobalt.
  const gradientId = `brand-holo-${(gradientSeq += 1)}`;
  const defs = node('defs');
  const gradient = node('linearGradient', {
    id: gradientId,
    x1: '0',
    y1: '0',
    x2: '1',
    y2: '1',
  });
  gradient.append(
    node('stop', { offset: '0', 'stop-color': '#4fd1ff' }),
    node('stop', { offset: '0.55', 'stop-color': '#8b6cff' }),
    node('stop', { offset: '1', 'stop-color': '#ff6fd8' }),
  );
  defs.appendChild(gradient);
  svg.appendChild(defs);

  svg.appendChild(
    node('path', {
      class: 'brand-seal__field',
      d: 'M4.6 25.4 22 44 39.4 25.4V27L22 46.4 4.6 27Z',
      fill: `url(#${gradientId})`,
    }),
  );

  svg.appendChild(
    node('path', {
      class: 'brand-seal__shield',
      d: 'M22 2.5 40 9.6V27L22 45.5 4 27V9.6Z',
      fill: 'none',
      'stroke-width': '2.4',
      'stroke-linejoin': 'round',
    }),
  );

  // Two circuit stubs, echoing the branches in the master artwork.
  svg.appendChild(
    node('path', {
      class: 'brand-seal__wire',
      d: 'M4 21.5H0.8M43.2 21.5H40',
      'stroke-width': '1.6',
      'stroke-linecap': 'round',
    }),
  );

  svg.appendChild(
    node('path', {
      class: 'brand-seal__letter',
      d: 'M30 15.4c0-3.3-3.4-5.4-8-5.4s-8 2.1-8 5.4 3.4 4.3 8 5.4 8 2.1 8 5.4-3.4 5.4-8 5.4-8-2.1-8-5.4',
      fill: 'none',
      'stroke-width': '4.4',
      'stroke-linecap': 'round',
    }),
  );

  return svg;
}

/** Header mark: the seal at chrome size. */
export function brandMark(size = 30): HTMLElement {
  const host = document.createElement('div');
  host.className = 'brand__mark';
  host.appendChild(seal(size, 'Sanayacorp'));
  return host;
}

/** Large seal for the About panel. */
export function brandPlate(size = 64): HTMLElement {
  const host = document.createElement('div');
  host.className = 'brand-plate';
  host.appendChild(seal(size, 'Aegis Sound Lab — Sanayacorp'));
  return host;
}
