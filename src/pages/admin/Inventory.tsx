import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import InventoryFormDialog from "@/components/InventoryFormDialog";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
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

interface InventoryItem {
  id: string;
  item_code: string;
  item_name: string;
  sku?: string;
  category?: string;
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
  status: string;
  received_date: string;
  customers: {
    company_name: string;
    contact_person: string;
  };
  warehouses: {
    warehouse_name: string;
  };
}

export default function AdminInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const customerId = searchParams.get('customer');
      let query = supabase
        .from('inventory_items')
        .select(`
          *,
          customers (company_name, contact_person),
          warehouses (warehouse_name)
        `);

      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item =>
    item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.customers?.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedItem(undefined);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", itemToDelete);

      if (error) throw error;
      toast.success("Inventory item deleted successfully");
      fetchInventory();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventory Management</h1>
          <p className="text-muted-foreground">Manage all warehouse inventory items</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Inventory Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by item code, name, or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading inventory...</div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No items found</div>
              ) : (
                filteredItems.map((item) => (
                  <div key={item.id} className="border border-border rounded-lg bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{item.item_code} — {item.item_name}</div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Customer</div>
                      <div className="text-right">{item.customers?.company_name || item.customers?.contact_person}</div>
                      <div className="text-muted-foreground">Warehouse</div>
                      <div className="text-right">{item.warehouses?.warehouse_name}</div>
                      <div className="text-muted-foreground">SKU</div>
                      <div className="text-right">{item.sku || '-'}</div>
                      <div className="text-muted-foreground">Category</div>
                      <div className="text-right capitalize">{item.category || '-'}</div>
                      <div className="text-muted-foreground">Qty</div>
                      <div className="text-right">{item.quantity} {item.unit_of_measure || 'pcs'}</div>
                      <div className="text-muted-foreground">Weight</div>
                      <div className="text-right">{item.weight ? `${item.weight} ${item.weight_unit || 'kg'}` : '-'}</div>
                      <div className="text-muted-foreground">Size</div>
                      <div className="text-right">{item.dimension_length && item.dimension_width && item.dimension_height ? `${item.dimension_length}×${item.dimension_width}×${item.dimension_height} ${item.dimension_unit || 'cm'}` : '-'}</div>
                      <div className="text-muted-foreground">Received</div>
                      <div className="text-right">{new Date(item.received_date).toLocaleDateString()}</div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setItemToDelete(item.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block w-full overflow-x-auto">
              <div className="table-container min-w-[920px] pr-4">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item Code</th>
                      <th>Item Name</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>Customer</th>
                      <th>Warehouse</th>
                      <th>Quantity</th>
                      <th>UoM</th>
                      <th>Weight</th>
                      <th>Dimensions</th>
                      <th>Status</th>
                      <th>Received Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={13} className="text-center py-8 text-muted-foreground">Loading inventory...</td>
                      </tr>
                    ) : filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="text-center py-8 text-muted-foreground">No items found</td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => (
                        <tr key={item.id}>
                          <td className="font-medium whitespace-nowrap">{item.item_code}</td>
                          <td className="whitespace-nowrap">{item.item_name}</td>
                          <td className="whitespace-nowrap">{item.sku || '-'}</td>
                          <td className="capitalize whitespace-nowrap">{item.category || '-'}</td>
                          <td className="whitespace-nowrap">{item.customers?.company_name || item.customers?.contact_person}</td>
                          <td className="whitespace-nowrap">{item.warehouses?.warehouse_name}</td>
                          <td className="whitespace-nowrap">{item.quantity}</td>
                          <td className="whitespace-nowrap">{item.unit_of_measure || 'pcs'}</td>
                          <td className="whitespace-nowrap">{item.weight ? `${item.weight} ${item.weight_unit || 'kg'}` : '-'}</td>
                          <td className="whitespace-nowrap">{item.dimension_length && item.dimension_width && item.dimension_height ? `${item.dimension_length}×${item.dimension_width}×${item.dimension_height} ${item.dimension_unit || 'cm'}` : '-'}</td>
                          <td><StatusBadge status={item.status} /></td>
                          <td className="whitespace-nowrap">{new Date(item.received_date).toLocaleDateString()}</td>
                          <td>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleEdit(item)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setItemToDelete(item.id);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
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
          </>
        </CardContent>
      </Card>

      <InventoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={selectedItem}
        onSuccess={fetchInventory}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this inventory item. This action cannot be undone.
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
