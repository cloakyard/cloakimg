# CloakIMG brand colour and Air

[DESIGN.md](../DESIGN.md) owns the product UI. Buttons, links (including hover and visited), navigation, dialogs and fields use neutral Air ink and surfaces. Blue is reserved for the family focus/selection markers specified by Air.

Sunset coral identifies the launcher logo and the finite photographic crop-frame illustration. It is not a general-purpose UI accent. The existing logo gradient remains `#ff7d54` → `#f5613a` → `#b8371a`, as encoded in `public/icons/logo.svg` and `favicon.svg`. User-selected drawing colours, functional canvas handles, histogram channels and exported pixels retain their own colours.

The logo assets are unchanged. Regenerate their PNG derivatives only when their SVG sources change; see [logo-spec.md](logo-spec.md). The social preview uses [artwork/social.json](../artwork/social.json) and the shared Air template, rendered by `vp run generate-og` from the built landing landscape. See [the portable workflow](air/social-previews.md). Store/README screenshots come from the actual editor via `vp run generate-screenshots`.
