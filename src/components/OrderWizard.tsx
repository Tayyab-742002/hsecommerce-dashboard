import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { createOrder } from "@/lib/createOrder";

interface OrderWizardProps {
  onComplete: () => void;
}

interface OrderItem {
  inventory_item_id: string;
  quantity?: number;
  unit_price?: number;
  item_name: string;
  available_quantity: number;
  pallet_id?: string | null;
}

export default function OrderWizard({ onComplete }: OrderWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState("1");
  const [customers, setCustomers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);

  const [orderData, setOrderData] = useState<{
    customer_id: string;
    warehouse_id: string;
    order_type: string;
    requested_date: string;
    special_instructions: string;
    pick_and_pack_rate?: number;
    delivery_charges: number;
  }>({
    customer_id: "",
    warehouse_id: "",
    order_type: "delivery",
    requested_date: new Date().toISOString().split("T")[0],
    special_instructions: "",
    pick_and_pack_rate: 0,
    delivery_charges: 0,
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
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
    if (orderData.customer_id && orderData.warehouse_id) {
      fetchInventory();
    }
  }, [orderData.customer_id, orderData.warehouse_id]);

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
      .eq("customer_id", orderData.customer_id)
      .eq("warehouse_id", orderData.warehouse_id)
      .eq("status", "in_stock")
      .gt("quantity", 0);
    setInventory(data || []);
  };

  const addOrderItem = () => {
    setOrderItems([
      ...orderItems,
      {
        inventory_item_id: "",
        quantity: 1,
        unit_price: 0,
        item_name: "",
        available_quantity: 0,
        pallet_id: null,
      },
    ]);
  };

  const removeOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const updateOrderItem = (index: number, field: string, value: any) => {
    const newItems = [...orderItems];
    if (field === "inventory_item_id") {
      const item = inventory.find((i) => i.id === value);
      newItems[index] = {
        ...newItems[index],
        inventory_item_id: value,
        item_name: item?.item_name || "",
        available_quantity: item?.quantity || 0,
        pallet_id: item?.pallet_id ?? null,
      };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setOrderItems(newItems);
  };

  // Stock remaining for an inventory item after subtracting what other rows
  // of this order already request (the same product can appear in several rows)
  const remainingFor = (inventoryItemId: string, excludeIndex?: number) => {
    const inv = inventory.find((i) => i.id === inventoryItemId);
    if (!inv) return 0;
    const usedElsewhere = orderItems.reduce(
      (sum, item, i) =>
        i !== excludeIndex && item.inventory_item_id === inventoryItemId
          ? sum + (item.quantity ?? 0)
          : sum,
      0
    );
    return inv.quantity - usedElsewhere;
  };

  const handleSubmit = async () => {
    if (orderItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one item to the order",
        variant: "destructive",
      });
      return;
    }

    const unselectedItem = orderItems.some((item) => !item.inventory_item_id);
    if (unselectedItem) {
      toast({
        title: "Error",
        description: "Please select an item for every row, or remove empty rows",
        variant: "destructive",
      });
      return;
    }

    const invalidQuantity = orderItems.find(
      (item) => !item.quantity || item.quantity < 1
    );
    if (invalidQuantity) {
      toast({
        title: "Error",
        description: `Quantity must be at least 1 for ${invalidQuantity.item_name}`,
        variant: "destructive",
      });
      return;
    }

    // Validate stock per product, summed across all rows that reference it
    for (const inv of inventory) {
      const requested = orderItems.reduce(
        (sum, item) =>
          item.inventory_item_id === inv.id ? sum + (item.quantity ?? 0) : sum,
        0
      );
      if (requested > inv.quantity) {
        toast({
          title: "Error",
          description: `Insufficient stock for ${inv.item_name}: available ${inv.quantity}, requested ${requested}`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const orderNumber = await createOrder({
        customer_id: orderData.customer_id,
        warehouse_id: orderData.warehouse_id,
        order_type: orderData.order_type,
        requested_date: orderData.requested_date,
        special_instructions: orderData.special_instructions || null,
        pick_and_pack_rate: orderData.pick_and_pack_rate ?? 0,
        items: orderItems.map((item) => ({
          inventory_item_id: item.inventory_item_id,
          quantity: item.quantity ?? 1,
          unit_price: item.unit_price ?? 0,
          item_name: item.item_name,
          pallet_id: item.pallet_id,
        })),
      });

      toast({
        title: "Success",
        description: `Order ${orderNumber} created successfully`,
      });
      onComplete();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to create order",
        variant: "destructive",
      });
    }
  };

  const hasPalletItems = orderItems.some((item) => item.pallet_id);
  const chargeLabel = hasPalletItems
    ? "Pallet Handling Charges per Quantity (GBP)"
    : "Pick and Pack Charge per Quantity (GBP)";
  const chargeSummaryLabel = hasPalletItems
    ? "Pallet Handling Charges:"
    : "Pick and Pack Rate:";

  return (
    <Tabs value={step} onValueChange={setStep} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger
          value="1"
          className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black"
        >
          Order Details
        </TabsTrigger>
        <TabsTrigger
          value="2"
          className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black"
        >
          Items
        </TabsTrigger>
        <TabsTrigger
          value="3"
          className="data-[state=active]:bg-yellow-400 data-[state=active]:text-black"
        >
          Review
        </TabsTrigger>
      </TabsList>

      <TabsContent value="1" className="space-y-4 mt-4">
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
                ref={customerInputRef}
                placeholder="Search customer..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustomerDropdownOpen(true);
                  if (!e.target.value) {
                    setOrderData({ ...orderData, customer_id: "" });
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
                        setOrderData({ ...orderData, customer_id: customer.id });
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
            <Select
              value={orderData.warehouse_id}
              onValueChange={(value) =>
                setOrderData({ ...orderData, warehouse_id: value })
              }
            >
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

          <div className="space-y-2">
            <Label>Order Type *</Label>
            <Select
              value={orderData.order_type}
              onValueChange={(value) =>
                setOrderData({ ...orderData, order_type: value })
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
            <Label>Order Dispatch Date *</Label>
            <Input
              type="date"
              value={orderData.requested_date}
              onChange={(e) =>
                setOrderData({ ...orderData, requested_date: e.target.value })
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            onClick={() => setStep("2")}
            disabled={!orderData.customer_id || !orderData.warehouse_id}
            className="w-full sm:w-auto"
          >
            Next: Add Items
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="2" className="space-y-4 mt-4">
        <div className="space-y-4">
          {orderItems.map((item, index) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="flex-1 space-y-2">
                    <Label>Item</Label>
                    <Select
                      value={item.inventory_item_id}
                      onValueChange={(value) =>
                        updateOrderItem(index, "inventory_item_id", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {inventory.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.item_name} ({inv.item_code}) - Available:{" "}
                            {remainingFor(inv.id, index)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {item.inventory_item_id &&
                      (item.quantity ?? 0) >
                        remainingFor(item.inventory_item_id, index) && (
                        <p className="text-xs text-destructive">
                          Only {remainingFor(item.inventory_item_id, index)}{" "}
                          available — other rows in this order use the rest
                        </p>
                      )}
                  </div>
                  <div className="w-full space-y-2 md:w-32">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      max={remainingFor(item.inventory_item_id, index)}
                      value={item.quantity ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        updateOrderItem(
                          index,
                          "quantity",
                          value === "" ? undefined : (parseInt(value) || 0)
                        );
                      }}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value === "" || parseInt(value) < 1) {
                          updateOrderItem(index, "quantity", 1);
                        }
                      }}
                    />
                  </div>
                  <div className="w-full space-y-2 md:w-32">
                    <Label>Unit Price (GBP)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unit_price ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        updateOrderItem(
                          index,
                          "unit_price",
                          value === "" ? undefined : parseFloat(value)
                        );
                      }}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (value === "" || isNaN(parseFloat(value))) {
                          updateOrderItem(index, "unit_price", 0);
                        }
                      }}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:mt-8"
                    onClick={() => removeOrderItem(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button variant="outline" onClick={addOrderItem} className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            onClick={() => setStep("1")}
            className="w-full sm:w-auto"
          >
            Back
          </Button>
          <Button
            onClick={() => setStep("3")}
            disabled={orderItems.length === 0}
            className="w-full sm:w-auto"
          >
            Next: Review
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="3" className="space-y-4 mt-4">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{chargeLabel}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={orderData.pick_and_pack_rate ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      setOrderData({
                        ...orderData,
                        pick_and_pack_rate: undefined,
                      });
                    } else {
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue)) {
                        setOrderData({
                          ...orderData,
                          pick_and_pack_rate: numValue,
                        });
                      }
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "") {
                      setOrderData({ ...orderData, pick_and_pack_rate: 0 });
                    }
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Charge per unit of quantity (e.g., 0.15, -7.5, -3.35)
                </p>
              </div>
              <div className="space-y-2">
                <Label>Total Quantity</Label>
                <Input
                  type="number"
                  value={orderItems.reduce(
                    (sum, item) => sum + (item.quantity ?? 0),
                    0
                  )}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Special Instructions</Label>
              <Textarea
                value={orderData.special_instructions}
                onChange={(e) =>
                  setOrderData({
                    ...orderData,
                    special_instructions: e.target.value,
                  })
                }
                rows={3}
              />
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-2">Order Summary</h3>
              <div className="space-y-1 text-sm">
                {orderItems.map((item, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="truncate pr-2">
                      {item.item_name || "Item"} × {item.quantity ?? 0}
                    </span>
                    <span className="font-medium">
                      {formatCurrency((item.quantity ?? 0) * (item.unit_price ?? 0))}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span>Items Subtotal:</span>
                  <span className="font-medium">
                    {formatCurrency(
                      orderItems.reduce(
                        (sum, item) =>
                          sum + (item.quantity ?? 0) * (item.unit_price ?? 0),
                        0
                      )
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total Items:</span>
                  <span className="font-medium">{orderItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Quantity:</span>
                  <span className="font-medium">
                    {orderItems.reduce((sum, item) => sum + (item.quantity ?? 0), 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{chargeSummaryLabel}</span>
                  <span className="font-medium">
                    {formatCurrency(orderData.pick_and_pack_rate ?? 0)} per quantity
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                  <span>Total Charges:</span>
                  <span>
                    {formatCurrency(
                      orderItems.reduce(
                        (sum, item) =>
                          sum + (item.quantity ?? 0) * (item.unit_price ?? 0),
                        0
                      ) +
                        (orderData.pick_and_pack_rate ?? 0) *
                          orderItems.reduce(
                            (sum, item) => sum + (item.quantity ?? 0),
                            0
                          )
                    )}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            onClick={() => setStep("2")}
            className="w-full sm:w-auto"
          >
            Back
          </Button>
          <Button onClick={handleSubmit} className="w-full sm:w-auto">
            Create Order
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
