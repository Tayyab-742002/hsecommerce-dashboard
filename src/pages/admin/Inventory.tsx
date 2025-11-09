import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, Pencil, Trash2, Filter, X } from "lucide-react";
import InventoryFormDialog from "@/components/InventoryFormDialog";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { useSearchParams } from "react-router-dom";
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

interface InventoryItem {
  id: string;
  item_code: string;
  item_name: string;
  sku?: string;
  category?: string;
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
  
  // Filter states
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const fetchInventory = useCallback(async () => {
    try {
      const customerId = searchParams.get("customer");
      let query = supabase.from("inventory_items").select(`
          *,
          customers (company_name, contact_person),
          warehouses (warehouse_name)
        `);

      if (customerId) {
        query = query.eq("customer_id", customerId);
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Helper function to filter by date
  const filterByDate = (item: InventoryItem) => {
    if (dateFilter === "all") return true;
    
    // Extract date parts from the item date string (format: YYYY-MM-DD)
    const itemDateStr = item.received_date.split('T')[0]; // Get just the date part
    const [itemYear, itemMonth, itemDay] = itemDateStr.split('-').map(Number);
    
    // Create date objects at midnight local time
    const itemDate = new Date(itemYear, itemMonth - 1, itemDay);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (dateFilter) {
      case "today":
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        const todayDay = today.getDate();
        return itemYear === todayYear && itemMonth - 1 === todayMonth && itemDay === todayDay;
      case "week":
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        return itemDate >= weekAgo && itemDate <= today;
      case "month":
        const monthAgo = new Date(today);
        monthAgo.setDate(today.getDate() - 30); // Last 30 days
        return itemDate >= monthAgo && itemDate <= today;
      default:
        return true;
    }
  };

  const filteredItems = items.filter((item) => {
    // Search filter
    const matchesSearch =
      item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customers?.company_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());
    
    // Date filter
    const matchesDate = filterByDate(item);
    
    // Status filter
    const matchesStatus =
      statusFilter === "all" || item.status === statusFilter;
    
    // Category filter
    const matchesCategory =
      categoryFilter === "all" || 
      item.category?.toLowerCase() === categoryFilter.toLowerCase();
    
    return matchesSearch && matchesDate && matchesStatus && matchesCategory;
  });

  // Get unique categories for filter
  const categories = Array.from(
    new Set(items.map((item) => item.category).filter(Boolean))
  );

  // Clear all filters
  const clearFilters = () => {
    setDateFilter("all");
    setStatusFilter("all");
    setCategoryFilter("all");
    setSearchTerm("");
  };

  const hasActiveFilters = 
    dateFilter !== "all" || 
    statusFilter !== "all" || 
    categoryFilter !== "all" || 
    searchTerm !== "";

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
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to delete inventory item";
      toast.error(message);
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Inventory Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage all warehouse inventory items
          </p>
        </div>
        <Button onClick={handleAdd} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </div>

      <Card className="border border-border shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="text-xl font-semibold">
            All Inventory Items
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 transform h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by item code, name, or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Filter Toggle Button */}
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
                  {[dateFilter !== "all", statusFilter !== "all", categoryFilter !== "all", searchTerm !== ""].filter(Boolean).length}
                </span>
              )}
            </Button>
            
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Filter Options */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
              {/* Date Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Received Date</label>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="in_stock">In Stock</SelectItem>
                    <SelectItem value="low_stock">Low Stock</SelectItem>
                    <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Category Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category || ""}>
                        {category || "Uncategorized"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          {/* Results Count */}
          <div className="text-sm text-muted-foreground">
            Showing {filteredItems.length} of {items.length} items
          </div>
        </CardHeader>
        <CardContent>
          <>
            {/* Mobile cards */}
            <div className="space-y-3 sm:hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner label="Loading inventory" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No items found
                </div>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        {item.item_code} — {item.item_name}
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                      <div className="text-muted-foreground text-xs">
                        Customer
                      </div>
                      <div className="text-right">
                        {item.customers?.company_name ||
                          item.customers?.contact_person}
                      </div>
                      {/* <div className="text-muted-foreground text-xs">
                        Warehouse
                      </div> */}
                      {/* <div className="text-right">
                        {item.warehouses?.warehouse_name}
                      </div> */}
                      {/* <div className="text-muted-foreground text-xs">SKU</div>
                      <div className="text-right">{item.sku || "-"}</div> */}
                      <div className="text-muted-foreground text-xs">
                        Category
                      </div>
                      <div className="text-right capitalize">
                        {item.category || "-"}
                      </div>
                      <div className="text-muted-foreground text-xs">Qty</div>
                      <div className="text-right">
                        {item.quantity} / {item.total_quantity ?? item.quantity}{" "}
                        {item.unit_of_measure || "pcs"}
                      </div>
                      {/* <div className="text-muted-foreground text-xs">
                        Weight
                      </div> */}
                      {/* <div className="text-right">
                        {item.weight
                          ? `${item.weight} ${item.weight_unit || "kg"}`
                          : "-"}
                      </div> */}
                      {/* <div className="text-muted-foreground text-xs">Size</div>
                      <div className="text-right">
                        {item.dimension_length &&
                        item.dimension_width &&
                        item.dimension_height
                          ? `${item.dimension_length}×${item.dimension_width}×${
                              item.dimension_height
                            } ${item.dimension_unit || "cm"}`
                          : "-"}
                      </div> */}
                      <div className="text-muted-foreground text-xs">
                        Received
                      </div>
                      <div className="text-right">
                        {new Date(item.received_date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(item)}
                      >
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
            <div className="hidden sm:block">
              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-3 text-left font-medium">
                        Item Code
                      </th>
                      <th className="px-3 py-3 text-left font-medium">
                        Item Name
                      </th>
                      <th className="px-3 py-3 text-left font-medium">
                        Category
                      </th>
                      <th className="px-3 py-3 text-left font-medium">
                        Customer
                      </th>
                      <th className="px-3 py-3 text-left font-medium">
                        Quantity / Total
                      </th>
                      {/* <th className="px-3 py-3 text-left font-medium">
                        Weight
                      </th> */}
                      <th className="px-3 py-3 text-left font-medium">
                        Status
                      </th>
                      <th className="px-3 py-3 text-left font-medium">
                        Received Date
                      </th>
                      <th className="px-3 py-3 text-left font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          Loading inventory...
                        </td>
                      </tr>
                    ) : filteredItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          No items found
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <td className="px-3 py-3 font-medium whitespace-nowrap">
                            {item.item_code}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {item.item_name}
                          </td>
                          <td className="px-3 py-3 capitalize whitespace-nowrap">
                            {item.category || "-"}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {item.customers?.company_name ||
                              item.customers?.contact_person}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {item.quantity} /{" "}
                            {item.total_quantity ?? item.quantity}
                          </td>
                          {/* <td className="px-3 py-3 whitespace-nowrap">
                            {item.weight
                              ? `${item.weight} ${item.weight_unit || "kg"}`
                              : "-"}
                          </td> */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {new Date(item.received_date).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(item)}
                              >
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
              This will permanently delete this inventory item. This action
              cannot be undone.
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
