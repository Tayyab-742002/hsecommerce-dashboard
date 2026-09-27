// Runnable check: node --experimental-strip-types scripts/check-batch-stock.ts
import assert from "node:assert/strict";
import {
  batchUsage,
  overdrawnItems,
  remainingStock,
} from "../src/lib/batchStock.ts";

const tee = { id: "tee", item_name: "Tee Black M", quantity: 50 };
const blanket = { id: "blanket", item_name: "Blanket", quantity: 3 };
const stock = [tee, blanket];

// The same item drawn by several labels must be summed, not checked per label
const batch = [
  { items: [{ inventory_item_id: "tee", quantity: 3 }] },
  { items: [{ inventory_item_id: "tee", quantity: 2 }] },
  {
    items: [
      { inventory_item_id: "tee", quantity: 1 },
      { inventory_item_id: "blanket", quantity: 1 },
    ],
  },
];

const usage = batchUsage(batch);
assert.deepEqual(usage, { tee: 6, blanket: 1 }, "quantities add up across orders");
assert.equal(remainingStock(stock, usage, "tee"), 44);
assert.deepEqual(overdrawnItems(stock, usage), [], "6 of 50 is fine");

// Half-filled rows must not count towards usage
const partial = batchUsage([
  { items: [{ inventory_item_id: "", quantity: 5 }] },
  { items: [{ inventory_item_id: "tee", quantity: 0 }] },
  { items: [{ inventory_item_id: "tee", quantity: Number.NaN }] },
  { items: [{ inventory_item_id: "tee", quantity: -2 }] },
]);
assert.deepEqual(partial, {}, "blank, zero, NaN and negative rows are ignored");

// The case this exists to catch: each order is fine, the batch is not
const tooMany = batchUsage(
  Array.from({ length: 4 }, () => ({
    items: [{ inventory_item_id: "blanket", quantity: 1 }],
  }))
);
const over = overdrawnItems(stock, tooMany);
assert.equal(over.length, 1, "4 blankets against 3 in stock is caught");
assert.equal(over[0].item.id, "blanket");
assert.equal(over[0].requested, 4);
assert.equal(remainingStock(stock, tooMany, "blanket"), -1, "goes negative");

// Exactly at stock is allowed — it's over that fails
const exact = batchUsage([{ items: [{ inventory_item_id: "blanket", quantity: 3 }] }]);
assert.deepEqual(overdrawnItems(stock, exact), [], "3 of 3 is allowed");

assert.equal(remainingStock(stock, usage, "unknown"), 0, "unknown item has none");

console.log("ok — batch stock adds up across orders");
