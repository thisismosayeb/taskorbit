"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { t, useLocale } from "@/lib/i18n";

export type MascotMood = "idle" | "look" | "shy" | "error" | "success";

/**
 * Orbit — the TaskOrbit mascot. Pure SVG/CSS: a round body with two eyes
 * and a small orbit ring, with floating sticky-note tasks around it.
 *
 * Decorative only (aria-hidden). Never animates or reveals password
 * contents. Moods:
 *  - idle: gentle float, eyes centred
 *  - look: eyes glance toward the form (email typing)
 *  - shy: hands cover the eyes (password focused)
 *  - error: small surprised shake
 *  - success: happy bounce
 * Motion respects prefers-reduced-motion via globals.css.
 */
export function OrbitMascot({
  mood = "idle",
  className,
}: {
  mood?: MascotMood;
  className?: string;
}) {
  useLocale(); // re-render when the language changes so sticky-note text updates
  const pupilDx = mood === "look" ? 5 : 0;
  const pupilDy = mood === "look" ? 2 : 0;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative flex items-center justify-center",
        mood === "error" && "mascot-error",
        mood === "success" && "mascot-success",
        className,
      )}
    >
      {/* Floating sticky notes */}
      <div className="animate-float-soft absolute -left-2 top-2 rotate-[-8deg] rounded-md bg-[#FFF3B0] px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 shadow-sm sm:-left-4">
        {t("mascot.sticky1")}
      </div>
      <div
        className="animate-float absolute -right-1 top-10 rotate-[6deg] rounded-md bg-[#C7F5E3] px-2.5 py-1.5 text-[11px] font-semibold text-teal-900 shadow-sm sm:-right-3"
        style={{ animationDelay: "0.8s" }}
      >
        {t("mascot.sticky2")}
      </div>
      <div
        className="animate-float-soft absolute -bottom-1 left-6 rotate-[4deg] rounded-md bg-[#FFD9D4] px-2.5 py-1.5 text-[11px] font-semibold text-red-900 shadow-sm"
        style={{ animationDelay: "1.6s" }}
      >
        {t("mascot.sticky3")}
      </div>

      <svg viewBox="0 0 200 200" className="animate-bob h-44 w-44 sm:h-52 sm:w-52" role="presentation">
        <defs>
          <radialGradient id="orbit-body" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#8B7FF7" />
            <stop offset="0.55" stopColor="#6658F5" />
            <stop offset="1" stopColor="#4A3FD1" />
          </radialGradient>
        </defs>
        {/* orbit ring */}
        <ellipse
          cx="100"
          cy="100"
          rx="86"
          ry="30"
          fill="none"
          stroke="#16C8E8"
          strokeWidth="5"
          transform="rotate(-18 100 100)"
          opacity="0.9"
        />
        <circle cx="176" cy="72" r="7" fill="#2DD4BF" />
        {/* body */}
        <circle cx="100" cy="100" r="62" fill="url(#orbit-body)" />
        {/* blush */}
        <circle cx="66" cy="122" r="9" fill="#FF7D70" opacity="0.45" />
        <circle cx="134" cy="122" r="9" fill="#FF7D70" opacity="0.45" />
        {/* eyes */}
        <g>
          <circle cx="78" cy="96" r="13" fill="#FFFFFF" />
          <circle cx="122" cy="96" r="13" fill="#FFFFFF" />
          {mood === "shy" ? null : (
            <>
              <circle cx={78 + pupilDx} cy={96 + pupilDy} r="6" fill="#182039" />
              <circle cx={122 + pupilDx} cy={96 + pupilDy} r="6" fill="#182039" />
              <circle cx={80 + pupilDx} cy={94 + pupilDy} r="2" fill="#FFFFFF" />
              <circle cx={124 + pupilDx} cy={94 + pupilDy} r="2" fill="#FFFFFF" />
            </>
          )}
          {mood === "error" ? (
            <>
              <circle cx="78" cy="92" r="2.5" fill="#182039" />
              <circle cx="122" cy="92" r="2.5" fill="#182039" />
            </>
          ) : null}
        </g>
        {/* hands covering eyes when shy */}
        {mood === "shy" ? (
          <g>
            <ellipse cx="78" cy="96" rx="15" ry="11" fill="#F4F7FF" opacity="0.95" />
            <ellipse cx="122" cy="96" rx="15" ry="11" fill="#F4F7FF" opacity="0.95" />
          </g>
        ) : null}
        {/* mouth: smile, or small "o" when surprised / shy */}
        {mood === "error" ? (
          <circle cx="100" cy="126" r="6" fill="#182039" />
        ) : (
          <path
            d="M 84 120 Q 100 132 116 120"
            fill="none"
            stroke="#182039"
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}
      </svg>
    </div>
  );
}
