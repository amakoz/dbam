# Visual directions: proposed token values

These are the candidate values for `src/styles/global.css` (`:root` / `.dark`). They come from the external research of 2026-09-30, summarised in `research.md` §D. **None is chosen yet**; the user picks one in `/10x-plan`.

Each block replaces the colour and radius lines in the current `:root` and `.dark` blocks. It keeps the existing `@theme inline` mapping and adds tier and success tokens. Every value is inside the sRGB gamut. The contrast ratios in the table were computed in Python: oklch → sRGB, then the WCAG 2.x luminance ratio. **Not checked:** contrast for colours with opacity (e.g. `ring/50`), and how Polish diacritics actually render in each font.

| Pair (AA needs 4.5:1 for text) | A light / dark | B light / dark | C light / dark |
| --- | --- | --- | --- |
| `foreground` on `background` | 14.5 / 15.0 | 15.7 / 15.6 | 15.6 / 15.7 |
| `primary-foreground` on `primary` | 6.3 / 8.1 | 6.4 / 8.3 | 11.9 / 11.2 |
| `muted-foreground` on `muted` | 5.3 / 6.3 | 5.6 / 6.5 | 5.4 / 6.6 |
| `tier-N-foreground` on `tier-N` | 7.1–7.8 / 8.9–9.5 | 7.1–7.9 / 8.9–9.2 | 6.7–7.3 / 8.9–9.5 |

- `--tier-N-solid` (dots and borders, not text) is at least 3:1 against `card`.
- `--destructive` is at least 5.3:1 against both `background` and `card`.
- `--input` is darkened so field outlines reach at least 3:1 (WCAG 1.4.11). The shadcn default is about 1.3:1.

## A: "Len i szałwia" (linen and sage): warm, natural, editorial

- **Fonts:** Fraunces 500–600 for headings (soft, not "wonky"); Figtree for body and UI.
- **Density:** 0.875rem radius; spacious cards, one idea per card.

```css
:root{
  --radius:0.875rem;
  --background:oklch(0.985 0.008 85); --foreground:oklch(0.27 0.015 60);
  --card:oklch(0.995 0.004 85); --card-foreground:oklch(0.27 0.015 60);
  --popover:oklch(0.995 0.004 85); --popover-foreground:oklch(0.27 0.015 60);
  --primary:oklch(0.47 0.07 165); --primary-foreground:oklch(0.985 0.008 85);
  --secondary:oklch(0.945 0.018 150); --secondary-foreground:oklch(0.33 0.05 165);
  --muted:oklch(0.955 0.01 80); --muted-foreground:oklch(0.50 0.015 65);
  --accent:oklch(0.94 0.025 75); --accent-foreground:oklch(0.27 0.015 60);
  --destructive:oklch(0.52 0.16 30);
  --border:oklch(0.90 0.012 80); --input:oklch(0.64 0.014 80); --ring:oklch(0.55 0.08 165);
  --tier-1:oklch(0.95 0.045 80);  --tier-1-foreground:oklch(0.42 0.09 65);  --tier-1-solid:oklch(0.62 0.12 70);
  --tier-2:oklch(0.95 0.03 160);  --tier-2-foreground:oklch(0.40 0.06 165); --tier-2-solid:oklch(0.60 0.08 165);
  --tier-3:oklch(0.95 0.01 250);  --tier-3-foreground:oklch(0.42 0.02 250); --tier-3-solid:oklch(0.62 0.02 250);
  --success:oklch(0.50 0.09 150);
}
.dark{
  --background:oklch(0.19 0.01 70); --foreground:oklch(0.93 0.01 85);
  --card:oklch(0.23 0.012 70); --card-foreground:oklch(0.93 0.01 85);
  --popover:oklch(0.23 0.012 70); --popover-foreground:oklch(0.93 0.01 85);
  --primary:oklch(0.74 0.08 165); --primary-foreground:oklch(0.20 0.02 165);
  --secondary:oklch(0.28 0.02 160); --secondary-foreground:oklch(0.90 0.02 150);
  --muted:oklch(0.26 0.01 70); --muted-foreground:oklch(0.72 0.015 75);
  --accent:oklch(0.29 0.015 70); --accent-foreground:oklch(0.93 0.01 85);
  --destructive:oklch(0.68 0.15 30);
  --border:oklch(0.32 0.012 70); --input:oklch(0.54 0.012 70); --ring:oklch(0.62 0.08 165);
  --tier-1:oklch(0.30 0.05 70);  --tier-1-foreground:oklch(0.87 0.09 80);  --tier-1-solid:oklch(0.75 0.12 75);
  --tier-2:oklch(0.29 0.04 165); --tier-2-foreground:oklch(0.86 0.06 160); --tier-2-solid:oklch(0.70 0.08 165);
  --tier-3:oklch(0.28 0.015 250);--tier-3-foreground:oklch(0.86 0.02 250); --tier-3-solid:oklch(0.68 0.02 250);
  --success:oklch(0.72 0.10 150);
}
```

## B: "Spokojny błękit" (calm civic blue): official-feeling, softer than IKP

- **Fonts:** Atkinson Hyperlegible Next for everything. Source Serif 4 is optional for long reads.
- **Density:** 0.5rem radius; list rows with dividers, the densest of the three.

```css
:root{
  --radius:0.5rem;
  --background:oklch(0.985 0.004 230); --foreground:oklch(0.24 0.025 245);
  --card:oklch(1 0 0); --card-foreground:oklch(0.24 0.025 245);
  --popover:oklch(1 0 0); --popover-foreground:oklch(0.24 0.025 245);
  --primary:oklch(0.47 0.09 235); --primary-foreground:oklch(0.985 0.004 230);
  --secondary:oklch(0.95 0.015 230); --secondary-foreground:oklch(0.32 0.05 240);
  --muted:oklch(0.96 0.006 230); --muted-foreground:oklch(0.49 0.02 245);
  --accent:oklch(0.945 0.02 210); --accent-foreground:oklch(0.24 0.025 245);
  --destructive:oklch(0.53 0.17 28);
  --border:oklch(0.91 0.01 235); --input:oklch(0.64 0.015 240); --ring:oklch(0.55 0.10 235);
  --tier-1:oklch(0.955 0.045 85);  --tier-1-foreground:oklch(0.43 0.09 65);   --tier-1-solid:oklch(0.62 0.12 72);
  --tier-2:oklch(0.95 0.025 235);  --tier-2-foreground:oklch(0.40 0.08 240);  --tier-2-solid:oklch(0.60 0.09 235);
  --tier-3:oklch(0.955 0.005 245); --tier-3-foreground:oklch(0.43 0.015 245); --tier-3-solid:oklch(0.65 0.015 245);
  --success:oklch(0.50 0.10 155);
}
.dark{
  --background:oklch(0.20 0.02 245); --foreground:oklch(0.95 0.005 230);
  --card:oklch(0.24 0.022 245); --card-foreground:oklch(0.95 0.005 230);
  --popover:oklch(0.24 0.022 245); --popover-foreground:oklch(0.95 0.005 230);
  --primary:oklch(0.75 0.09 225); --primary-foreground:oklch(0.20 0.03 245);
  --secondary:oklch(0.29 0.025 240); --secondary-foreground:oklch(0.92 0.01 230);
  --muted:oklch(0.27 0.02 245); --muted-foreground:oklch(0.74 0.02 240);
  --accent:oklch(0.30 0.03 225); --accent-foreground:oklch(0.95 0.005 230);
  --destructive:oklch(0.68 0.16 28);
  --border:oklch(0.33 0.02 245); --input:oklch(0.54 0.02 245); --ring:oklch(0.62 0.09 230);
  --tier-1:oklch(0.31 0.05 75);   --tier-1-foreground:oklch(0.88 0.09 85);   --tier-1-solid:oklch(0.78 0.12 78);
  --tier-2:oklch(0.30 0.05 240);  --tier-2-foreground:oklch(0.86 0.06 235);  --tier-2-solid:oklch(0.70 0.09 235);
  --tier-3:oklch(0.29 0.012 245); --tier-3-foreground:oklch(0.86 0.012 245); --tier-3-solid:oklch(0.68 0.015 245);
  --success:oklch(0.72 0.11 155);
}
```

## C: "Poranek" (morning): navy with a sunny accent, friendly

- **Fonts:** Manrope for headings, Inter for body.
- **Density:** 1rem radius; rounded cards and pill buttons.
- In dark mode the primary colour flips to butter yellow.

```css
:root{
  --radius:1rem;
  --background:oklch(0.99 0.004 95); --foreground:oklch(0.25 0.03 265);
  --card:oklch(1 0 0); --card-foreground:oklch(0.25 0.03 265);
  --popover:oklch(1 0 0); --popover-foreground:oklch(0.25 0.03 265);
  --primary:oklch(0.33 0.06 262); --primary-foreground:oklch(0.99 0.004 95);
  --secondary:oklch(0.96 0.04 90); --secondary-foreground:oklch(0.38 0.07 70);
  --muted:oklch(0.965 0.006 260); --muted-foreground:oklch(0.50 0.025 262);
  --accent:oklch(0.93 0.07 92); --accent-foreground:oklch(0.25 0.03 265);
  --destructive:oklch(0.54 0.17 28);
  --border:oklch(0.915 0.01 260); --input:oklch(0.66 0.015 262); --ring:oklch(0.55 0.10 262);
  --tier-1:oklch(0.95 0.03 62);   --tier-1-foreground:oklch(0.45 0.11 50);  --tier-1-solid:oklch(0.62 0.13 55);
  --tier-2:oklch(0.95 0.03 230);  --tier-2-foreground:oklch(0.42 0.08 240); --tier-2-solid:oklch(0.64 0.10 235);
  --tier-3:oklch(0.955 0.01 90);  --tier-3-foreground:oklch(0.44 0.02 80);  --tier-3-solid:oklch(0.66 0.02 80);
  --success:oklch(0.52 0.11 155);
}
.dark{
  --background:oklch(0.20 0.025 265); --foreground:oklch(0.95 0.005 95);
  --card:oklch(0.24 0.03 265); --card-foreground:oklch(0.95 0.005 95);
  --popover:oklch(0.24 0.03 265); --popover-foreground:oklch(0.95 0.005 95);
  --primary:oklch(0.88 0.10 92); --primary-foreground:oklch(0.25 0.03 265);
  --secondary:oklch(0.29 0.03 265); --secondary-foreground:oklch(0.92 0.01 95);
  --muted:oklch(0.28 0.025 265); --muted-foreground:oklch(0.75 0.02 262);
  --accent:oklch(0.31 0.035 265); --accent-foreground:oklch(0.95 0.005 95);
  --destructive:oklch(0.68 0.16 28);
  --border:oklch(0.33 0.025 265); --input:oklch(0.54 0.025 265); --ring:oklch(0.75 0.09 92);
  --tier-1:oklch(0.32 0.06 55);   --tier-1-foreground:oklch(0.88 0.08 65);  --tier-1-solid:oklch(0.78 0.12 60);
  --tier-2:oklch(0.30 0.05 240);  --tier-2-foreground:oklch(0.86 0.06 230); --tier-2-solid:oklch(0.72 0.09 235);
  --tier-3:oklch(0.29 0.012 90);  --tier-3-foreground:oklch(0.87 0.015 90); --tier-3-solid:oklch(0.70 0.02 85);
  --success:oklch(0.74 0.12 155);
}
```

## Registering the new tokens (all directions)

Add to `@theme inline`, so that `bg-tier-1`, `text-tier-1-foreground`, `border-tier-1-solid` and `text-success` exist. This follows shadcn's documented pattern for adding a token.

```css
--color-tier-1:var(--tier-1); --color-tier-1-foreground:var(--tier-1-foreground); --color-tier-1-solid:var(--tier-1-solid);
--color-tier-2:var(--tier-2); --color-tier-2-foreground:var(--tier-2-foreground); --color-tier-2-solid:var(--tier-2-solid);
--color-tier-3:var(--tier-3); --color-tier-3-foreground:var(--tier-3-foreground); --color-tier-3-solid:var(--tier-3-solid);
--color-success:var(--success);
```

Also remove `@utility bg-cosmic`, and remap or delete the unused `--chart-*` and `--sidebar-*` values (the stock dark set has purple `--chart-4` and indigo `--sidebar-primary`).
