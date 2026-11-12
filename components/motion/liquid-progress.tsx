"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { t, useLocale} from "@/lib/i18n";

/** Clamp a percent into [0, 100]. 0% = empty, 100% = full, NaN = 0. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export type LiquidAccent = "manager" | "developer" | "primary";

const ACCENTS: Record<LiquidAccent, { from: string; to: string }> = {
  manager: { from: "#6658F5", to: "#16C8E8" },
  developer: { from: "#2DD4BF", to: "#FF7D70" },
  primary: { from: "#6658F5", to: "#A36BFA" },
};

/**
 * Liquid Progress — an SVG fill with two moving wave paths, clipped to the
 * shape so nothing ever spills outside. At 0% the shape is empty; at 100%
 * it is completely full. Shows the exact number and exposes
 * role="progressbar" with aria-valuenow.
 *
 * Waves are CSS-animated (transform only); with prefers-reduced-motion
 * they become static fills (see globals.css).
 */
export function LiquidProgress({
  percent,
  variant = "bar",
  accent = "primary",
  label,
  className,
  showLabel = true,
}: {
  percent: number;
  variant?: "bar" | "orb";
  accent?: LiquidAccent;
  label?: string;
  className?: string;
  showLabel?: boolean;
}) {
  useLocale();
  const clamped = clampProgress(percent);
  const rounded = Math.round(clamped);
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const clipId = `lp-clip-${id}`;
  const gradId = `lp-grad-${id}`;
  const { from, to } = ACCENTS[accent];
  const ariaLabel = label ?? t("progress.aria", { percent: `${rounded}%` });

  if (variant === "orb") {
    // Circular orb: 120x120 viewBox, fill level from the bottom.
    // Wave crest sits at the fill line; at 100% the circle is fully covered.
    const fillTop = 120 - (clamped / 100) * 120;
    const wave = (y: number, phase: number, opacity: number) => (
      <path
        className={phase === 0 ? "liquid-wave" : "liquid-wave-slow"}
        d={`M -120 ${y} Q -90 ${y - 10} -60 ${y} T 0 ${y} T 60 ${y} T 120 ${y} T 180 ${y} T 240 ${y} L 240 130 L -120 130 Z`}
        fill={`url(#${gradId})`}
        opacity={opacity}
      />
    );
    return (
      <div className={cn("inline-flex flex-col items-center gap-1", className)}>
        <svg
          width="96"
          height="96"
          viewBox="0 0 120 120"
          role="progressbar"
          aria-valuenow={rounded}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={ariaLabel}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={from} />
              <stop offset="1" stopColor={to} />
            </linearGradient>
            <clipPath id={clipId}>
              <circle cx="60" cy="60" r="54" />
            </clipPath>
          </defs>
          <circle cx="60" cy="60" r="54" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1.5" />
          <g clipPath={`url(#${clipId})`}>
            {clamped > 0 ? (
              <>
                {wave(fillTop, 0, 0.95)}
                {wave(fillTop + 6, 1, 0.55)}
                {/* Flat fill below the waves so 100% is a solid full circle. */}
                <rect x="-120" y={fillTop + 8} width="360" height={130 - fillTop} fill={`url(#${gradId})`} />
              </>
            ) : null}
          </g>
        </svg>
        {showLabel ? (
          <span className="font-heading text-sm font-bold text-ink">{`${rounded}%`}</span>
        ) : null}
      </div>
    );
  }

  // Horizontal bar: 300x36 viewBox, rounded-rect clip.
  const fillTop = 36 - (clamped / 100) * 36;
  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox="0 0 300 36"
        className="h-9 w-full"
        preserveAspectRatio="none"
        role="progressbar"
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x="0" y="0" width="300" height="36" rx="18" />
          </clipPath>
        </defs>
        <rect x="0" y="0" width="300" height="36" rx="18" fill="var(--surface-2)" />
        <g clipPath={`url(#${clipId})`}>
          {clamped > 0 ? (
            <>
              <path
                className="liquid-wave"
                d={`M -300 ${fillTop} Q -270 ${fillTop - 7} -240 ${fillTop} T -180 ${fillTop} T -120 ${fillTop} T -60 ${fillTop} T 0 ${fillTop} T 60 ${fillTop} T 120 ${fillTop} T 180 ${fillTop} T 240 ${fillTop} T 300 ${fillTop} T 360 ${fillTop} T 420 ${fillTop} T 480 ${fillTop} T 540 ${fillTop} T 600 ${fillTop} L 600 40 L -300 40 Z`}
                fill={`url(#${gradId})`}
                opacity="0.95"
              />
              <path
                className="liquid-wave-slow"
                d={`M -300 ${fillTop + 5} Q -270 ${fillTop - 2} -240 ${fillTop + 5} T -180 ${fillTop + 5} T -120 ${fillTop + 5} T -60 ${fillTop + 5} T 0 ${fillTop + 5} T 60 ${fillTop + 5} T 120 ${fillTop + 5} T 180 ${fillTop + 5} T 240 ${fillTop + 5} T 300 ${fillTop + 5} T 360 ${fillTop + 5} T 420 ${fillTop + 5} T 480 ${fillTop + 5} T 540 ${fillTop + 5} T 600 ${fillTop + 5} L 600 40 L -300 40 Z`}
                fill={`url(#${gradId})`}
                opacity="0.55"
              />
              <rect x="-300" y={fillTop + 7} width="900" height={40 - fillTop} fill={`url(#${gradId})`} />
            </>
          ) : null}
        </g>
      </svg>
      {showLabel ? (
        <span className="sr-only">{`${rounded}%`}</span>
      ) : null}
    </div>
  );
}
