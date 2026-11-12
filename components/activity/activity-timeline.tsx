// Activity timeline rows: actor avatar + name, the action in plain words,
// a link to the task/project, and relative + exact time (workspace tz).
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime, formatExactTime } from "@/lib/date/relative";
import { describeActivity } from "@/lib/activity/format";
import type { ActivityListItem } from "@/lib/actions/activity";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export async function ActivityTimeline({
  items,
  timezone,
}: {
  items: ActivityListItem[];
  timezone: string;
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  if (items.length === 0) {
    return <p className="text-sm text-muted">{t("activity.noActivity")}</p>;
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const { actionText, objectLabel, objectHref } = describeActivity(item, {
          taskTitle: item.taskTitle,
          projectName: item.projectName,
        }, locale);
        const actorName = item.actor?.full_name || t("common.someone");
        return (
          <li key={item.id} className="flex gap-3">
            <Avatar name={actorName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">
                <span className="font-medium">{actorName}</span>{" "}
                <span className="text-ink/80">{actionText}</span>{" "}
                {objectLabel ? (
                  objectHref ? (
                    <Link href={objectHref} className="font-medium text-primary hover:underline">
                      {objectLabel}
                    </Link>
                  ) : (
                    <span className="font-medium">{objectLabel}</span>
                  )
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-muted" title={formatExactTime(item.created_at, timezone, locale)}>
                {formatRelativeTime(item.created_at, undefined, locale)} · {formatExactTime(item.created_at, timezone, locale)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
