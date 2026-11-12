// WCAG AA contrast (Part 3, §6) — the pairs below are the actual tokens
// from app/globals.css (:root / .dark) and the deadline-chip/badge colours
// in components/ui/badge.tsx and components/dashboard/deadline-chip.tsx.
// If a token changes, update this test with it; do not relax the 4.5:1
// bar for normal text.
import { describe, expect, it } from "vitest";
import { blendOver, contrastRatio, meetsAa } from "@/lib/theme/contrast";

const AA = 4.5;

describe("light theme", () => {
  it("ink and muted text pass AA on the page background and surfaces", () => {
    expect(contrastRatio("#182039", "#F7F9FE")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio("#64748B", "#F7F9FE")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio("#182039", "#FFFFFF")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio("#64748B", "#FFFFFF")).toBeGreaterThanOrEqual(AA);
  });

  it("primary passes AA on white and white passes AA on primary", () => {
    expect(contrastRatio("#6658F5", "#FFFFFF")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio("#FFFFFF", "#6658F5")).toBeGreaterThanOrEqual(AA);
  });

  it("deadline chips pass AA (800/700 text on 100 fills)", () => {
    expect(meetsAa("#166534", "#DCFCE7")).toBe(true); // green-800 / green-100
    expect(meetsAa("#B91C1C", "#FEE2E2")).toBe(true); // red-700 / red-100
    expect(meetsAa("#92400E", "#FEF3C7")).toBe(true); // amber-800 / amber-100
    expect(meetsAa("#475569", "#F1F5F9")).toBe(true); // slate-600 / slate-100
    expect(meetsAa("#DC2626", "#FFFFFF")).toBe(true); // red-600 on white
  });
});

describe("dark theme", () => {
  it("ink and muted text pass AA on the dark background and surfaces", () => {
    expect(contrastRatio("#F4F7FF", "#090E1C")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio("#9AA7C4", "#090E1C")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio("#F4F7FF", "#121A2B")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio("#9AA7C4", "#121A2B")).toBeGreaterThanOrEqual(AA);
  });

  it("primary-light passes AA on the dark surface", () => {
    expect(contrastRatio("#8B7FF7", "#121A2B")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio("#FFFFFF", "#6658F5")).toBeGreaterThanOrEqual(AA);
  });

  it("dark deadline chips pass AA (300 text on 15% translucent fills)", () => {
    // The fill is a 15%-alpha colour over the dark surface; blendOver
    // resolves it to the colour the eye actually sees.
    const surface = "#121A2B";
    const chip = (text: string, fill: string) =>
      contrastRatio(text, blendOver(fill, surface, 0.15));
    expect(chip("#86EFAC", "#22C55E")).toBeGreaterThanOrEqual(AA); // green
    expect(chip("#FCA5A5", "#EF4444")).toBeGreaterThanOrEqual(AA); // red
    expect(chip("#FCD34D", "#F59E0B")).toBeGreaterThanOrEqual(AA); // amber
    expect(chip("#5EEAD4", "#14B8A6")).toBeGreaterThanOrEqual(AA); // teal
    expect(chip("#67E8F9", "#06B6D4")).toBeGreaterThanOrEqual(AA); // cyan
    expect(chip("#CBD5E1", "#FFFFFF")).toBeGreaterThanOrEqual(AA); // slate
  });

  it("role-accent and status colours pass AA on the dark surface", () => {
    expect(contrastRatio("#4ADE80", "#121A2B")).toBeGreaterThanOrEqual(AA); // success
    expect(contrastRatio("#FBBF24", "#121A2B")).toBeGreaterThanOrEqual(AA); // warning
    expect(contrastRatio("#F87171", "#121A2B")).toBeGreaterThanOrEqual(AA); // danger
  });
});
