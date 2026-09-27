// Runnable check: node --experimental-strip-types scripts/check-date-range.ts
import assert from "node:assert/strict";
import {
  dateFilterRange,
  lastMonthRange,
  likeTerm,
} from "../src/lib/dateRange.ts";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const today = new Date();
today.setHours(0, 0, 0, 0);

assert.equal(dateFilterRange("all"), null, "no filter means no range");

const todayRange = dateFilterRange("today");
assert.deepEqual(todayRange, { from: iso(today), to: iso(today) });

const week = dateFilterRange("week")!;
assert.equal(week.to, iso(today), "week ends today");
const weekStart = new Date(today);
weekStart.setDate(today.getDate() - 7);
assert.equal(week.from, iso(weekStart), "week starts 7 days back");

const month = dateFilterRange("month")!;
const monthStart = new Date(today);
monthStart.setDate(today.getDate() - 30);
assert.equal(month.from, iso(monthStart), "month starts 30 days back");

// A custom date wins over the preset, and is a single day
const custom = new Date(2026, 0, 5);
assert.deepEqual(dateFilterRange("month", custom), {
  from: "2026-01-05",
  to: "2026-01-05",
});

// Local dates must not shift a day via UTC conversion
const newYearsDay = new Date(2026, 0, 1);
assert.equal(dateFilterRange("all", newYearsDay)!.from, "2026-01-01");

// A term with a comma would otherwise break out of an or(...) filter list
assert.equal(likeTerm(" a,b(c) "), "%a b c %");
assert.ok(!likeTerm("a,b").includes(","), "no commas survive");

// Billing periods: the month before, including the awkward boundaries
assert.deepEqual(lastMonthRange(new Date(2026, 8, 15)), {
  from: "2026-08-01",
  to: "2026-08-31",
});
assert.deepEqual(
  lastMonthRange(new Date(2026, 0, 3)),
  { from: "2025-12-01", to: "2025-12-31" },
  "January bills December of the previous year"
);
assert.deepEqual(
  lastMonthRange(new Date(2026, 2, 31)),
  { from: "2026-02-01", to: "2026-02-28" },
  "short month, and day 31 must not roll into March"
);
assert.deepEqual(
  lastMonthRange(new Date(2028, 2, 5)),
  { from: "2028-02-01", to: "2028-02-29" },
  "leap year"
);

console.log("ok — date ranges, billing periods and search terms");
