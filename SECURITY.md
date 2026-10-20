# Security policy — EL TZY AEGIS-M

AEGIS-M is an offline-first audio tool with a thin license server. Audio never
leaves the device and there is no telemetry, but the web build does talk to four
small functions in `/api`: session, license issuance, health, and CSP reporting.
There is no database and no user record — a license is a signed string and a
session is a signed cookie. That keeps the server-side attack surface to
"verify an HMAC or say no", and leaves the rest of the work to the delivery
layer.

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
| Markup sinks | Same `setHtml()` + DOMPurify allowlist (the bundle is shared). Inside a WebView the policy is code-enforced, not browser-enforced, and the panel says so. |
| Integrity | Same sha384 SRI attributes; assets ship inside the APK |
| Service worker | **Not registered** on native — bundled assets already exist, a SW would only add a stale-cache failure mode |

The public in-app security panel was **removed in v8.5.0**. Nothing about the
delivery posture is rendered for ordinary visitors anymore; the checks moved to
the operator console at `#/control` (admin session required), which reads the
live response headers and the CSP report feed.

### Why Trusted Types is enforced, not report-only
Every HTML sink in `src/` goes through `setHtml()` in `src/security/sanitize.ts`.
The Trusted Types policy is the only object that can produce TrustedHTML, and it
sanitises with a fixed allowlist (no script/iframe/form/style/link tags, no `src`
or `href` attributes, no event handlers). With `require-trusted-types-for
'script'` enforced, a future refactor that assigns `innerHTML` directly fails
closed instead of silently becoming an XSS vector.


## C. License and session model

Deliberately database-free. The cost is that a key cannot be revoked
individually; the benefit is that there is no user table to leak.

| Layer | Control |
| --- | --- |
| License format | `AEGIS-<TIER>-<SERIAL4>-<YYYYMMDD>-<SIG6>`, `SIG6` = first 6 alphanumerics of `HMAC-SHA256(secret, "tier\|serial\|expires")` |
| Verification | Constant-time compare; tier, serial and date re-derived from the signature, so editing any field invalidates the key |
| Session | Cookie `aegis_sess`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, payload + HMAC signature, expiry inside the signed payload |
| Revocation | Rotate `AEGIS_SECRET` — every session and every issued key dies at once |
| Admin | Separate tier, only reachable by posting the password from `AEGIS_ADMIN_PASSWORD`; equal-length constant-time compare |
| Abuse | Sliding-window rate limit per IP on login and on key issuance; 10 keys per request, 30 requests per minute |
| Console | `#/control` is not linked in the navigation, requires an admin session, and every `/api/license` or `GET /api/csp-report` call is re-authorised server-side |
| Storage | Nothing persisted server-side except a 50-entry in-memory CSP ring buffer per instance |

**Client-side gating is not a security boundary**, and this document does not
pretend otherwise: the DSP, the presets and the encoders ship in the bundle, so a
determined user can patch the tier check. The license gates the *workflow* and
keeps an honest person honest; the thing being protected is the product, not a
secret. What the server does protect — minting keys and reading operator
telemetry — is enforced server-side, on every call.

## Out of scope

- Denial of service against your own device by feeding enormous files (the app
  decodes locally; memory limits are the browser's).
- Anyone with physical access to an unlocked device reading exported audio.
- The Android APK's signing key (debug builds are for sideloading only).
- A user patching the tier check in their own browser. See section C. The paid
  engines ship in the bundle by design; there is nothing server-side to steal.
- Someone who already holds `AEGIS_SECRET` or `AEGIS_ADMIN_PASSWORD`. Rotate
  both if either has been exposed outside the Vercel project.

## Supported versions

Only the deployed Vercel build and the latest GitHub Actions artifact are
supported. Older preview deployments are deleted rather than patched.
