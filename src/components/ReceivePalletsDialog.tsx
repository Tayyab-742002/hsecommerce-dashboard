import { useState, useEffect, useRef } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Package, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ReceivePalletsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Item typed in manually from the supplier packing list
interface PalletItemRow {
  tempId: string;
  item_name: string;
  sku: string;
  quantity: number;
  unit_of_measure: string;
}

interface PalletDraft {
  tempId: string;
  location: string;
  condition: string;
  storage_charges: number;
  notes: string;
  items: PalletItemRow[];
}

function generatePalletNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PLT-${date}-${rand}`;
}

function generateItemCode(): string {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `ITM-${rand}`;
}

function newItemRow(): PalletItemRow {
  return { tempId: crypto.randomUUID(), item_name: "", sku: "", quantity: 1, unit_of_measure: "pcs" };
}

// ── Autocomplete input ──────────────────────────────────────────────────────
interface AutocompleteInputProps {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

function AutocompleteInput({ options, value, onChange, placeholder }: AutocompleteInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((o) => o.id === value)?.label ?? "";

  useEffect(() => {
    if (!open && value) setQuery(selectedLabel);
  }, [open, value, selectedLabel]);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const handleSelect = (id: string, label: string) => {
    onChange(id);
    setQuery(label);
    setOpen(false);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    if (!value) setQuery("");
    else setQuery(selectedLabel);
  };

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          placeholder={placeholder ?? "Search..."}
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(""); setOpen(true); }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.map((o) => (
              <li
                key={o.id}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(o.id, o.label); }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors",
                  value === o.id ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"
                )}
              >
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {open && query.trim() !== "" && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg px-3 py-3 text-sm text-muted-foreground">
          No customers found.
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function ReceivePalletsDialog({
  open,
  onOpenChange,
  onSuccess,
}: ReceivePalletsDialogProps) {
  const [step, setStep] = useState("1");
  const [saving, setSaving] = useState(false);

  // Step 1
  const [containerNumber, setContainerNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split("T")[0]);

  // Step 2
  const [pallets, setPallets] = useState<PalletDraft[]>([]);
  const [showAddPallet, setShowAddPallet] = useState(false);
  const [editingTempId, setEditingTempId] = useState<string | null>(null);
  const [newLocation, setNewLocation] = useState("");
  const [newCondition, setNewCondition] = useState("good");
  const [newStorageCharges, setNewStorageCharges] = useState<string>("");
  const [newNotes, setNewNotes] = useState("");
  const [newItems, setNewItems] = useState<PalletItemRow[]>([newItemRow()]);

  // Data
  const [customers, setCustomers] = useState<{ id: string; label: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; warehouse_name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    fetchCustomers();
    fetchWarehouses();
  }, [open]);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, company_name, contact_person")
      .eq("status", "active")
      .order("company_name");
    setCustomers((data || []).map((c) => ({ id: c.id, label: c.company_name || c.contact_person })));
  };

  const fetchWarehouses = async () => {
    const { data } = await supabase
      .from("warehouses")
      .select("id, warehouse_name")
      .eq("status", "active")
      .order("warehouse_name");
    setWarehouses(data || []);
  };

  const handleReset = () => {
    setStep("1");
    setContainerNumber("");
    setCustomerId("");
    setWarehouseId("");
    setReceivedDate(new Date().toISOString().split("T")[0]);
    setPallets([]);
    setShowAddPallet(false);
    setEditingTempId(null);
    resetNewPalletForm();
  };

  const resetNewPalletForm = () => {
    setNewLocation("");
    setNewCondition("good");
    setNewStorageCharges("");
    setNewNotes("");
    setNewItems([newItemRow()]);
  };

  const handleStep1Next = () => {
    if (!customerId) { toast.error("Please select a customer"); return; }
    if (!warehouseId) { toast.error("Please select a warehouse"); return; }
    setStep("2");
  };

  // Item row handlers
  const updateItem = (tempId: string, field: keyof PalletItemRow, value: string | number) => {
    setNewItems((prev) => prev.map((r) => r.tempId === tempId ? { ...r, [field]: value } : r));
  };

  const removeItem = (tempId: string) => {
    setNewItems((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const handleSavePallet = () => {
    if (!newLocation.trim()) { toast.error("Please enter a location for this pallet"); return; }
    const validItems = newItems.filter((r) => r.item_name.trim() && r.quantity > 0);
    const draft: PalletDraft = {
      tempId: crypto.randomUUID(),
      location: newLocation.trim(),
      condition: newCondition,
      storage_charges: parseFloat(newStorageCharges) || 0,
      notes: newNotes.trim(),
      items: validItems,
    };
    setPallets((prev) => [...prev, draft]);
    setShowAddPallet(false);
    resetNewPalletForm();
    toast.success("Pallet added");
  };

  const handleEditPallet = (p: PalletDraft) => {
    setEditingTempId(p.tempId);
    setShowAddPallet(false);
    setNewLocation(p.location);
    setNewCondition(p.condition);
    setNewStorageCharges(p.storage_charges > 0 ? String(p.storage_charges) : "");
    setNewNotes(p.notes);
    setNewItems(p.items.length > 0 ? p.items : [newItemRow()]);
  };

  const handleUpdatePallet = () => {
    if (!newLocation.trim()) { toast.error("Please enter a location for this pallet"); return; }
    const validItems = newItems.filter((r) => r.item_name.trim() && r.quantity > 0);
    setPallets((prev) =>
      prev.map((p) =>
        p.tempId === editingTempId
          ? {
              ...p,
              location: newLocation.trim(),
              condition: newCondition,
              storage_charges: parseFloat(newStorageCharges) || 0,
              notes: newNotes.trim(),
              items: validItems,
            }
          : p
      )
    );
    setEditingTempId(null);
    resetNewPalletForm();
    toast.success("Pallet updated");
  };

  const handleConfirmReceipt = async () => {
    if (pallets.length === 0) { toast.error("Add at least one pallet before confirming"); return; }
    setSaving(true);
    try {
      for (const draft of pallets) {
        // 1. Create the pallet record
        const { data: pallet, error: palletError } = await supabase
          .from("pallets")
          .insert({
            pallet_number: generatePalletNumber(),
            container_number: containerNumber.trim() || null,
            customer_id: customerId,
            warehouse_id: warehouseId,
            location: draft.location,
            status: "in_storage",
            condition: draft.condition,
            storage_charges: draft.storage_charges,
            notes: draft.notes || null,
            received_date: new Date(receivedDate).toISOString(),
          })
          .select("id")
          .single();

        if (palletError) throw palletError;

        // 2. Create inventory_items and pallet_items for each item on the pallet
        for (const item of draft.items) {
          const { data: invItem, error: invError } = await supabase
            .from("inventory_items")
            .insert({
              item_code: generateItemCode(),
              item_name: item.item_name.trim(),
              sku: item.sku.trim() || null,
              customer_id: customerId,
              warehouse_id: warehouseId,
              pallet_id: pallet.id,
              quantity: item.quantity,
              total_quantity: item.quantity,
              unit_of_measure: item.unit_of_measure,
              status: "in_stock",
              received_date: new Date(receivedDate).toISOString(),
            })
            .select("id")
            .single();

          if (invError) throw invError;

          const { error: piError } = await supabase
            .from("pallet_items")
            .insert({
              pallet_id: pallet.id,
              inventory_item_id: invItem.id,
              quantity: item.quantity,
            });

          if (piError) throw piError;
        }
      }

      const totalItems = pallets.reduce((sum, p) => sum + p.items.length, 0);
      toast.success(
        `${pallets.length} pallet${pallets.length > 1 ? "s" : ""} received — ${totalItems} inventory item${totalItems !== 1 ? "s" : ""} created`
      );
      onOpenChange(false);
      handleReset();
      onSuccess();
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to save pallets";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const selectedCustomerLabel = customers.find((c) => c.id === customerId)?.label ?? "Customer";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Pallets</DialogTitle>
        </DialogHeader>

        <Tabs value={step} onValueChange={setStep} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="1">1. Details</TabsTrigger>
            <TabsTrigger value="2" disabled={!customerId || !warehouseId}>
              2. Pallets {pallets.length > 0 && `(${pallets.length})`}
            </TabsTrigger>
          </TabsList>

          {/* ── STEP 1 ── */}
          <TabsContent value="1" className="space-y-4">
            <div className="space-y-2">
              <Label>
                Container Number{" "}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                placeholder="e.g. MSCU1234567"
                value={containerNumber}
                onChange={(e) => setContainerNumber(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Customer <span className="text-destructive">*</span></Label>
              <AutocompleteInput
                options={customers}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Type to search customers..."
              />
            </div>

            <div className="space-y-2">
              <Label>Warehouse <span className="text-destructive">*</span></Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.warehouse_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Received Date</Label>
              <Input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleStep1Next}>Next →</Button>
            </div>
          </TabsContent>

          {/* ── STEP 2 ── */}
          <TabsContent value="2" className="space-y-4">
            {/* Summary bar */}
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              {selectedCustomerLabel}&nbsp;·&nbsp;
              {containerNumber ? `Container: ${containerNumber}` : "No container ref"}&nbsp;·&nbsp;
              {new Date(receivedDate).toLocaleDateString("en-GB")}
            </div>

            {/* Pallets already added */}
            {pallets.length > 0 && (
              <div className="space-y-2">
                {pallets.map((p, idx) => (
                  <div key={p.tempId}>
                    {editingTempId === p.tempId ? (
                      /* ── Inline edit form ── */
                      <Card className="border-dashed border-primary/40">
                        <CardContent className="pt-4 space-y-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">Edit Pallet {idx + 1}</span>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label>Location <span className="text-destructive">*</span></Label>
                              <Input
                                placeholder="e.g. Row B, Bay 3"
                                value={newLocation}
                                onChange={(e) => setNewLocation(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Condition</Label>
                              <Select value={newCondition} onValueChange={setNewCondition}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="good">Good</SelectItem>
                                  <SelectItem value="damaged">Damaged</SelectItem>
                                  <SelectItem value="water_damaged">Water Damaged</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label>Storage Charges (£/mo)</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="0.00"
                                value={newStorageCharges}
                                onChange={(e) => setNewStorageCharges(e.target.value)}
                                className="pl-7"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <Textarea
                              placeholder="Any notes about this pallet..."
                              value={newNotes}
                              onChange={(e) => setNewNotes(e.target.value)}
                              rows={2}
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label>Items on this pallet</Label>
                                <p className="text-xs text-muted-foreground mt-0.5">Enter items from the supplier's packing list</p>
                              </div>
                              <Button type="button" variant="outline" size="sm" onClick={() => setNewItems((prev) => [...prev, newItemRow()])}>
                                <Plus className="h-3 w-3 mr-1" />Add Row
                              </Button>
                            </div>
                            <div className="grid grid-cols-[1fr_120px_70px_80px_32px] gap-2 px-1">
                              <span className="text-xs font-medium text-muted-foreground">Item Name *</span>
                              <span className="text-xs font-medium text-muted-foreground">SKU / Code</span>
                              <span className="text-xs font-medium text-muted-foreground">Qty *</span>
                              <span className="text-xs font-medium text-muted-foreground">Unit</span>
                              <span />
                            </div>
                            {newItems.map((row) => (
                              <div key={row.tempId} className="grid grid-cols-[1fr_120px_70px_80px_32px] gap-2 items-center">
                                <Input placeholder="e.g. Nike Air Max" value={row.item_name} onChange={(e) => updateItem(row.tempId, "item_name", e.target.value)} />
                                <Input placeholder="e.g. NAM-001" value={row.sku} onChange={(e) => updateItem(row.tempId, "sku", e.target.value)} />
                                <Input type="number" min={1} value={row.quantity} onChange={(e) => updateItem(row.tempId, "quantity", parseInt(e.target.value) || 1)} />
                                <Select value={row.unit_of_measure} onValueChange={(v) => updateItem(row.tempId, "unit_of_measure", v)}>
                                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pcs">pcs</SelectItem>
                                    <SelectItem value="boxes">boxes</SelectItem>
                                    <SelectItem value="kg">kg</SelectItem>
                                    <SelectItem value="pairs">pairs</SelectItem>
                                    <SelectItem value="units">units</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeItem(row.tempId)} disabled={newItems.length === 1}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>

                          <div className="flex gap-2 justify-end pt-1">
                            <Button variant="outline" size="sm" onClick={() => { setEditingTempId(null); resetNewPalletForm(); }}>
                              Cancel
                            </Button>
                            <Button size="sm" onClick={handleUpdatePallet}>
                              Save Changes
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      /* ── Collapsed row ── */
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                        <div className="flex items-center gap-3">
                          <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <span className="font-medium">Pallet {idx + 1}</span>
                            <span className="text-muted-foreground ml-2">{p.location}</span>
                            {p.items.length > 0 && (
                              <span className="text-muted-foreground ml-2">
                                · {p.items.length} item{p.items.length > 1 ? "s" : ""}
                              </span>
                            )}
                            {p.storage_charges > 0 && (
                              <span className="text-muted-foreground ml-2">
                                · £{p.storage_charges.toFixed(2)}/mo
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditPallet(p)}
                            disabled={showAddPallet || (editingTempId !== null && editingTempId !== p.tempId)}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPallets((prev) => prev.filter((x) => x.tempId !== p.tempId))}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add pallet form */}
            {showAddPallet ? (
              <Card className="border-dashed border-primary/40">
                <CardContent className="pt-4 space-y-4">
                  {/* Location + Condition */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Location <span className="text-destructive">*</span></Label>
                      <Input
                        placeholder="e.g. Row B, Bay 3"
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Condition</Label>
                      <Select value={newCondition} onValueChange={setNewCondition}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="good">Good</SelectItem>
                          <SelectItem value="damaged">Damaged</SelectItem>
                          <SelectItem value="water_damaged">Water Damaged</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Storage Charges */}
                  <div className="space-y-1.5">
                    <Label>Storage Charges (£/mo)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        value={newStorageCharges}
                        onChange={(e) => setNewStorageCharges(e.target.value)}
                        className="pl-7"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <Label>
                      Notes{" "}
                      <span className="text-muted-foreground text-xs">(optional)</span>
                    </Label>
                    <Textarea
                      placeholder="Any notes about this pallet..."
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      rows={2}
                    />
                  </div>

                  {/* Items from packing list */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Items on this pallet</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Enter items from the supplier's packing list
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setNewItems((prev) => [...prev, newItemRow()])}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Row
                      </Button>
                    </div>

                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_120px_70px_80px_32px] gap-2 px-1">
                      <span className="text-xs font-medium text-muted-foreground">Item Name *</span>
                      <span className="text-xs font-medium text-muted-foreground">SKU / Code</span>
                      <span className="text-xs font-medium text-muted-foreground">Qty *</span>
                      <span className="text-xs font-medium text-muted-foreground">Unit</span>
                      <span />
                    </div>

                    {newItems.map((row) => (
                      <div
                        key={row.tempId}
                        className="grid grid-cols-[1fr_120px_70px_80px_32px] gap-2 items-center"
                      >
                        <Input
                          placeholder="e.g. Nike Air Max"
                          value={row.item_name}
                          onChange={(e) => updateItem(row.tempId, "item_name", e.target.value)}
                        />
                        <Input
                          placeholder="e.g. NAM-001"
                          value={row.sku}
                          onChange={(e) => updateItem(row.tempId, "sku", e.target.value)}
                        />
                        <Input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) => updateItem(row.tempId, "quantity", parseInt(e.target.value) || 1)}
                        />
                        <Select
                          value={row.unit_of_measure}
                          onValueChange={(v) => updateItem(row.tempId, "unit_of_measure", v)}
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
                          onClick={() => removeItem(row.tempId)}
                          disabled={newItems.length === 1}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 justify-end pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setShowAddPallet(false); resetNewPalletForm(); }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSavePallet}>
                      Save Pallet
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() => setShowAddPallet(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Pallet
              </Button>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setStep("1")}>
                ← Back
              </Button>
              <Button
                onClick={handleConfirmReceipt}
                disabled={saving || pallets.length === 0}
              >
                {saving
                  ? "Saving..."
                  : `Confirm Receipt (${pallets.length} pallet${pallets.length !== 1 ? "s" : ""})`}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
