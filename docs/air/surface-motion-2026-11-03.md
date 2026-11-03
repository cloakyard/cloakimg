# Air 1.5.0 — surface motion, 2026-11-03

Shared Base UI dialog presence, compact tool-pane exits and anchored Tap-to-fix dismissal. Retained controls cannot register stale pending edits; AI consent, 40% canvas and output are preserved.

Dialogs use 240ms entry/160ms exit; small surfaces use 180ms/160ms. Reduced motion is immediate. No animation dependency was added. Typing and selection remain immediate.

## Verification

- 416 all-tool observations per engine (Chrome and WebKit), including all 26 tools, light/dark, short landscape and 200% text, passed.

- 488 unit tests passed.
- 20 normal-motion Apply/Cancel/history/PNG journeys passed.
- 8 normal-motion switch/choice/Tap-to-fix control journeys without AI requests passed.
- 12 PNG output pixel hashes, dimensions and transparency identical to preceding production passed.
- Real-worker two-tab update protection passed.

The six-site comparison passes 648 home/288 secondary layouts, 408 privacy layouts and 22 navigation journeys. The three PWAs match in 396 real-worker notice layouts. Shared presence passed 170 Chrome/WebKit observations plus the focused final regression pass.

See [the family audit](https://github.com/cloakyard/cloakyard/blob/main/docs/air/family-motion-2026-11-03.md) and local evidence. Physical iPhone/software-keyboard, OS IME and spoken assistive acceptance remain open; automated WebKit does not close them. The recorded product backlog is unchanged.

## Rollout

Passing local piece prepared for an individual dev → main PR; production verification is recorded in the central handoff after merge.
