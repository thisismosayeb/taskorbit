// Loading skeleton for every /dashboard route (Part 4 Track A: dashboard
// slowness). The dashboard layout + page run ~10 sequential round trips
// to the test DB before first paint; without a loading boundary a sidebar
// click shows the old page for seconds with no feedback. This file makes
// Next.js swap in pulsing blocks immediately on navigation, while the
// server is still loading. Deliberately sync and text-free (no locale
// lookup): a loading boundary must render instantly.
// Layout note: the dashboard layout keeps the topbar/sidebar visible —
// only <main> is replaced by this skeleton, so the header + KPI shape
// below mirrors a generic dashboard page (title, stat cards, list).
import { CardSkeleton, ListSkeleton } from "@/components/motion/skeletons";

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-label="Loading dashboard">
      <div aria-hidden="true">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton mt-2 h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden="true">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <ListSkeleton rows={4} />
    </div>
  );
}
