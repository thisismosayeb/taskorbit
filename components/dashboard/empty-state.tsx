import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <svg viewBox="0 0 120 80" className="mb-4 h-20 w-28" aria-hidden="true">
          <ellipse cx="60" cy="40" rx="48" ry="16" fill="none" stroke="#16C8E8" strokeWidth="3" transform="rotate(-18 60 40)" />
          <circle cx="60" cy="40" r="22" fill="#6658F5" opacity="0.9" />
          <path d="M51 41 L57 47 L70 34" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="102" cy="28" r="4" fill="#2DD4BF" />
        </svg>
        <h3 className="font-heading text-lg font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-2 max-w-md text-sm text-muted">{description}</p> : null}
        {action ? <div className="mt-6">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
