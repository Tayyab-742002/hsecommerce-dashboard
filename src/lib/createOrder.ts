import { supabase } from "@/integrations/supabase/client";

export interface NewOrderItem {
  inventory_item_id: string;
  quantity: number;
  unit_price: number;
  item_name: string;
  pallet_id?: string | null;
}

export interface NewOrderInput {
  customer_id: string;
  warehouse_id: string;
  order_type: string;
  requested_date: string;
  special_instructions: string | null;
  pick_and_pack_rate: number;
  order_category?: string | null;
  label_path?: string | null;
  items: NewOrderItem[];
}

export function orderItemsSubtotal(items: NewOrderItem[]) {
  return items.reduce(
    (sum, item) => sum + (item.quantity ?? 0) * (item.unit_price ?? 0),
    0
  );
}

export function orderTotalQuantity(items: NewOrderItem[]) {
  return items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

export function orderTotalCharges(input: NewOrderInput) {
  const handling = (input.pick_and_pack_rate ?? 0) * orderTotalQuantity(input.items);
  return orderItemsSubtotal(input.items) + handling;
}

function generateOrderNumber() {
  return `OUT-${new Date().getFullYear()}-${String(
    Math.floor(Math.random() * 10000)
  ).padStart(5, "0")}`;
}

/**
 * Creates an outbound order with its items. Inventory and pallet quantities are
 * adjusted by database triggers on outbound_order_items.
 * Throws an Error with a user-readable message on failure.
 * Returns the generated order number.
 */
export async function createOrder(input: NewOrderInput): Promise<string> {
  const totalQuantity = orderTotalQuantity(input.items);
  const handlingCharges = (input.pick_and_pack_rate ?? 0) * totalQuantity;
  const totalCharges = orderItemsSubtotal(input.items) + handlingCharges;
  const orderNumber = generateOrderNumber();

  const { data: order, error: orderError } = await supabase
    .from("outbound_orders")
    .insert({
      customer_id: input.customer_id,
      warehouse_id: input.warehouse_id,
      order_type: input.order_type,
      requested_date: input.requested_date,
      special_instructions: input.special_instructions || null,
      order_category: input.order_category?.trim() || null,
      label_path: input.label_path || null,
      label_uploaded_at: input.label_path ? new Date().toISOString() : null,
      handling_charges: handlingCharges,
      delivery_charges: 0,
      order_number: orderNumber,
      total_items: input.items.length,
      total_quantity: totalQuantity,
      total_charges: totalCharges,
      status: "pending",
    })
    .select()
    .single();

  if (orderError || !order) {
    throw new Error(orderError?.message || "Failed to create order");
  }

  const { error: itemsError } = await supabase.from("outbound_order_items").insert(
    input.items.map((item) => ({
      outbound_order_id: order.id,
      inventory_item_id: item.inventory_item_id,
      quantity: item.quantity,
      unit_price: item.unit_price ?? 0,
      order_item: item.item_name,
    }))
  );

  if (itemsError) {
    // Roll back the order header so a failed item insert doesn't leave an empty order
    await supabase.from("outbound_orders").delete().eq("id", order.id);
    throw new Error(itemsError.message || "Failed to add order items");
  }

  return orderNumber;
}
