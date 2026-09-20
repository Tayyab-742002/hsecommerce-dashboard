/**
 * Turns the list pages' date filter into an inclusive [from, to] pair of
 * YYYY-MM-DD strings, so the filter can run in the database instead of over
 * rows already fetched. Returns null when no date filter is active.
 */
export function dateFilterRange(
  filter: string,
  customDate?: Date
): { from: string; to: string } | null {
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;

  if (customDate) {
    return { from: iso(customDate), to: iso(customDate) };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (filter) {
    case "today":
      return { from: iso(today), to: iso(today) };
    case "week": {
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      return { from: iso(weekAgo), to: iso(today) };
    }
    case "month": {
      const monthAgo = new Date(today);
      monthAgo.setDate(today.getDate() - 30);
      return { from: iso(monthAgo), to: iso(today) };
    }
    default:
      return null;
  }
}

/** Escapes a search term for PostgREST's ilike/or filter syntax. */
export function likeTerm(term: string) {
  // commas and parens would break out of an or(...) filter list
  return `%${term.trim().replace(/[,()]/g, " ")}%`;
}
