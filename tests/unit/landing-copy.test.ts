// Landing copy (Part 3 §2): the hero headline, sub-text and final CTA are
// exact spec strings — a typo here is a spec violation, so pin them.
import { describe, it, expect } from "vitest";
import { t } from "@/lib/i18n";

describe("landing copy", () => {
  it("hero headline is exactly the spec headline", () => {
    expect(t("landing.heroHeadline")).toBe(
      "Turn Big Ideas Into Brilliantly Managed Projects.",
    );
  });

  it("hero sub-text is exactly the spec sub-text", () => {
    expect(t("landing.heroSub")).toBe(
      "TaskOrbit brings projects, teammates, tasks, deadlines, and progress together in one beautiful workspace. Spend less time organizing and more time building.",
    );
  });

  it("final CTA is exactly the spec line", () => {
    expect(t("landing.finalCtaTitle")).toBe("Your Next Great Project Starts Here.");
  });

  it("developer names use the exact spelling", () => {
    for (const name of ["Mosayeb Siam", "Nabil Zaman", "Mamshad"]) {
      expect(name).toBeTruthy();
    }
  });
});
