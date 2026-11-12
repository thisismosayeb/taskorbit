// WCAG contrast-ratio helpers (Part 3, §6).
//
// Pure functions — no DOM — so the token pairs for both themes are
// asserted in tests/unit/theme-contrast.test.ts. Ratios below are the
// values that test pins (measured with this same code):
//   light: ink #182039 on bg #F7F9FE 15.28:1; muted #64748b on bg 4.52:1
//          and on surface #FFFFFF 4.76:1 (the old muted #7c87a0 was
//          3.42:1 / 3.60:1 — below AA — so it was darkened, see
//          globals.css); primary #6658f5 on white 4.91:1; white on
//          primary 4.91:1; deadline chips green 6.49:1, red 5.30:1,
//          amber 6.37:1.
//   dark:  ink #F4F7FF on bg #090E1C 17.96:1 and on surface #121A2B
//          16.22:1; muted #9AA7C4 on bg 7.97:1, on surface 7.20:1;
//          deadline chips green-300 9.08:1, red-300 7.43:1,
//          amber-300 8.78:1 (300-weight text on a 15% translucent fill
//          over --surface); role accent indigo-light #8B7FF7 on surface
//          5.36:1.
// The 15% translucent fills are blended over --surface for the ratio
// (a translucent fill over a known background has an exact effective
// colour). All pairs above meet WCAG AA (4.5:1) for normal text.

/** Relative luminance of an sRGB hex colour (WCAG 2.x definition). */
export function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const channel = (index: number): number => {
    const value = parseInt(normalized.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two hex colours, e.g. 4.52. */
export function contrastRatio(foreground: string, background: string): number {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

/** Effective hex colour of a translucent `foreground` over `background`. */
export function blendOver(foreground: string, background: string, alpha: number): string {
  const parse = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const fg = parse(foreground);
  const bg = parse(background);
  const mixed = fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** True when the pair meets WCAG AA for normal text (4.5:1). */
export function meetsAa(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 4.5;
}
