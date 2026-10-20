import DOMPurify from 'dompurify';

/**
 * Hardened HTML sinks.
 *
 * Every `innerHTML` in the app goes through here so the page can run with
 * `require-trusted-types-for 'script'` (CSP Level 3). The Trusted Types policy
 * is the single choke point: even if a future refactor interpolates untrusted
 * text, the string is sanitised by DOMPurify before it becomes markup.
 *
 * In environments without Trusted Types (jsdom, older WebViews) the same
 * sanitiser runs and a plain string is assigned, so behaviour is identical.
 */

const ALLOWED_TAGS = [
  'span', 'b', 'i', 'em', 'strong', 'small', 'br', 'p', 'div', 'label', 'code', 'kbd',
  'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'defs', 'use',
];

const ALLOWED_ATTR = [
  'class', 'id', 'role', 'style', 'title', 'aria-label', 'aria-hidden', 'aria-live',
  'viewbox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2',
  'points', 'transform', 'preserveaspectratio',
];

const CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: true,
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'],
  FORBID_ATTR: ['src', 'srcset', 'href', 'xlink:href', 'formaction', 'ping', 'onerror', 'onload'],
};

type PolicyLike = { createHTML: (input: string) => unknown };

let policy: PolicyLike | null = null;
let policyResolved = false;

function getPolicy(): PolicyLike | null {
  if (policyResolved) return policy;
  policyResolved = true;
  if (typeof window === 'undefined') return null;
  const tt = (window as unknown as { trustedTypes?: { createPolicy?: unknown } }).trustedTypes;
  if (!tt || typeof tt.createPolicy !== 'function') return null;
  try {
    policy = (tt.createPolicy as (name: string, rules: unknown) => PolicyLike)('aegis', {
      createHTML: (input: string) => DOMPurify.sanitize(input, CONFIG),
    });
  } catch {
    // A policy with this name already exists (hot reload) — reuse it if we can.
    policy = null;
  }
  return policy;
}

/** Sanitised markup as TrustedHTML when the platform supports it. */
export function safeHtml(html: string): unknown {
  const active = getPolicy();
  if (active) {
    try {
      return active.createHTML(html);
    } catch {
      // Fall through to the plain path below.
    }
  }
  return DOMPurify.sanitize(html, CONFIG);
}

/** The only sanctioned way to assign markup to a node. */
export function setHtml(node: HTMLElement, html: string): void {
  const safe = safeHtml(html);
  try {
    node.innerHTML = safe as unknown as string;
  } catch {
    // Last resort: never let a policy rejection take the whole screen down.
    document.documentElement.dataset.htmlFallback = '1';
    node.textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

/**
 * True when this document is *required* to use Trusted Types.
 *
 * Read from the CSP the server actually sent rather than probing with a
 * deliberate violation — a probe would fire a report on every page load and
 * burn a serverless invocation for nothing.
 */
export function trustedTypesEnforced(csp = ''): boolean {
  return csp.toLowerCase().includes("require-trusted-types-for 'script'");
}

/** True when the platform exposes the Trusted Types API at all. */
export function trustedTypesSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const tt = (window as unknown as { trustedTypes?: unknown }).trustedTypes;
  return Boolean(tt);
}
