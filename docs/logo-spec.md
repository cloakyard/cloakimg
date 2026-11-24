# CloakIMG logo assets

A warm white picture frame holds two overlapping coral ridges and a raised sun.

| Asset                                | Use                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `public/cloakimg-mark.svg`           | 64×64 circular mark for page headers, the family directory and social cards |
| `public/icons/favicon.svg`           | Simplified 16×16 browser-tab drawing                                        |
| `public/icons/safari-pinned-tab.svg` | Monochrome silhouette for Safari                                            |
| `public/icons/logo.svg`              | Opaque launcher master for PWA, Apple touch and legacy ICO files            |

The web mark has a 60-unit disc on a 64-unit canvas, a raised rim and light from the upper left. Its embedded dark appearance follows the system theme. The dedicated tab drawing uses the same dark coral gradient. Keep the frame, ridges and sun together when placing the mark in headers.

The launcher extends the enamel to all four corners. Its foreground fits inside the 40%-radius maskable safe zone. Run `vp run generate-icons` to rebuild the install assets. After a production build, run `vp run generate-og` and rebuild to include the new social card.
