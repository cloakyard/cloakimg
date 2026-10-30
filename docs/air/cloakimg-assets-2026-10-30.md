# CloakIMG Air public assets — 2026-10-30

The social preview now shares the real logo, system typography, neutral Air colours, current headline and photo/crop-frame illustration. It has one local HTML source; the obsolete SVG/shader renderer and external font/network dependencies are removed. PWA and README screenshots capture the real refreshed editor using the landing photograph. The duplicate generated demo scene is removed. Capture dismisses the actual offline notice before framing the editor.

Manifest colours match Air light (`#fafbfc`), orientation supports landscape, and the description reflects the photo editor and ID sheets. README documents all five exports and the correct checked build command. Brand notes now defer to DESIGN.md and distinguish decorative logo/artwork colour from neutral controls and functional image data.

Checks: format/lint/types; 471 tests; TypeScript/build/PWA/91 public assets under 25 MiB; exact PNG dimensions (1200×630 social, 1290×2796 phone, 2732×2048 tablet) and manifest metadata. Social/phone/tablet rendered output inspected. Existing icon SVG/PNG branding remains unchanged. Evidence: `/tmp/air-img-2026-10-30/assets-*.log` and committed generated assets. Product acceptance continues with AI/runtime, output and cleanup.
