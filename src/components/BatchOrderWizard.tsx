import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/currency";
import { createOrder } from "@/lib/createOrder";

interface BatchOrderWizardProps {
  onComplete: () => void;
}

interface BatchOrderItem {
  inventory_item_id: string;
  quantity?: number;
  unit_price?: number;
  item_name: string;
  pallet_id?: string | null;
}

interface BatchOrder {
  order_type: string;
  requested_date: string;
  special_instructions: string;
  pick_and_pack_rate?: number;
  items: BatchOrderItem[];
}

interface InventoryOption {
  id: string;
  item_code: string;
  item_name: string;
  quantity: number;
  pallet_id: string | null;
}

function ItemSearchInput({
  value,
  inventory,
  remainingFor,
  onSelect,
}: {
  value: string;
  inventory: InventoryOption[];
  remainingFor: (id: string) => number;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the input text in sync with the selected item
  useEffect(() => {
    const selected = inventory.find((i) => i.id === value);
    setSearch(selected ? `${selected.item_name} (${selected.item_code})` : "");
  }, [value, inventory]);

  const q = search.toLowerCase();
  const filtered = inventory.filter(
    (i) =>
      i.item_name?.toLowerCase().includes(q) ||
      i.item_code?.toLowerCase().includes(q)
  );

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
          const selected = inventory.find((i) => i.id === value);
          setSearch(
            selected ? `${selected.item_name} (${selected.item_code})` : ""
          );
        }
      }}
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        placeholder="Search item..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        className="pl-9"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-52 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(inv.id);
                  setSearch(`${inv.item_name} (${inv.item_code})`);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{inv.item_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {inv.item_code}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  Available: {remainingFor(inv.id)}
                </span>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No matching items
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const emptyOrder = (): BatchOrder => ({
  order_type: "delivery",
  requested_date: new Date().toISOString().split("T")[0],
  special_instructions: "",
  pick_and_pack_rate: 0,
  items: [
    {
      inventory_item_id: "",
      quantity: 1,
      unit_price: 0,
      item_name: "",
      pallet_id: null,
    },
  ],
});

export default function BatchOrderWizard({ onComplete }: BatchOrderWizardProps) {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [orders, setOrders] = useState<BatchOrder[]>([emptyOrder()]);
  const [expandedIndex, setExpandedIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerContainerRef = useRef<HTMLDivElement>(null);

  const filteredCustomers = customers.filter((c) => {
    const q = customerSearch.toLowerCase();
    return (
      c.company_name?.toLowerCase().includes(q) ||
      c.contact_person?.toLowerCase().includes(q) ||
      c.customer_code?.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    fetchCustomers();
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (customerId && warehouseId) {
      fetchInventory();
      setOrders([emptyOrder()]);
      setExpandedIndex(0);
    }
  }, [customerId, warehouseId]);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, customer_code, company_name, contact_person")
      .eq("status", "active");
    setCustomers(data || []);
  };

  const fetchWarehouses = async () => {
    const { data } = await supabase
      .from("warehouses")
      .select("id, warehouse_code, warehouse_name")
      .eq("status", "active");
    setWarehouses(data || []);
  };

  const fetchInventory = async () => {
    const { data } = await supabase
      .from("inventory_items")
      .select("id, item_code, item_name, quantity, pallet_id")
      .eq("customer_id", customerId)
      .eq("warehouse_id", warehouseId)
      .eq("status", "in_stock")
      .gt("quantity", 0);
    setInventory(data || []);
  };

  // Quantity of an inventory item already used across the whole batch,
  // optionally excluding one line (so a line's own max doesn't count itself)
  const usedQuantity = (
    inventoryItemId: string,
    excludeOrder?: number,
    excludeItem?: number
  ) =>
    orders.reduce(
      (sum, order, oi) =>
        sum +
        order.items.reduce(
          (s, item, ii) =>
            item.inventory_item_id === inventoryItemId &&
            !(oi === excludeOrder && ii === excludeItem)
              ? s + (item.quantity ?? 0)
              : s,
          0
        ),
      0
    );

  const remainingFor = (
    inventoryItemId: string,
    excludeOrder?: number,
    excludeItem?: number
  ) => {
    const inv = inventory.find((i) => i.id === inventoryItemId);
    if (!inv) return 0;
    return inv.quantity - usedQuantity(inventoryItemId, excludeOrder, excludeItem);
  };

  const updateOrder = (index: number, patch: Partial<BatchOrder>) => {
    setOrders(orders.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  const updateItem = (
    orderIndex: number,
    itemIndex: number,
    field: string,
    value: any
  ) => {
    setOrders(
      orders.map((order, oi) => {
        if (oi !== orderIndex) return order;
        const items = order.items.map((item, ii) => {
          if (ii !== itemIndex) return item;
          if (field === "inventory_item_id") {
            const inv = inventory.find((i) => i.id === value);
            return {
              ...item,
              inventory_item_id: value,
              item_name: inv?.item_name || "",
              pallet_id: inv?.pallet_id ?? null,
            };
          }
          return { ...item, [field]: value };
        });
        return { ...order, items };
      })
    );
  };

  const addItem = (orderIndex: number) => {
    updateOrder(orderIndex, {
      items: [
        ...orders[orderIndex].items,
        {
          inventory_item_id: "",
          quantity: 1,
          unit_price: 0,
          item_name: "",
          pallet_id: null,
        },
      ],
    });
  };

  const removeItem = (orderIndex: number, itemIndex: number) => {
    updateOrder(orderIndex, {
      items: orders[orderIndex].items.filter((_, i) => i !== itemIndex),
    });
  };

  const addOrder = () => {
    setOrders([...orders, emptyOrder()]);
    setExpandedIndex(orders.length);
  };

  const removeOrder = (index: number) => {
    const next = orders.filter((_, i) => i !== index);
    setOrders(next);
    if (expandedIndex >= next.length) setExpandedIndex(Math.max(0, next.length - 1));
  };

  const orderSubtotal = (order: BatchOrder) =>
    order.items.reduce(
      (sum, item) => sum + (item.quantity ?? 0) * (item.unit_price ?? 0),
      0
    );

  const orderQuantity = (order: BatchOrder) =>
    order.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);

  const orderTotal = (order: BatchOrder) =>
    orderSubtotal(order) + (order.pick_and_pack_rate ?? 0) * orderQuantity(order);

  const batchTotal = orders.reduce((sum, order) => sum + orderTotal(order), 0);
  const batchQuantity = orders.reduce(
    (sum, order) => sum + orderQuantity(order),
    0
  );

  const validateBatch = (): string | null => {
    if (!customerId || !warehouseId) return "Select a customer and warehouse first";
    for (let oi = 0; oi < orders.length; oi++) {
      const order = orders[oi];
      if (order.items.length === 0) return `Order ${oi + 1} has no items`;
      for (const item of order.items) {
        if (!item.inventory_item_id)
          return `Order ${oi + 1} has an item not selected`;
        if (!item.quantity || item.quantity < 1)
          return `Order ${oi + 1}: quantity must be at least 1 for ${item.item_name}`;
      }
    }
    // Batch-wide stock check: total requested per inventory item across all orders
    for (const inv of inventory) {
      const used = usedQuantity(inv.id);
      if (used > inv.quantity)
        return `Insufficient stock for ${inv.item_name}: available ${inv.quantity}, batch requests ${used}`;
    }
    return null;
  };

  const handleSubmitAll = async () => {
    const validationError = validateBatch();
    if (validationError) {
      toast({
        title: "Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    const created: string[] = [];
    try {
      for (let oi = 0; oi < orders.length; oi++) {
        const order = orders[oi];
        const orderNumber = await createOrder({
          customer_id: customerId,
          warehouse_id: warehouseId,
          order_type: order.order_type,
          requested_date: order.requested_date,
          special_instructions: order.special_instructions || null,
          pick_and_pack_rate: order.pick_and_pack_rate ?? 0,
          items: order.items.map((item) => ({
            inventory_item_id: item.inventory_item_id,
            quantity: item.quantity ?? 1,
            unit_price: item.unit_price ?? 0,
            item_name: item.item_name,
            pallet_id: item.pallet_id,
          })),
        });
        created.push(orderNumber);
      }
      toast({
        title: "Success",
        description: `${created.length} order${created.length > 1 ? "s" : ""} created: ${created.join(", ")}`,
      });
      onComplete();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create order";
      toast({
        title: created.length > 0 ? "Partially completed" : "Error",
        description:
          created.length > 0
            ? `Created ${created.join(", ")} but order ${created.length + 1} failed: ${message}. Remaining orders were not submitted.`
            : message,
        variant: "destructive",
      });
      if (created.length > 0) {
        // Drop the successfully created orders so the user can retry the rest
        setOrders(orders.slice(created.length));
        setExpandedIndex(0);
        fetchInventory();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Customer *</Label>
          <div
            ref={customerContainerRef}
            className="relative"
            onBlur={(e) => {
              if (!customerContainerRef.current?.contains(e.relatedTarget as Node)) {
                setCustomerDropdownOpen(false);
              }
            }}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search customer..."
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setCustomerDropdownOpen(true);
                if (!e.target.value) {
                  setCustomerId("");
                }
              }}
              onFocus={() => setCustomerDropdownOpen(true)}
              className="pl-9"
            />
            {customerDropdownOpen && filteredCustomers.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-52 overflow-y-auto">
                {filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setCustomerId(customer.id);
                      setCustomerSearch(
                        customer.company_name || customer.contact_person
                      );
                      setCustomerDropdownOpen(false);
                    }}
                  >
                    <span className="font-medium">
                      {customer.company_name || customer.contact_person}
                    </span>
                    <span className="ml-2 text-muted-foreground text-xs">
                      {customer.customer_code}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Warehouse *</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger>
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id}>
                  {warehouse.warehouse_name} ({warehouse.warehouse_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!(customerId && warehouseId) && (
        <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Select a customer and warehouse to start adding orders
        </div>
      )}

      {customerId && warehouseId && (
        <>
          <div className="space-y-3">
            {orders.map((order, orderIndex) => {
              const expanded = expandedIndex === orderIndex;
              return (
                <Card
                  key={orderIndex}
                  className={expanded ? "border-yellow-400/70 shadow-sm" : ""}
                >
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      setExpandedIndex(expanded ? -1 : orderIndex)
                    }
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-semibold whitespace-nowrap">
                        Order {orderIndex + 1}
                      </span>
                      <span className="text-sm text-muted-foreground truncate">
                        {new Date(order.requested_date).toLocaleDateString("en-GB")}{" "}
                        ·{" "}
                        {(() => {
                          const count = order.items.filter(
                            (i) => i.inventory_item_id
                          ).length;
                          const qty = orderQuantity(order);
                          return `${count} item${count === 1 ? "" : "s"} · ${qty} unit${qty === 1 ? "" : "s"}`;
                        })()}{" "}
                        · {formatCurrency(orderTotal(order))}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {orders.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeOrder(orderIndex);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <CardContent className="space-y-4 border-t pt-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Order Type *</Label>
                          <Select
                            value={order.order_type}
                            onValueChange={(value) =>
                              updateOrder(orderIndex, { order_type: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="delivery">Delivery</SelectItem>
                              <SelectItem value="pickup">Pickup</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Dispatch Date *</Label>
                          <Input
                            type="date"
                            value={order.requested_date}
                            onChange={(e) =>
                              updateOrder(orderIndex, {
                                requested_date: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        {/* Column headers (desktop) — aligned with the item row layout below */}
                        <div className="hidden gap-3 px-3 pb-1 text-xs font-medium text-muted-foreground md:flex">
                          <div className="flex-1">Item</div>
                          <div className="w-24">Qty</div>
                          <div className="w-28">Unit Price (GBP)</div>
                          <div className="w-24 text-right">Line Total</div>
                          <div className="w-10" />
                        </div>
                        <div className="divide-y divide-border border-y border-border">
                        {order.items.map((item, itemIndex) => {
                          const remaining = item.inventory_item_id
                            ? remainingFor(
                                item.inventory_item_id,
                                orderIndex,
                                itemIndex
                              )
                            : 0;
                          const overStock =
                            item.inventory_item_id &&
                            (item.quantity ?? 0) > remaining;
                          return (
                            <div
                              key={itemIndex}
                              className="flex flex-col gap-3 p-3 md:flex-row md:items-start"
                            >
                              <div className="flex-1 space-y-1">
                                <ItemSearchInput
                                  value={item.inventory_item_id}
                                  inventory={inventory}
                                  remainingFor={(id) =>
                                    remainingFor(id, orderIndex, itemIndex)
                                  }
                                  onSelect={(id) =>
                                    updateItem(
                                      orderIndex,
                                      itemIndex,
                                      "inventory_item_id",
                                      id
                                    )
                                  }
                                />
                                {overStock && (
                                  <p className="text-xs text-destructive">
                                    Only {remaining} left across this batch
                                  </p>
                                )}
                              </div>
                              <div className="w-full space-y-1 md:w-24">
                                <Label className="text-xs text-muted-foreground md:hidden">
                                  Quantity
                                </Label>
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="Qty"
                                  value={item.quantity ?? ""}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    updateItem(
                                      orderIndex,
                                      itemIndex,
                                      "quantity",
                                      value === ""
                                        ? undefined
                                        : parseInt(value) || 0
                                    );
                                  }}
                                  onBlur={(e) => {
                                    const value = e.target.value;
                                    if (value === "" || parseInt(value) < 1) {
                                      updateItem(orderIndex, itemIndex, "quantity", 1);
                                    }
                                  }}
                                />
                              </div>
                              <div className="w-full space-y-1 md:w-28">
                                <Label className="text-xs text-muted-foreground md:hidden">
                                  Unit Price (GBP)
                                </Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="Unit price"
                                  value={item.unit_price ?? ""}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    updateItem(
                                      orderIndex,
                                      itemIndex,
                                      "unit_price",
                                      value === "" ? undefined : parseFloat(value)
                                    );
                                  }}
                                  onBlur={(e) => {
                                    const value = e.target.value;
                                    if (value === "" || isNaN(parseFloat(value))) {
                                      updateItem(orderIndex, itemIndex, "unit_price", 0);
                                    }
                                  }}
                                />
                              </div>
                              <div className="hidden w-24 pt-2 text-right text-sm font-medium md:block">
                                {formatCurrency(
                                  (item.quantity ?? 0) * (item.unit_price ?? 0)
                                )}
                              </div>
                              <div className="flex justify-between text-sm md:hidden">
                                <span className="text-muted-foreground">
                                  Line Total
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(
                                    (item.quantity ?? 0) * (item.unit_price ?? 0)
                                  )}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(orderIndex, itemIndex)}
                                disabled={order.items.length === 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addItem(orderIndex)}
                          className="mt-2 border-yellow-400 bg-yellow-400/10 font-semibold hover:bg-yellow-400/25"
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Add another item
                        </Button>
                      </div>

                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                          >
                            <span className="flex items-center gap-2 font-medium">
                              <ChevronDown className="h-4 w-4" />
                              Handling charge & special instructions
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {formatCurrency(order.pick_and_pack_rate ?? 0)} /
                              qty
                              {order.special_instructions
                                ? " · notes added"
                                : ""}
                            </span>
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="grid gap-4 pt-2 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Handling Charge per Quantity (GBP)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={order.pick_and_pack_rate ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  updateOrder(orderIndex, {
                                    pick_and_pack_rate:
                                      value === "" ? undefined : parseFloat(value),
                                  });
                                }}
                                onBlur={(e) => {
                                  if (e.target.value === "") {
                                    updateOrder(orderIndex, { pick_and_pack_rate: 0 });
                                  }
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Special Instructions</Label>
                              <Textarea
                                value={order.special_instructions}
                                onChange={(e) =>
                                  updateOrder(orderIndex, {
                                    special_instructions: e.target.value,
                                  })
                                }
                                rows={1}
                              />
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      <div className="space-y-1 border-t pt-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Total Quantity:
                          </span>
                          <span className="font-medium">
                            {orderQuantity(order)} units
                          </span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span>Order Total:</span>
                          <span>{formatCurrency(orderTotal(order))}</span>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          <Button
            variant="outline"
            onClick={addOrder}
            className="h-12 w-full border-2 border-dashed text-base font-semibold"
          >
            <Plus className="mr-2 h-5 w-5" />
            Add Another Order
          </Button>

          <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-2 border-t bg-background px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-lg font-bold">
                Batch Total: {formatCurrency(batchTotal)}
              </div>
              <div className="text-sm text-muted-foreground">
                {orders.length} order{orders.length === 1 ? "" : "s"} ·{" "}
                {batchQuantity} unit{batchQuantity === 1 ? "" : "s"}
              </div>
            </div>
            <Button
              onClick={handleSubmitAll}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              {submitting
                ? "Creating Orders..."
                : `Create ${orders.length} Order${orders.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
