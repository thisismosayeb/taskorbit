// Pagination for filtered lists (Part 2, §3): lists longer than 20 items
// are paged. Links keep the current filter query string and only change
// `page`, so a page of a filtered view can be refreshed or shared.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export async function Pagination({
  basePath,
  query,
  page,
  totalPages,
  total,
  pageSize,
  itemLabel = "items",
}: {
  basePath: string;
  /** The current filter query string, WITHOUT the page param (from serializeTaskFilters). */
  query: string;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  itemLabel?: string;
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const hrefFor = (p: number) => {
    const params = new URLSearchParams(query);
    if (p > 1) params.set("page", String(p));
    else params.delete("page");
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-sm text-muted" aria-live="polite">
        {t("pagination.showing", {
          from,
          to,
          total,
          itemLabel,
          pagePart: totalPages > 1 ? t("pagination.pageSuffix", { page, totalPages }) : "",
        })}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)}>
              <Button type="button" variant="outline" size="sm">
                {t("common.previous")}
              </Button>
            </Link>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              {t("common.previous")}
            </Button>
          )}
          {page < totalPages ? (
            <Link href={hrefFor(page + 1)}>
              <Button type="button" variant="outline" size="sm">
                {t("common.next")}
              </Button>
            </Link>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              {t("common.next")}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
