# Hitchcock Harness · the logo

Two lowercase h's drawn as one line with round ends. The first stands with its legs down; its right leg turns the corner at the foot and runs on to become the second h, which lies with its legs to the right.

## The drawing

One path on a grid where an h is 10 tall and 6 wide, the stroke 2.3 thick with round ends and joins:

`M0,0 V10 M0,6.5 A3,3 0 0 1 6,6.5 V10 H18 M14.5,10 A3,3 0 0 1 14.5,4 H18`

The mark is wider than tall (about 20 by 12). Colours: near black `#09090B` and off white `#fafafa`.

## final/

| File | What it is |
|---|---|
| `hh-mark.svg` | The mark, taking the colour of the text round it |
| `hh-mark-black.svg`, `hh-mark-white.svg`, `hh-mark-black.pdf` | The mark in a fixed colour; the PDF for print |
| `hh-mark-light-weight.svg` | The same mark with a thinner line, for large sizes |
| `hh-icon-dark.svg`, `hh-icon-light.svg` | The app icon, a rounded square |
| `hh-icon-dark-square.svg` | The icon with square corners, for iOS, which rounds it itself |
| `hh-icon-dark-maskable.svg` | The icon with a wider margin, for Android's shaped icons |
| `hh-favicon.svg` | The browser tab icon: the mark larger in its square |
| `png/` | The mark at 2000 wide and the icons at 512 and 1024 |

## Where the app uses it

- The sidebar: `IconLogo` in `src/components/shell/icons.tsx` (the same path).
- The browser tab: `src/app/favicon.ico` and `public/icons/favicon.svg`.
- The phone's home screen: `public/icons/apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, all made from the files in `final/` with `rsvg-convert -w <size>`.
