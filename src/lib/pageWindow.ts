/**
 * Page numbers to show around the current page, always including the first and
 * last page. Gaps in the returned sequence are rendered as an ellipsis.
 */
export function pageWindow(page: number, pageCount: number): number[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  return [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
}
