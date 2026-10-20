# Security policy — EL TZY AEGIS-M

AEGIS-M is a static, offline-first audio tool. There is no account system, no
server-side audio processing and no telemetry. That removes most of the usual
attack surface, so the remaining work is about making the delivery layer as
hostile to injection as a browser currently allows.

## Reporting a vulnerability

Use GitHub private advisories:
<https://github.com/Sanycorp/Sancorp-X-Aliongcorp/security/advisories/new>

Please include the URL, the browser/version, and a minimal reproduction. Do not
open a public issue for anything that could be exploited before a fix ships.
Machine-readable contact details live at `/.well-known/security.txt` (RFC 9116).

## What ships in the web build

| Layer | Control |
| --- | --- |
| Transport | HSTS `max-age=63072000; includeSubDomains; preload`, `upgrade-insecure-requests` |
| Scripts | CSP `script-src 'self'` — no inline, no `eval`, no third-party origins |
| Styles | CSP `style-src 'self'` — the boot splash moved to `/boot.css`, inline `style` attributes are set through CSSOM only |
| Markup sinks | `require-trusted-types-for 'script'` with a single `aegis` policy that runs DOMPurify 3.4 before any `innerHTML` |
| Isolation | `COOP: same-origin`, `COEP: credentialless`, `CORP: same-origin`, `Origin-Agent-Cluster: ?1` |
| Embedding | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Referrers | `Referrer-Policy: no-referrer` |
| Features | Permissions-Policy denies camera, microphone, geolocation, USB, serial, payment, MIDI, HID, idle detection, ad APIs |
| Integrity | Every module script and stylesheet is signed `sha384` at build time (`tools/sri.mjs`) |
| Service worker | Same-origin GET only, `/api/*` never cached, `no-store`/`private` responses bypass the cache |
| Reporting | CSP violations POST to `/api/csp-report`, which strips query strings and keeps only directive + origin + line |
| Static metadata | `/.well-known/security.txt`, `robots.txt` blocking `/api/` |

### Why Trusted Types is enforced, not report-only

Every HTML sink in `src/` goes through `setHtml()` in `src/security/sanitize.ts`.
The Trusted Types policy is the only object that can produce TrustedHTML, and it
sanitises with a fixed allowlist (no script/iframe/form/style/link tags, no `src`
or `href` attributes, no event handlers). With `require-trusted-types-for
'script'` enforced, a future refactor that assigns `innerHTML` directly fails
closed instead of silently becoming an XSS vector.

The System screen has a live **SECURITY** panel that reads the actual response
headers, probes Trusted Types enforcement, counts SRI coverage and checks
cross-origin isolation — no claims that are not measured at runtime.

## Out of scope

- Denial of service against your own device by feeding enormous files (the app
  decodes locally; memory limits are the browser's).
- Anyone with physical access to an unlocked device reading exported audio.
- The Android APK's signing key (debug builds are for sideloading only).

## Supported versions

Only the deployed Vercel build and the latest GitHub Actions artifact are
supported. Older preview deployments are deleted rather than patched.
