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

## Two targets, two security models

The website and the Android app are deliberately **not** hardened the same way.
They have different threat models: the web build is exposed to the internet and
must survive hostile pages and injected markup; the APK runs offline with no
server, so HTTP headers are meaningless there and the defence moves to the
native manifest.

### A. Web build (Vercel)

| Layer | Control |
| --- | --- |
| Transport | HSTS `max-age=63072000; includeSubDomains; preload`, `upgrade-insecure-requests` |
| Scripts | CSP `script-src 'self'` — no inline, no `eval`, no third-party origins |
| Styles | CSP `style-src 'self'` — splash CSS lives in `/boot.css`, dynamic styling goes through CSSOM |
| Markup sinks | `require-trusted-types-for 'script'` + one `aegis` policy (DOMPurify 3.4) |
| Isolation | `COOP: same-origin`, `COEP: credentialless`, `CORP: same-origin`, `Origin-Agent-Cluster: ?1` |
| Embedding | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Referrers | `Referrer-Policy: no-referrer` |
| Features | Permissions-Policy denies camera, microphone, geolocation, USB, serial, payment, MIDI, HID, idle detection, ad APIs |
| Integrity | Every module script and stylesheet signed `sha384` at build (`tools/sri.mjs`) |
| Offline shell | Service worker: same-origin GET only, `/api/*` never cached, `no-store` bypasses |
| Reporting | CSP violations POST to `/api/csp-report`; query strings stripped, directive + origin + line only |
| Metadata | `/.well-known/security.txt`, `robots.txt` blocking `/api/` |

### B. Android APK (Capacitor)

There is no HTTP server inside the APK, so none of the headers above exist.
Applied by `tools/android-harden.mjs` right after `cap sync`, and asserted in CI:

| Layer | Control |
| --- | --- |
| Sandbox | WebView serves bundled assets from `https://localhost`; `allowNavigation: []` |
| Network | `android:usesCleartextTraffic="false"` + `network_security_config.xml` denying cleartext for every host |
| Backup | `android:allowBackup="false"`, `fullBackupContent="false"`, `data_extraction_rules.xml` excluding cloud backup **and** device transfer |
| Debugging | `webContentsDebuggingEnabled: false`, `allowMixedContent: false`, `captureInput: false` |
| Permissions | Dangerous runtime permissions stripped from the manifest; build fails if any remain (camera, mic, location, contacts, SMS, storage, Bluetooth, sensors, notifications, QUERY_ALL_PACKAGES) |
| Components | Only `MainActivity` may be exported; build fails otherwise |
| Markup sinks | Same Trusted Types policy + DOMPurify as web (the bundle is shared) |
| Integrity | Same sha384 SRI attributes; assets ship inside the APK |
| Service worker | **Not registered** on native — bundled assets already exist, a SW would only add a stale-cache failure mode |

The in-app panel (**System → 05 SECURITY**) changes its label and its checks
depending on where it runs: `SECURITY · WEB` reads the live response headers,
`SECURITY · APP` reports sandbox, manifest guarantees, and the absent service
worker.

### Why Trusted Types is enforced, not report-only
Every HTML sink in `src/` goes through `setHtml()` in `src/security/sanitize.ts`.
The Trusted Types policy is the only object that can produce TrustedHTML, and it
sanitises with a fixed allowlist (no script/iframe/form/style/link tags, no `src`
or `href` attributes, no event handlers). With `require-trusted-types-for
'script'` enforced, a future refactor that assigns `innerHTML` directly fails
closed instead of silently becoming an XSS vector.


## Out of scope

- Denial of service against your own device by feeding enormous files (the app
  decodes locally; memory limits are the browser's).
- Anyone with physical access to an unlocked device reading exported audio.
- The Android APK's signing key (debug builds are for sideloading only).

## Supported versions

Only the deployed Vercel build and the latest GitHub Actions artifact are
supported. Older preview deployments are deleted rather than patched.
