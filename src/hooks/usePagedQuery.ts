import { useEffect, useRef, useState } from "react";

export const PAGE_SIZE = 25;

/** Anything Supabase's query builder gives us once filters and order are applied. */
type RangeQuery<T> = {
  range: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; count: number | null; error: unknown }>;
};

/**
 * Server-side pagination. `build` returns a Supabase query with its filters,
 * ordering and `{ count: "exact" }` already applied — this adds .range() for the
 * current page and tracks the total from the server's count.
 *
 * Pass `null` as `build` while the query can't run yet (e.g. the customer id is
 * still loading); the hook stays in its loading state instead of fetching.
 *
 * `deps` are the filter values: changing any of them refetches from page 1.
 */
export function usePagedQuery<T>(
  build: (() => RangeQuery<T>) | null,
  deps: unknown[],
  pageSize = PAGE_SIZE
) {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Read the newest build closure without making it an effect dependency
  const buildRef = useRef(build);
  buildRef.current = build;

  const filterKey = JSON.stringify(deps);

  // A changed filter invalidates the current page number
  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  useEffect(() => {
    const query = buildRef.current;
    if (!query) {
      // Nothing to run yet (or ever, for a user with no customer): don't hang
      // on a spinner forever — the caller shows its own while it resolves.
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const from = (page - 1) * pageSize;
    Promise.resolve(query().range(from, from + pageSize - 1)).then(
      ({ data, count, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          setError(
            queryError instanceof Error
              ? queryError.message
              : String((queryError as { message?: string })?.message ?? queryError)
          );
        } else {
          setError(null);
          setRows(data ?? []);
          setTotal(count ?? 0);
        }
        setLoading(false);
      }
    );

    // A stale response must not overwrite a newer one
    return () => {
      cancelled = true;
    };
  }, [filterKey, page, pageSize, reloadKey]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    rows,
    total,
    page,
    setPage,
    pageCount,
    loading,
    error,
    from: total === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
    refetch: () => setReloadKey((key) => key + 1),
  };
}
