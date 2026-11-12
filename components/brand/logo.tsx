import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/dictionary";

/**
 * TaskOrbit wordmark. Light variant on light backgrounds, dark variant in
 * dark mode (the theme track's .dark class drives the switch).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)} aria-label={t("app.name")}>
      <Image
        src="/brand/taskorbit-wordmark-light.svg"
        alt={t("app.name")}
        width={156}
        height={38}
        className="h-9 w-auto dark:hidden"
      />
      <Image
        src="/brand/taskorbit-wordmark-dark.svg"
        alt={t("app.name")}
        width={156}
        height={38}
        className="hidden h-9 w-auto dark:block"
      />
    </Link>
  );
}

/** Standalone icon (sidebar, small spaces). */
export function LogoIcon({ size = 36 }: { size?: number }) {
  return (
    <Image
      src="/brand/taskorbit-icon.svg"
      alt=""
      width={size}
      height={size}
      className="rounded-xl"
      style={{ width: size, height: size }}
    />
  );
}
