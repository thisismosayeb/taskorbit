// Liquid Progress (Part 3 §4): clamps 0–100, handles 0 and 100, NaN → 0.
import { describe, it, expect } from "vitest";
import { clampProgress } from "@/components/motion/liquid-progress";

describe("clampProgress", () => {
  it("passes through values inside 0–100", () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(67)).toBe(67);
    expect(clampProgress(100)).toBe(100);
    expect(clampProgress(66.67)).toBe(66.67);
  });

  it("clamps below 0 to 0 and above 100 to 100", () => {
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(150)).toBe(100);
    expect(clampProgress(-0.5)).toBe(0);
  });

  it("treats non-finite values as 0 (empty)", () => {
    expect(clampProgress(NaN)).toBe(0);
    expect(clampProgress(Infinity)).toBe(0);
    expect(clampProgress(-Infinity)).toBe(0);
  });

  it("0% means empty and 100% means completely full", () => {
    // The component renders no fill at 0 and a full fill at 100; the clamp
    // is the single source of truth for both variants.
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(100)).toBe(100);
  });
});
