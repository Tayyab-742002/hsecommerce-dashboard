/**
 * Stock arithmetic for a batch of orders created in one pass.
 *
 * Twenty labels can each draw on the same inventory item, so a per-order check
 * is not enough: the batch has to be summed before anything is created. If it
 * isn't, the database triggers reject order thirteen of twenty and leave a
 * half-created batch behind.
 */

export interface BatchLine {
  inventory_item_id: string;
  quantity: number;
}

export interface StockItem {
  id: string;
  item_name: string;
  quantity: number;
}

/** Total quantity requested per inventory item across every order in the batch. */
export function batchUsage(groups: { items: BatchLine[] }[]) {
  const totals: Record<string, number> = {};

  for (const group of groups) {
    for (const line of group.items) {
      if (!line.inventory_item_id) continue;
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      totals[line.inventory_item_id] =
        (totals[line.inventory_item_id] ?? 0) + quantity;
    }
  }

  return totals;
}

/** Items the batch would over-order, and by how much. */
export function overdrawnItems<T extends StockItem>(
  inventory: T[],
  usage: Record<string, number>
) {
  return inventory
    .filter((item) => (usage[item.id] ?? 0) > item.quantity)
    .map((item) => ({ item, requested: usage[item.id] ?? 0 }));
}

/** Stock left for an item once the rest of the batch has taken its share. */
export function remainingStock(
  inventory: StockItem[],
  usage: Record<string, number>,
  inventoryItemId: string
) {
  const item = inventory.find((entry) => entry.id === inventoryItemId);
  if (!item) return 0;
  return item.quantity - (usage[inventoryItemId] ?? 0);
}
