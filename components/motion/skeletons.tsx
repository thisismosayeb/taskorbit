import { cn } from "@/lib/utils";

/** Skeleton loaders for cards, charts and lists (globals.css .skeleton). */

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("rounded-xl border border-ink/10 bg-surface p-6", className)}>
      <div className="skeleton h-5 w-2/5" />
      <div className="skeleton mt-3 h-3 w-4/5" />
      <div className="skeleton mt-2 h-3 w-3/5" />
      <div className="skeleton mt-5 h-8 w-full" />
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("rounded-xl border border-ink/10 bg-surface p-6", className)}>
      <div className="skeleton h-5 w-1/3" />
      <div className="skeleton mt-4 h-40 w-full" />
    </div>
  );
}

export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-surface p-4">
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="flex-1">
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton mt-2 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
