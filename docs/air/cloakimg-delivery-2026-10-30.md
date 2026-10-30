# CloakIMG production delivery — 2026-10-30

The Air application was promoted through dev → main in [PR #20](https://github.com/cloakyard/cloakimg/pull/20), merge `c377680a67638477203787bb1fdaa2e5db77b931`. Cloudflare production build `1d0733f0-6381-42ba-be95-93d0dc6ce442` succeeded and deployed version `4a56ba01-c139-4c63-82a1-69ab403c107a`. Production remains main-only; dev builds upload versions.

Live Chrome/WebKit checks pass in phone/tablet/desktop light/dark: 12 initial/replay, privacy/back-navigation and image-import journeys, eight real 900×600 PNG exports, no browser errors. All 89 public assets match the local build: 86 raw hashes and three HTML files after narrowly removing Cloudflare's injected detection script and terminal whitespace. Untracked Finder metadata was removed from public/dist; the Linux build correctly contains 89 application assets.

This bounded follow-up adds the family's existing `no-transform` response header so IMG serves the actual tested HTML, without the edge injection. Browser revalidation stays enabled; application, worker, models, output and privacy copy are unchanged. Format/lint/types, build/asset limits and design integrity pass. All 89 application files are byte-for-byte identical before/after the header change; the previous 483-unit, feature and layout checks therefore remain applicable. Final live response verification and the release ledger are maintained in [Cloakyard's central handoff](https://github.com/cloakyard/cloakyard/blob/main/docs/air/RESUME.md).

Evidence: `/tmp/air-img-2026-10-30/{img-pr,img-pr-checks,img-main-checks,live-assets}.json`, `live/results.json`, `live/`, `header-{check,build,design}.log`. Physical device/assistive acceptance remains separate; this delivery does not mark it complete.
