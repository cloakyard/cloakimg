# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in CloakIMG, please **do not** open a public GitHub issue.

Instead, report it privately via [GitHub Security Advisories](https://github.com/cloakyard/cloakimg/security/advisories/new).

You can expect:

- **Acknowledgement** within 48 hours
- **Status update** within 7 days
- Credit in the advisory once the fix is released (if desired)

## Security Model

CloakIMG is a **client-side only** application — every image edit, filter, redaction, background removal, and export happens in your browser. No image data is transmitted to any server. The attack surface is limited to:

- Third-party npm dependencies (monitored via automated CI security audits and Dependabot)
- Browser sandbox escape (out of scope — report to the browser vendor)
- WebAssembly modules bundled with the app (libheif-js for HEIC decode) — served from the same origin under hashed filenames

## Dependency Vulnerabilities

Known dependency vulnerabilities are tracked automatically via:

- **GitHub Dependabot** — daily checks against the GitHub Advisory Database
- **OSV-Scanner** — weekly CI workflow against the Open Source Vulnerabilities database

If you spot one that has not been addressed, please follow the disclosure process above.

## Defence-in-Depth Controls

- **Content Security Policy** — declared via `<meta http-equiv="Content-Security-Policy">` in [`index.html`](./index.html). `connect-src` is restricted to the application origin so the page cannot upload pixel data elsewhere. `script-src` disallows remote scripts, `object-src` is `'none'`, and `form-action` is pinned to `'self'`.
- **Subresource integrity** — all first-party JavaScript and WebAssembly is bundled and served from the same origin under hashed filenames.
- **Local-only persistence** — recent files, autosave drafts, and EXIF data live in `IndexedDB` and `localStorage` on the user's device; nothing is sent over the wire.
- **One-tap EXIF stripping** — the export modal exposes per-field toggles (GPS, camera info, timestamps) so the user can scrub identifying metadata before download.
- **No tracking or analytics** — the page makes no third-party network requests at runtime.

_Last reviewed: 2026-05-02._
