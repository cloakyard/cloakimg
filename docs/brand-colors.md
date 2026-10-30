# CloakIMG brand colour and Air

[DESIGN.md](../DESIGN.md) owns the product UI. Buttons, links (including hover and visited), navigation, dialogs and fields use neutral Air ink and surfaces. Blue is reserved for the family focus/selection markers specified by Air.

Sunset coral identifies the launcher logo and the finite photographic crop-frame illustration. It is not a general-purpose UI accent. The existing logo gradient remains `#ff7d54` → `#f5613a` → `#b8371a`, as encoded in `public/icons/logo.svg` and `favicon.svg`. User-selected drawing colours, functional canvas handles, histogram channels and exported pixels retain their own colours.

The logo assets are unchanged. Regenerate their PNG derivatives only when their SVG sources change; see [logo-spec.md](logo-spec.md). The social preview has one source, [scripts/og-image.html](../scripts/og-image.html), rendered by `node scripts/build-og-image.mjs` using local Air CSS, the logo and the landing photograph. Store/README screenshots come from the actual editor via `vp run generate-screenshots`.
