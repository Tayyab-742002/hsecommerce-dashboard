// Runnable check: node --experimental-strip-types scripts/check-page-window.ts
import assert from "node:assert/strict";
import { pageWindow } from "../src/lib/pageWindow.ts";

assert.deepEqual(pageWindow(1, 1), [1], "single page");
assert.deepEqual(pageWindow(1, 3), [1, 2, 3], "no gaps when everything fits");
assert.deepEqual(pageWindow(1, 10), [1, 2, 10], "first page");
assert.deepEqual(pageWindow(5, 10), [1, 4, 5, 6, 10], "middle page keeps neighbours");
assert.deepEqual(pageWindow(10, 10), [1, 9, 10], "last page");
assert.ok(
  pageWindow(7, 12).every((p, i, all) => i === 0 || p > all[i - 1]),
  "ascending and deduplicated"
);

console.log("ok — page windows");
