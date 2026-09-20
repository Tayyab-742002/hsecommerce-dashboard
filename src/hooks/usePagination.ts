import { useEffect, useMemo, useState } from "react";

/**
 * Client-side pagination over an already-filtered list. Keeps the rendered row
 * count small, which is what makes per-row state (selection checkboxes) cheap.
 *
 * ponytail: the full list is still fetched. Move to Supabase .range() queries if
 * a single customer's table ever grows past a few thousand rows — that also means
 * moving the filters server-side, which is why it isn't done here.
 */
export function usePagination<T>(items: T[], pageSize = 25) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // Changing a filter can leave you past the last page
  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [page, pageCount]);

  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  );

  return {
    page: safePage,
    setPage,
    pageCount,
    pageItems,
    total: items.length,
    from: items.length === 0 ? 0 : (safePage - 1) * pageSize + 1,
    to: Math.min(safePage * pageSize, items.length),
  };
}
