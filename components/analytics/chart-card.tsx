// Shared card shell for every analytics chart (Part 2, Section 7).
//
// Each chart gets: a title, a one-line text summary underneath it (the
// numbers in words, for screen readers and the viva — never colour
// alone), and an empty state when there is no data to chart. Charts
// themselves live in analytics-charts.tsx.

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ChartCard({
  title,
  summary,
  action,
  children,
}: {
  title: string;
  summary: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {action}
        </div>
        <p className="text-sm text-muted" role="note">
          {summary}
        </p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Shown inside a chart card when the chart has no data. Never a fake zero-trend. */
export function ChartEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <p className="font-heading text-base font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
