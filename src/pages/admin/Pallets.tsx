import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, Eye, Filter, X, Pencil } from "lucide-react";
import ReceivePalletsDialog from "@/components/ReceivePalletsDialog";
import PalletDetailSheet from "@/components/PalletDetailSheet";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Pallet {
  id: string;
  pallet_number: string;
  container_number: string | null;
  location: string | null;
  status: string;
  condition: string;
  storage_charges: number;
  notes: string | null;
  received_date: string;
  customer_id: string;
  warehouse_id: string;
  customers: { company_name: string | null; contact_person: string } | null;
  warehouses: { warehouse_name: string } | null;
  pallet_items: { id: string }[];
}

export default function AdminPallets() {
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPalletId, setSelectedPalletId] = useState<string | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [palletToDelete, setPalletToDelete] = useState<string | null>(null);
  const [inventoryItemCount, setInventoryItemCount] = useState(0);

  // Edit location dialog
  const [editLocationOpen, setEditLocationOpen] = useState(false);
  const [editLocationValue, setEditLocationValue] = useState("");
  const [editLocationPalletId, setEditLocationPalletId] = useState<string | null>(null);

  const fetchPallets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("pallets")
        .select(`
          *,
          customers (company_name, contact_person),
          warehouses (warehouse_name),
          pallet_items (id)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPallets((data as unknown as Pallet[]) || []);
    } catch (error) {
      console.error("Error fetching pallets:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPallets();
  }, [fetchPallets]);

  const filteredPallets = pallets.filter((p) => {
    const customerName =
      p.customers?.company_name || p.customers?.contact_person || "";
    const matchesSearch =
      p.pallet_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.container_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.location || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesCustomer =
      customerFilter === "all" || p.customer_id === customerFilter;

    return matchesSearch && matchesStatus && matchesCustomer;
  });

  const uniqueCustomers = Array.from(
    new Map(
      pallets
        .filter((p) => p.customers)
        .map((p) => [
          p.customer_id,
          { id: p.customer_id, name: p.customers!.company_name || p.customers!.contact_person },
        ])
    ).values()
  );

  const hasActiveFilters =
    statusFilter !== "all" || customerFilter !== "all" || searchTerm !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setCustomerFilter("all");
    setSearchTerm("");
  };

  const handleViewDetail = (palletId: string) => {
    setSelectedPalletId(palletId);
    setDetailOpen(true);
  };

  const handleEditLocation = (pallet: Pallet) => {
    setEditLocationPalletId(pallet.id);
    setEditLocationValue(pallet.location || "");
    setEditLocationOpen(true);
  };

  const handleSaveLocation = async () => {
    if (!editLocationPalletId) return;
    try {
      const { error } = await supabase
        .from("pallets")
        .update({ location: editLocationValue.trim() || null })
        .eq("id", editLocationPalletId);

      if (error) throw error;
      toast.success("Location updated");
      setEditLocationOpen(false);
      fetchPallets();
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to update location";
      toast.error(message);
    }
  };

  const openDeleteDialog = async (palletId: string) => {
    setPalletToDelete(palletId);
    // Count inventory items that will be deleted with this pallet
    const { count } = await supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("pallet_id", palletId);
    setInventoryItemCount(count ?? 0);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!palletToDelete) return;
    try {
      // Delete inventory items created from this pallet first
      const { error: invError } = await supabase
        .from("inventory_items")
        .delete()
        .eq("pallet_id", palletToDelete);

      if (invError) throw invError;

      // Delete the pallet (pallet_items cascade automatically)
      const { error } = await supabase
        .from("pallets")
        .delete()
        .eq("id", palletToDelete);

      if (error) throw error;

      toast.success(
        inventoryItemCount > 0
          ? `Pallet and ${inventoryItemCount} inventory item${inventoryItemCount > 1 ? "s" : ""} deleted`
          : "Pallet deleted"
      );
      fetchPallets();
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to delete pallet";
      toast.error(message);
    } finally {
      setDeleteDialogOpen(false);
      setPalletToDelete(null);
      setInventoryItemCount(0);
    }
  };

  const statusLabel = (s: string) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pallets</h1>
          <p className="text-sm text-muted-foreground">
            Manage received pallets and their contents
          </p>
        </div>
        <Button onClick={() => setReceiveOpen(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Receive Pallets
        </Button>
      </div>

      <Card className="border border-border shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="text-xl font-semibold">All Pallets</CardTitle>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by pallet number, customer, container, location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {[statusFilter !== "all", customerFilter !== "all", searchTerm !== ""].filter(Boolean).length}
                </span>
              )}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="receiving">Receiving</SelectItem>
                    <SelectItem value="in_storage">In Storage</SelectItem>
                    <SelectItem value="partially_picked">Partially Picked</SelectItem>
                    <SelectItem value="empty">Empty</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Customer</label>
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {uniqueCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Showing {filteredPallets.length} of {pallets.length} pallets
          </div>
        </CardHeader>

        <CardContent>
          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner label="Loading pallets" />
              </div>
            ) : filteredPallets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No pallets found
              </div>
            ) : (
              filteredPallets.map((pallet) => (
                <div
                  key={pallet.id}
                  className="rounded-lg border border-border bg-card p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{pallet.pallet_number}</div>
                    <StatusBadge status={statusLabel(pallet.status)} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                    <div className="text-muted-foreground text-xs">Customer</div>
                    <div className="text-right">
                      {pallet.customers?.company_name || pallet.customers?.contact_person || "—"}
                    </div>
                    <div className="text-muted-foreground text-xs">Location</div>
                    <div className="text-right">{pallet.location || "—"}</div>
                    <div className="text-muted-foreground text-xs">Items</div>
                    <div className="text-right">{pallet.pallet_items.length} SKUs</div>
                    <div className="text-muted-foreground text-xs">Storage Charges</div>
                    <div className="text-right">
                      {pallet.storage_charges > 0 ? `£${pallet.storage_charges.toFixed(2)}` : "—"}
                    </div>
                    <div className="text-muted-foreground text-xs">Received</div>
                    <div className="text-right">
                      {new Date(pallet.received_date).toLocaleDateString("en-GB")}
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleViewDetail(pallet.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleEditLocation(pallet)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="w-full overflow-auto max-h-[calc(100vh-280px)] rounded-md border border-border">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-3 text-left font-medium">Pallet No.</th>
                    <th className="px-3 py-3 text-left font-medium">Customer</th>
                    <th className="px-3 py-3 text-left font-medium">Container</th>
                    <th className="px-3 py-3 text-left font-medium">Location</th>
                    <th className="px-3 py-3 text-left font-medium">SKUs</th>
                    <th className="px-3 py-3 text-left font-medium">Condition</th>
                    <th className="px-3 py-3 text-left font-medium">Storage Charges</th>
                    <th className="px-3 py-3 text-left font-medium">Status</th>
                    <th className="px-3 py-3 text-left font-medium">Received</th>
                    <th className="px-3 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                        Loading pallets...
                      </td>
                    </tr>
                  ) : filteredPallets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                        No pallets found
                      </td>
                    </tr>
                  ) : (
                    filteredPallets.map((pallet) => (
                      <tr
                        key={pallet.id}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <td className="px-3 py-3 font-medium whitespace-nowrap">
                          {pallet.pallet_number}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {pallet.customers?.company_name || pallet.customers?.contact_person || "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                          {pallet.container_number || "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {pallet.location || "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {pallet.pallet_items.length}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap capitalize">
                          {pallet.condition.replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {pallet.storage_charges > 0 ? `£${pallet.storage_charges.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <StatusBadge status={statusLabel(pallet.status)} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {new Date(pallet.received_date).toLocaleDateString("en-GB")}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewDetail(pallet.id)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditLocation(pallet)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                openDeleteDialog(pallet.id);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <ReceivePalletsDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        onSuccess={fetchPallets}
      />

      <PalletDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        palletId={selectedPalletId}
        showLocation={true}
      />

      {/* Edit Location Dialog */}
      <Dialog open={editLocationOpen} onOpenChange={setEditLocationOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Location</Label>
            <Input
              placeholder="e.g. Row B, Bay 3"
              value={editLocationValue}
              onChange={(e) => setEditLocationValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveLocation()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLocationOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLocation}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pallet?</AlertDialogTitle>
            <AlertDialogDescription>
              {inventoryItemCount > 0
                ? `This will permanently delete the pallet and ${inventoryItemCount} inventory item${inventoryItemCount > 1 ? "s" : ""} that were received with it. This action cannot be undone.`
                : "This will permanently delete the pallet. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
