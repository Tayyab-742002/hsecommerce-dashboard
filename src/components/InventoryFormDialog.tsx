import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import type { Tables } from "@/integrations/supabase/types";

interface InventoryItem {
  id?: string;
  item_code: string;
  item_name: string;
  description?: string;
  category?: string;
  sku?: string;
  customer_id: string;
  warehouse_id: string;
  quantity: number;
  total_quantity?: number;
  unit_of_measure?: string;
  weight?: number;
  weight_unit?: string;
  dimension_length?: number;
  dimension_width?: number;
  dimension_height?: number;
  dimension_unit?: string;
  received_date: string;
  declared_value?: number;
  storage_rate?: number;
  condition_on_arrival?: string;
  current_condition?: string;
  status?: string;
  barcode?: string;
  qr_code?: string;
  notes?: string;
}

interface InventoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem;
  onSuccess: () => void;
}

export default function InventoryFormDialog({
  open,
  onOpenChange,
  item,
  onSuccess,
}: InventoryFormDialogProps) {
  const [formData, setFormData] = useState<InventoryItem>({
    item_code: "",
    item_name: "",
    customer_id: "",
    warehouse_id: "",
    quantity: 1,
    total_quantity: 1,
    unit_of_measure: "pcs",
    received_date: new Date().toISOString().split("T")[0],
    status: "in_stock",
  });

  // Helper to ensure number values are valid before submission
  const getNumberValue = (
    value: number | undefined,
    defaultValue: number = 0
  ): number => {
    return value ?? defaultValue;
  };
  type CustomerOption = Pick<
    Tables<"customers">,
    "id" | "customer_code" | "company_name" | "contact_person"
  >;
  type WarehouseOption = Pick<
    Tables<"warehouses">,
    "id" | "warehouse_code" | "warehouse_name"
  >;
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Update formData when item prop changes
  useEffect(() => {
    if (item) {
      setFormData({
        item_code: item.item_code || "",
        item_name: item.item_name || "",
        description: item.description || "",
        category: item.category || "",
        customer_id: item.customer_id || "",
        warehouse_id: item.warehouse_id || "",
        quantity: item.quantity || 1,
        total_quantity: item.total_quantity || item.quantity || 1,
        unit_of_measure: item.unit_of_measure || "pcs",
        received_date:
          item.received_date || new Date().toISOString().split("T")[0],
        status: item.status || "in_stock",
        storage_rate: item.storage_rate || undefined,
        notes: item.notes || "",
      });
      setFormErrors({});
    } else {
      // Reset form when adding new item
      setFormData({
        item_code: "",
        item_name: "",
        customer_id: "",
        warehouse_id: "",
        quantity: 1,
        total_quantity: 1,
        unit_of_measure: "pcs",
        received_date: new Date().toISOString().split("T")[0],
        status: "in_stock",
      });
      setFormErrors({});
    }
  }, [item, open]);

  type StatusType = "in_stock" | "reserved" | "shipped" | "damaged";

  const schema = z
    .object({
      item_code: z.string().min(1, "Item code is required"),
      item_name: z.string().min(1, "Item name is required"),
      description: z.string().optional(),
      category: z.string().optional(),
      customer_id: z.string().min(1, "Customer is required"),
      warehouse_id: z.string().min(1, "Warehouse is required"),
      quantity: z.number().int().min(0, "Quantity must be >= 0"),
      total_quantity: z
        .number()
        .int()
        .min(1, "Total quantity must be at least 1"),
      unit_of_measure: z.string().optional(),
      received_date: z.string().min(1, "Received date is required"),
      storage_rate: z
        .number()
        .nonnegative({ message: "Storage rate must be >= 0" })
        .optional(),
      status: z.enum(["in_stock", "reserved", "shipped", "damaged"]).optional(),
      notes: z.string().optional(),
    })
    .refine((data) => data.quantity <= data.total_quantity, {
      message: "Available quantity cannot exceed total quantity",
      path: ["quantity"],
    });

  useEffect(() => {
    fetchCustomers();
    fetchWarehouses();
  }, []);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, customer_code, company_name, contact_person")
      .eq("status", "active")
      .order("company_name");
    if (data) setCustomers(data);
  };

  const fetchWarehouses = async () => {
    const { data } = await supabase
      .from("warehouses")
      .select("id, warehouse_code, warehouse_name")
      .eq("status", "active")
      .order("warehouse_name");
    if (data) setWarehouses(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate - ensure numeric values are set
      const quantityValue = getNumberValue(formData.quantity, 0);
      const totalQuantityValue = getNumberValue(
        formData.total_quantity,
        quantityValue || 1
      );

      const result = schema.safeParse({
        item_code: formData.item_code,
        item_name: formData.item_name,
        description: formData.description,
        category: formData.category,
        customer_id: formData.customer_id,
        warehouse_id: formData.warehouse_id,
        quantity: quantityValue,
        total_quantity: totalQuantityValue,
        unit_of_measure: formData.unit_of_measure,
        received_date: formData.received_date,
        storage_rate: formData.storage_rate,
        status: (formData.status || undefined) as StatusType | undefined,
        notes: formData.notes,
      });

      if (!result.success) {
        const errs: Record<string, string> = {};
        result.error.issues.forEach((i) => {
          const key = (i.path?.[0] as string) || "form";
          if (!errs[key]) errs[key] = i.message;
        });
        setFormErrors(errs);
        setLoading(false);
        return;
      }
      setFormErrors({});

      // Build payload, enforce sku null and omit dimensions
      const payload = {
        item_code: formData.item_code,
        item_name: formData.item_name,
        description: formData.description ?? null,
        category: formData.category ?? null,
        sku: null as unknown as string | null,
        customer_id: formData.customer_id,
        warehouse_id: formData.warehouse_id,
        quantity: quantityValue,
        total_quantity: totalQuantityValue,
        unit_of_measure: formData.unit_of_measure ?? null,
        received_date: formData.received_date,
        storage_rate: formData.storage_rate ?? null,
        status: formData.status ?? null,
        notes: formData.notes ?? null,
      };

      if (item?.id) {
        const { error } = await supabase
          .from("inventory_items")
          .update(payload)
          .eq("id", item.id);

        if (error) throw error;
        toast.success("Inventory item updated successfully");
      } else {
        const { error } = await supabase
          .from("inventory_items")
          .insert({ ...payload, sku: null });

        if (error) throw error;
        toast.success("Inventory item created successfully");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "An unexpected error occurred";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? "Edit Inventory Item" : "Add New Inventory Item"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="item_code">Item Code *</Label>
              <Input
                id="item_code"
                value={formData.item_code}
                onChange={(e) =>
                  setFormData({ ...formData, item_code: e.target.value })
                }
                required
                disabled={!!item}
              />
              {formErrors.item_code && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.item_code}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="item_name">Item Name *</Label>
            <Input
              id="item_name"
              value={formData.item_name}
              onChange={(e) =>
                setFormData({ ...formData, item_name: e.target.value })
              }
              required
            />
            {formErrors.item_name && (
              <p className="text-sm text-destructive mt-1">
                {formErrors.item_name}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category || ""}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="customer_id">Customer *</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, customer_id: value })
                }
                required
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
              {formErrors.customer_id && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.customer_id}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="warehouse_id">Warehouse *</Label>
              <Select
                value={formData.warehouse_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, warehouse_id: value })
                }
                required
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
            <div>
              <Label htmlFor="received_date">Received Date *</Label>
              <Input
                id="received_date"
                type="date"
                value={formData.received_date}
                onChange={(e) =>
                  setFormData({ ...formData, received_date: e.target.value })
                }
                required
              />
              {formErrors.received_date && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.received_date}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="total_quantity">Total Quantity *</Label>
              <Input
                id="total_quantity"
                type="number"
                value={formData.total_quantity ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({
                    ...formData,
                    total_quantity:
                      value === "" ? undefined : parseInt(value) || 0,
                  });
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (value === "" || parseInt(value) < 1) {
                    setFormData({
                      ...formData,
                      total_quantity: 1,
                    });
                  }
                }}
                required
                min="1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Total quantity received
              </p>
              {formErrors.total_quantity && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.total_quantity}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="quantity">Available Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                value={formData.quantity ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({
                    ...formData,
                    quantity: value === "" ? undefined : parseInt(value) || 0,
                  });
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (value === "") {
                    setFormData({
                      ...formData,
                      quantity: 0,
                    });
                  }
                }}
                required
                min="0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Currently available quantity
              </p>
              {formErrors.quantity && (
                <p className="text-sm text-destructive mt-1">
                  {formErrors.quantity}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="unit_of_measure">Unit</Label>
              <Select
                value={formData.unit_of_measure}
                onValueChange={(value) =>
                  setFormData({ ...formData, unit_of_measure: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">Pieces</SelectItem>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="pallet">Pallet</SelectItem>
                  <SelectItem value="kg">Kilogram</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="storage_rate">Storage Rate (GBP/month)</Label>
              <Input
                id="storage_rate"
                type="number"
                step="0.01"
                value={formData.storage_rate ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({
                    ...formData,
                    storage_rate:
                      value === "" ? undefined : parseFloat(value) || 0,
                  });
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (value === "") {
                    setFormData({
                      ...formData,
                      storage_rate: undefined,
                    });
                  }
                }}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : item ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
