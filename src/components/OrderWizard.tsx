import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface OrderWizardProps {
  onComplete: () => void;
}

interface OrderItem {
  inventory_item_id: string;
  quantity: number;
  item_name: string;
  available_quantity: number;
}

export default function OrderWizard({ onComplete }: OrderWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState("1");
  const [customers, setCustomers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);

  const [orderData, setOrderData] = useState({
    customer_id: "",
    warehouse_id: "",
    order_type: "delivery",
    priority: "normal",
    requested_date: new Date().toISOString().split("T")[0],
    delivery_contact_name: "",
    delivery_contact_phone: "",
    delivery_address_line1: "",
    delivery_city: "",
    delivery_state: "",
    delivery_postal_code: "",
    delivery_country: "Pakistan",
    special_instructions: "",
    handling_charges: 0,
    delivery_charges: 0,
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

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
      .select("id, item_code, item_name, quantity")
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
        item_name: "",
        available_quantity: 0,
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
      };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setOrderItems(newItems);
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

    // Validate quantities
    const invalidItem = orderItems.find(
      (item) => item.quantity > item.available_quantity
    );
    if (invalidItem) {
      toast({
        title: "Error",
        description: `Quantity exceeds available stock for ${invalidItem.item_name}`,
        variant: "destructive",
      });
      return;
    }

    const totalQuantity = orderItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    const totalCharges =
      Number(orderData.handling_charges) + Number(orderData.delivery_charges);

    // Generate order number
    const orderNumber = `OUT-${new Date().getFullYear()}-${String(
      Math.floor(Math.random() * 10000)
    ).padStart(5, "0")}`;

    const { data: order, error: orderError } = await supabase
      .from("outbound_orders")
      .insert({
        ...orderData,
        order_number: orderNumber,
        total_items: orderItems.length,
        total_quantity: totalQuantity,
        total_charges: totalCharges,
        status: "pending",
      })
      .select()
      .single();

    if (orderError) {
      toast({
        title: "Error",
        description: "Failed to create order",
        variant: "destructive",
      });
      return;
    }

    // Insert order items
    const { error: itemsError } = await supabase
      .from("outbound_order_items")
      .insert(
        orderItems.map((item) => ({
          outbound_order_id: order.id,
          inventory_item_id: item.inventory_item_id,
          quantity: item.quantity,
        }))
      );

    if (itemsError) {
      toast({
        title: "Error",
        description: "Failed to add order items",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: `Order ${orderNumber} created successfully`,
    });
    onComplete();
  };

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
            <Select
              value={orderData.customer_id}
              onValueChange={(value) =>
                setOrderData({ ...orderData, customer_id: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.company_name || customer.contact_person} (
                    {customer.customer_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Label>Priority *</Label>
            <Select
              value={orderData.priority}
              onValueChange={(value) =>
                setOrderData({ ...orderData, priority: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Requested Date *</Label>
            <Input
              type="date"
              value={orderData.requested_date}
              onChange={(e) =>
                setOrderData({ ...orderData, requested_date: e.target.value })
              }
            />
          </div>
        </div>

        {orderData.order_type === "delivery" && (
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold mb-4">Delivery Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input
                    value={orderData.delivery_contact_name}
                    onChange={(e) =>
                      setOrderData({
                        ...orderData,
                        delivery_contact_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input
                    value={orderData.delivery_contact_phone}
                    onChange={(e) =>
                      setOrderData({
                        ...orderData,
                        delivery_contact_phone: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={orderData.delivery_address_line1}
                    onChange={(e) =>
                      setOrderData({
                        ...orderData,
                        delivery_address_line1: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={orderData.delivery_city}
                    onChange={(e) =>
                      setOrderData({
                        ...orderData,
                        delivery_city: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Postal Code</Label>
                  <Input
                    value={orderData.delivery_postal_code}
                    onChange={(e) =>
                      setOrderData({
                        ...orderData,
                        delivery_postal_code: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                            {inv.quantity}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full space-y-2 md:w-32">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      max={item.available_quantity}
                      value={item.quantity}
                      onChange={(e) =>
                        updateOrderItem(
                          index,
                          "quantity",
                          parseInt(e.target.value) || 1
                        )
                      }
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
          <Button variant="outline" onClick={() => setStep("1")}
            className="w-full sm:w-auto">
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
                <Label>Handling Charges (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={orderData.handling_charges}
                  onChange={(e) =>
                    setOrderData({
                      ...orderData,
                      handling_charges: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Delivery Charges (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={orderData.delivery_charges}
                  onChange={(e) =>
                    setOrderData({
                      ...orderData,
                      delivery_charges: parseFloat(e.target.value) || 0,
                    })
                  }
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
                <div className="flex justify-between">
                  <span>Total Items:</span>
                  <span className="font-medium">{orderItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Quantity:</span>
                  <span className="font-medium">
                    {orderItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                  <span>Total Charges:</span>
                  <span>
                    {formatCurrency(
                      Number(orderData.handling_charges) +
                        Number(orderData.delivery_charges)
                    )}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={() => setStep("2")} className="w-full sm:w-auto">
            Back
          </Button>
          <Button onClick={handleSubmit} className="w-full sm:w-auto">Create Order</Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
