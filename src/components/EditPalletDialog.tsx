import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";

interface EditPalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  palletId: string | null;
  onSuccess: () => void;
}

interface PalletItemRow {
  id: string | null; // null = new row
  inventory_item_id: string | null;
  item_name: string;
  sku: string;
  quantity: number;
  unit_of_measure: string;
  _deleted?: boolean;
}

export default function EditPalletDialog({
  open,
  onOpenChange,
  palletId,
  onSuccess,
}: EditPalletDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pallet fields
  const [location, setLocation] = useState("");
  const [condition, setCondition] = useState("good");
  const [storageCharges, setStorageCharges] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("in_storage");

  // Items
  const [items, setItems] = useState<PalletItemRow[]>([]);

  // Read-only info for display
  const [palletNumber, setPalletNumber] = useState("");
  const [containerNumber, setContainerNumber] = useState("");
  const [customerName, setCustomerName] = useState("");

  useEffect(() => {
    if (open && palletId) {
      fetchPallet(palletId);
    }
  }, [open, palletId]);

  const fetchPallet = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pallets")
        .select(`
          *,
          customers (company_name, contact_person),
          pallet_items (
            id,
            quantity,
            inventory_items (id, item_name, sku, unit_of_measure)
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      // Populate pallet fields
      setLocation(data.location || "");
      setCondition(data.condition || "good");
      setStorageCharges(data.storage_charges > 0 ? String(data.storage_charges) : "");
      setNotes(data.notes || "");
      setStatus(data.status || "in_storage");
      setPalletNumber(data.pallet_number);
      setContainerNumber(data.container_number || "");
      setCustomerName(
        data.customers?.company_name || data.customers?.contact_person || ""
      );

      // Populate items
      const loadedItems: PalletItemRow[] = (data.pallet_items || []).map(
        (pi: {
          id: string;
          quantity: number;
          inventory_items: {
            id: string;
            item_name: string;
            sku: string | null;
            unit_of_measure: string | null;
          } | null;
        }) => ({
          id: pi.id,
          inventory_item_id: pi.inventory_items?.id || null,
          item_name: pi.inventory_items?.item_name || "",
          sku: pi.inventory_items?.sku || "",
          quantity: pi.quantity,
          unit_of_measure: pi.inventory_items?.unit_of_measure || "pcs",
        })
      );

      setItems(loadedItems.length > 0 ? loadedItems : [newItemRow()]);
    } catch (err) {
      console.error("Error fetching pallet for edit:", err);
      toast.error("Failed to load pallet data");
    } finally {
      setLoading(false);
    }
  };

  const newItemRow = (): PalletItemRow => ({
    id: null,
    inventory_item_id: null,
    item_name: "",
    sku: "",
    quantity: 1,
    unit_of_measure: "pcs",
  });

  const updateItem = (
    index: number,
    field: keyof PalletItemRow,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const item = prev[index];
      // If it's an existing DB item, mark it for deletion
      if (item.id) {
        return prev.map((r, i) =>
          i === index ? { ...r, _deleted: true } : r
        );
      }
      // If it's a new unsaved row, just remove it
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSave = async () => {
    if (!palletId) return;
    if (!location.trim()) {
      toast.error("Location is required");
      return;
    }

    setSaving(true);
    try {
      // 1. Update pallet record
      const { error: palletError } = await supabase
        .from("pallets")
        .update({
          location: location.trim(),
          condition,
          storage_charges: parseFloat(storageCharges) || 0,
          notes: notes.trim() || null,
          status,
        })
        .eq("id", palletId);

      if (palletError) throw palletError;

      // 2. Handle deleted items
      const deletedItems = items.filter((r) => r._deleted && r.id);
      for (const item of deletedItems) {
        // Delete the pallet_item
        await supabase.from("pallet_items").delete().eq("id", item.id!);
        // Delete the associated inventory_item if it exists
        if (item.inventory_item_id) {
          await supabase
            .from("inventory_items")
            .delete()
            .eq("id", item.inventory_item_id);
        }
      }

      // 3. Update existing items
      const existingItems = items.filter((r) => r.id && !r._deleted);
      for (const item of existingItems) {
        // Update inventory_item
        if (item.inventory_item_id) {
          await supabase
            .from("inventory_items")
            .update({
              item_name: item.item_name.trim(),
              sku: item.sku.trim() || null,
              quantity: item.quantity,
              total_quantity: item.quantity,
              unit_of_measure: item.unit_of_measure,
            })
            .eq("id", item.inventory_item_id);
        }
        // Update pallet_item quantity
        await supabase
          .from("pallet_items")
          .update({ quantity: item.quantity })
          .eq("id", item.id!);
      }

      // 4. Create new items
      const newItems = items.filter(
        (r) => !r.id && !r._deleted && r.item_name.trim()
      );
      for (const item of newItems) {
        // Get the pallet's customer_id and warehouse_id for the inventory_item
        const { data: palletData } = await supabase
          .from("pallets")
          .select("customer_id, warehouse_id, received_date")
          .eq("id", palletId)
          .single();

        if (!palletData) continue;

        // Generate item code
        const itemCode = `ITM-${Math.floor(100000 + Math.random() * 900000)}`;

        // Create inventory_item
        const { data: invItem, error: invError } = await supabase
          .from("inventory_items")
          .insert({
            item_code: itemCode,
            item_name: item.item_name.trim(),
            sku: item.sku.trim() || null,
            customer_id: palletData.customer_id,
            warehouse_id: palletData.warehouse_id,
            pallet_id: palletId,
            quantity: item.quantity,
            total_quantity: item.quantity,
            unit_of_measure: item.unit_of_measure,
            status: "in_stock",
            received_date: palletData.received_date,
          })
          .select("id")
          .single();

        if (invError) throw invError;

        // Create pallet_item link
        await supabase.from("pallet_items").insert({
          pallet_id: palletId,
          inventory_item_id: invItem.id,
          quantity: item.quantity,
        });
      }

      toast.success("Pallet updated successfully");
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to update pallet";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const visibleItems = items.filter((r) => !r._deleted);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Pallet</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner label="Loading pallet..." />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Read-only info bar */}
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              {palletNumber}
              {customerName && <>&nbsp;·&nbsp;{customerName}</>}
              {containerNumber && (
                <>&nbsp;·&nbsp;Container: {containerNumber}</>
              )}
            </div>

            {/* Location + Condition */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Location <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g. Row B, Bay 3"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="water_damaged">Water Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status + Storage Charges */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receiving">Receiving</SelectItem>
                    <SelectItem value="in_storage">In Storage</SelectItem>
                    <SelectItem value="partially_picked">
                      Partially Picked
                    </SelectItem>
                    <SelectItem value="empty">Empty</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Storage Charges (£/mo)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    £
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={storageCharges}
                    onChange={(e) => setStorageCharges(e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>
                Notes{" "}
                <span className="text-muted-foreground text-xs">
                  (optional)
                </span>
              </Label>
              <Textarea
                placeholder="Any notes about this pallet..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Items on this pallet</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Edit, add, or remove items
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setItems((prev) => [...prev, newItemRow()])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Row
                </Button>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_120px_70px_80px_32px] gap-2 px-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Item Name *
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  SKU / Code
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  Qty *
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  Unit
                </span>
                <span />
              </div>

              {visibleItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  No items — click "Add Row" to add one.
                </p>
              ) : (
                visibleItems.map((row) => {
                  // Find actual index in the full array (including deleted)
                  const realIndex = items.indexOf(row);
                  return (
                    <div
                      key={`${row.id || ""}-${realIndex}`}
                      className="grid grid-cols-[1fr_120px_70px_80px_32px] gap-2 items-center"
                    >
                      <Input
                        placeholder="e.g. Nike Air Max"
                        value={row.item_name}
                        onChange={(e) =>
                          updateItem(realIndex, "item_name", e.target.value)
                        }
                      />
                      <Input
                        placeholder="e.g. NAM-001"
                        value={row.sku}
                        onChange={(e) =>
                          updateItem(realIndex, "sku", e.target.value)
                        }
                      />
                      <Input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) =>
                          updateItem(
                            realIndex,
                            "quantity",
                            parseInt(e.target.value) || 1
                          )
                        }
                      />
                      <Select
                        value={row.unit_of_measure}
                        onValueChange={(v) =>
                          updateItem(realIndex, "unit_of_measure", v)
                        }
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pcs">pcs</SelectItem>
                          <SelectItem value="boxes">boxes</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="pairs">pairs</SelectItem>
                          <SelectItem value="units">units</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => removeItem(realIndex)}
                        disabled={visibleItems.length === 1 && !row.id}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
