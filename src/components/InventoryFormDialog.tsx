import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

export default function InventoryFormDialog({ open, onOpenChange, item, onSuccess }: InventoryFormDialogProps) {
  const [formData, setFormData] = useState<InventoryItem>(
    item || {
      item_code: "",
      item_name: "",
      customer_id: "",
      warehouse_id: "",
      quantity: 1,
      unit_of_measure: "pcs",
      weight_unit: "kg",
      dimension_unit: "cm",
      received_date: new Date().toISOString().split("T")[0],
      condition_on_arrival: "good",
      current_condition: "good",
      status: "in_stock",
    }
  );
  const [customers, setCustomers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
      if (item?.id) {
        const { error } = await supabase
          .from("inventory_items")
          .update(formData)
          .eq("id", item.id);

        if (error) throw error;
        toast.success("Inventory item updated successfully");
      } else {
        const { error } = await supabase.from("inventory_items").insert(formData);

        if (error) throw error;
        toast.success("Inventory item created successfully");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Inventory Item" : "Add New Inventory Item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="item_code">Item Code *</Label>
              <Input
                id="item_code"
                value={formData.item_code}
                onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                required
                disabled={!!item}
              />
            </div>
            <div>
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={formData.sku || ""}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="item_name">Item Name *</Label>
            <Input
              id="item_name"
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category || ""}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="customer_id">Customer *</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.company_name || customer.contact_person} ({customer.customer_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="warehouse_id">Warehouse *</Label>
              <Select
                value={formData.warehouse_id}
                onValueChange={(value) => setFormData({ ...formData, warehouse_id: value })}
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
                onChange={(e) => setFormData({ ...formData, received_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                required
                min="1"
              />
            </div>
            <div>
              <Label htmlFor="unit_of_measure">Unit</Label>
              <Select
                value={formData.unit_of_measure}
                onValueChange={(value) => setFormData({ ...formData, unit_of_measure: value })}
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
            <div>
              <Label htmlFor="declared_value">Declared Value (USD)</Label>
              <Input
                id="declared_value"
                type="number"
                value={formData.declared_value || ""}
                onChange={(e) => setFormData({ ...formData, declared_value: parseFloat(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="weight">Weight</Label>
              <Input
                id="weight"
                type="number"
                value={formData.weight || ""}
                onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="weight_unit">Weight Unit</Label>
              <Select
                value={formData.weight_unit}
                onValueChange={(value) => setFormData({ ...formData, weight_unit: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">Kilogram</SelectItem>
                  <SelectItem value="g">Gram</SelectItem>
                  <SelectItem value="lb">Pound</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label htmlFor="dimension_length">Length</Label>
              <Input
                id="dimension_length"
                type="number"
                value={formData.dimension_length || ""}
                onChange={(e) => setFormData({ ...formData, dimension_length: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="dimension_width">Width</Label>
              <Input
                id="dimension_width"
                type="number"
                value={formData.dimension_width || ""}
                onChange={(e) => setFormData({ ...formData, dimension_width: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="dimension_height">Height</Label>
              <Input
                id="dimension_height"
                type="number"
                value={formData.dimension_height || ""}
                onChange={(e) => setFormData({ ...formData, dimension_height: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="dimension_unit">Unit</Label>
              <Select
                value={formData.dimension_unit}
                onValueChange={(value) => setFormData({ ...formData, dimension_unit: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cm">Centimeter</SelectItem>
                  <SelectItem value="m">Meter</SelectItem>
                  <SelectItem value="in">Inch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="condition_on_arrival">Condition on Arrival</Label>
              <Select
                value={formData.condition_on_arrival}
                onValueChange={(value) => setFormData({ ...formData, condition_on_arrival: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="requires_inspection">Requires Inspection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="current_condition">Current Condition</Label>
              <Select
                value={formData.current_condition}
                onValueChange={(value) => setFormData({ ...formData, current_condition: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="deteriorated">Deteriorated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                value={formData.barcode || ""}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="storage_rate">Storage Rate (USD/month)</Label>
              <Input
                id="storage_rate"
                type="number"
                value={formData.storage_rate || ""}
                onChange={(e) => setFormData({ ...formData, storage_rate: parseFloat(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ""}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
