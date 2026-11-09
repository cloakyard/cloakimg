# Component corners — 2026-11-09

Air 1.7.1 now gives model choices, layer actions, HSL controls, badges, feedback,
batch/recent tiles and palette swatches their shared role geometry. Attached mobile
working panes are flush. Generic download/retry actions use shared Air buttons.
Five unused exports are file-private; their live implementations are preserved.

The enlarged-text audit also caught split labels in Selective colour and Remove
BG, plus crowded ID-photo helper text. Actions now wrap as whole controls; the
background shortcut has separate help text and a concise button.

Validation passes: 488 units; required check/type/build/dead-code/design/portability;
all 26 tools in 1,560 Chromium observations across eleven sizes plus enlarged
phone/laptop text and both themes, and 480 WebKit observations across four layout
classes. The three reflow corrections pass 260 Chromium and 100 WebKit observations.
The Remove BG action also retains its intrinsic wrapped height in the scrollable
panel. A stronger nested-button clipping check passes a further 120 all-tool
enlarged-laptop observations and 180 Remove BG observations.
The original ten failing observations are retained in the central evidence; the
final per-state receipt replaces affected observations with their passing reruns.

Additional coverage: 204 entry/recovery states; 176 batch states with 44 actual ZIP
downloads; ten real-component feedback fixtures with touch/corner/overflow/callback
checks; eight compact completion journeys; 12 actual PNG downloads with decoded
pixels identical to the pre-upgrade baseline. After the last build, output parity,
completion journeys and 54 cross-editor comparisons were repeated successfully.

Shared family coverage passes: 648 home, 288 secondary and 408 privacy layouts;
132 full cross-editor state comparisons; 264 dialog/classic-scrollbar cases;
396 real-worker PWA notice layouts and 74 surface-motion observations. The complete
per-view ledger and reviewed images are in Cloakyard's
`docs/air/component-corners-2026-11-09.md`.

Output pixels, artwork and processing remain unchanged. Feedback fixtures test UI
states, not inference. Physical-device, OS keyboard/IME, real zoom and spoken
assistive acceptance remain separate. The PR records exact-main deployment and
dev synchronization after merge.
