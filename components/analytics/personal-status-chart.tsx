// Small personal chart for the developer dashboard: the developer's own
// tasks by status. Client component (Recharts); receives only the four
// aggregated counts, never task rows.

"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { StatusSlice } from "@/lib/analytics";
import { t, useLocale} from "@/lib/i18n";

const STATUS_COLORS: Record<string, string> = {
  todo: "#7C87A0",
  in_progress: "#16C8E8",
  in_review: "#FF7D70",
  completed: "#2DD4BF",
};

export function PersonalStatusChart({ data }: { data: StatusSlice[] }) {
  useLocale();
  return (
    <div style={{ width: "100%", height: 220 }} role="img" aria-label={t("analytics.personalChartAria")}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
            {data.map((slice) => (
              <Cell key={slice.status} fill={STATUS_COLORS[slice.status]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [t("analytics.taskCount", { count: Number(value), countS: Number(value) === 1 ? "" : "s" }), t("analytics.tasksLabel")]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
