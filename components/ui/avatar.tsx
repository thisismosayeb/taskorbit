import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/dictionary";

function initials(name: string | null | undefined, email?: string | null): string {
  const source = (name || "").trim() || (email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const palette = [
  "bg-primary text-white",
  "bg-mint text-ink",
  "bg-cyanbrand text-white",
  "bg-coral text-white",
  "bg-amber-400 text-ink",
  "bg-emerald-500 text-white",
];

function colorFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function Avatar({
  name,
  email,
  className,
  size = "md",
}: {
  name?: string | null;
  email?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizes[size],
        colorFor(name || email || "?"),
        className,
      )}
      aria-label={name || email || t("ui.userFallback")}
    >
      {initials(name, email)}
    </span>
  );
}
