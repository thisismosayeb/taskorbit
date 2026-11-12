// Chart colours from CSS variables (Part 3, §6).
//
// Recharts fills/strokes are SVG presentation values, so `var(--x)`
// cannot be passed as a plain attribute — the values have to be read
// from the computed style. `useChartColors()` reads the theme tokens
// from `:root` / `.dark` (globals.css) and re-reads them whenever the
// resolved theme changes, so charts follow Light / Dark / System
// without a reload. Before mount (or outside a theme context) it
// returns the light-theme defaults.

"use client";

import * as React from "react";
import { useTheme } from "next-themes";

export interface ChartColors {
  ink: string;
  muted: string;
  background: string;
  surface: string;
  border: string;
  primary: string;
  cyan: string;
  mint: string;
  coral: string;
  success: string;
  warning: string;
  danger: string;
}

export const LIGHT_CHART_COLORS: ChartColors = {
  ink: "#182039",
  muted: "#64748b",
  background: "#f7f9fe",
  surface: "#ffffff",
  border: "rgba(24, 32, 57, 0.1)",
  primary: "#6658f5",
  cyan: "#16c8e8",
  mint: "#2dd4bf",
  coral: "#ff7d70",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
};

function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function readChartColors(): ChartColors {
  return {
    ink: readCssVar("--ink", LIGHT_CHART_COLORS.ink),
    muted: readCssVar("--muted", LIGHT_CHART_COLORS.muted),
    background: readCssVar("--background", LIGHT_CHART_COLORS.background),
    surface: readCssVar("--surface", LIGHT_CHART_COLORS.surface),
    border: readCssVar("--border", LIGHT_CHART_COLORS.border),
    primary: readCssVar("--brand-indigo", LIGHT_CHART_COLORS.primary),
    cyan: readCssVar("--brand-cyan", LIGHT_CHART_COLORS.cyan),
    mint: readCssVar("--brand-mint", LIGHT_CHART_COLORS.mint),
    coral: readCssVar("--brand-coral", LIGHT_CHART_COLORS.coral),
    success: readCssVar("--success", LIGHT_CHART_COLORS.success),
    warning: readCssVar("--warning", LIGHT_CHART_COLORS.warning),
    danger: readCssVar("--danger", LIGHT_CHART_COLORS.danger),
  };
}

export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = React.useState<ChartColors>(LIGHT_CHART_COLORS);
  React.useEffect(() => {
    setColors(readChartColors());
  }, [resolvedTheme]);
  return colors;
}
