import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "primary" | "mint" | "cyan" | "coral" | "amber" | "green" | "red" | "neutral" | "outline";

const variants: Record<BadgeVariant, string> = {
  default: "bg-ink/10 text-ink",
  // Primary text on a tinted surface: light #6658f5 on white is 4.91:1;
  // dark uses the lighter indigo so it stays readable on --surface.
  primary: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-[#9d94f8]",
  mint: "bg-mint/15 text-teal-700 dark:text-teal-300",
  cyan: "bg-cyanbrand/15 text-cyan-700 dark:text-cyan-300",
  coral: "bg-coral/15 text-red-600 dark:text-red-300",
  // Deadline chips: light pairs are the Tailwind 100/800 pairs
  // (green 6.49:1, red 5.30:1, amber 6.37:1); dark pairs use a
  // translucent fill over --surface with a 300-weight text
  // (green 9.08:1, red 7.43:1, amber 8.78:1). See lib/theme/contrast.ts.
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  green: "bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300",
  red: "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300",
  neutral: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  outline: "border border-ink/15 text-ink",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
