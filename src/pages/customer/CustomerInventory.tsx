import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import Spinner from "@/components/Spinner";
import { Search, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InventoryItem {
  id: string;
  item_code: string;
  item_name: string;
  sku?: string;
  category?: string;
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
  warehouses: {
    warehouse_name: string;
  };
}

export default function CustomerInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole, error: roleError } = await supabase
      .from("user_roles")
      .select("customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // If no role found or no customer_id, user cannot access customer inventory
    if (roleError || !userRole?.customer_id) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .select(
        `
        *,
        warehouses (warehouse_name)
      `
      )
      .eq("customer_id", userRole.customer_id)
      .order("received_date", { ascending: false });

    if (!error && data) {
      setItems(data as InventoryItem[]);
    }
    setLoading(false);
  };

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
      item.item_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Date filter
    const matchesDate = filterByDate(item);
    
    // Status filter
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    
    // Category filter
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    
    return matchesSearch && matchesDate && matchesStatus && matchesCategory;
  });

  // Get unique categories for filter
  const categories = Array.from(new Set(items.map(item => item.category).filter(Boolean)));

  const clearFilters = () => {
    setDateFilter("all");
    setStatusFilter("all");
    setCategoryFilter("all");
  };

  const hasActiveFilters = dateFilter !== "all" || statusFilter !== "all" || categoryFilter !== "all";

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">My Inventory</h1>
        <p className="text-muted-foreground">View your stored items</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Inventory Items</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="relative"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <span className="ml-2 bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                  {[dateFilter !== "all", statusFilter !== "all", categoryFilter !== "all"].filter(Boolean).length}
                </span>
              )}
            </Button>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 focus:border-none"
              />
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <Select value={dateFilter} onValueChange={(value: any) => setDateFilter(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="in_stock">In Stock</SelectItem>
                      <SelectItem value="low_stock">Low Stock</SelectItem>
                      <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue />
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

                {hasActiveFilters && (
                  <div className="md:col-span-3 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-4 w-4 mr-2" />
                      Clear Filters
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              Showing {filteredItems.length} of {items.length} items
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner label="Loading inventory" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No inventory items found
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="border border-border rounded-[var(--radius-lg)] bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">
                        {item.item_code} — {item.item_name}
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                      {/* <div className="text-muted-foreground text-xs">
                        Warehouse
                      </div>
                      <div className="text-right">
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
                      </div>
                      <div className="text-right">
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
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block w-full overflow-x-auto">
                <div className="table-container min-w-[920px] pr-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item Code</th>
                        <th>Item Name</th>
                        {/* <th>SKU</th> */}
                        <th>Category</th>
                        {/* <th>Warehouse</th> */}
                        <th>Quantity / Total</th>
                        {/* <th>UoM</th> */}
                        {/* <th>Weight</th> */}
                        {/* <th>Dimensions</th> */}
                        <th>Status</th>
                        <th>Received Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item) => (
                        <tr key={item.id}>
                          <td className="font-medium whitespace-nowrap">
                            {item.item_code}
                          </td>
                          <td className="whitespace-nowrap">
                            {item.item_name}
                          </td>
                          {/* <td className="whitespace-nowrap">
                            {item.sku || "-"}
                          </td> */}
                          <td className="capitalize whitespace-nowrap">
                            {item.category || "-"}
                          </td>
                          {/* <td className="whitespace-nowrap">
                            {item.warehouses?.warehouse_name}
                          </td> */}
                          <td className="whitespace-nowrap">
                            {item.quantity} /{" "}
                            {item.total_quantity ?? item.quantity}
                          </td>
                          {/* <td className="whitespace-nowrap">
                            {item.unit_of_measure || "pcs"}
                          </td> */}
                          {/* <td className="whitespace-nowrap">
                            {item.weight
                              ? `${item.weight} ${item.weight_unit || "kg"}`
                              : "-"}
                          </td> */}
                          {/* <td className="whitespace-nowrap">
                            {item.dimension_length &&
                            item.dimension_width &&
                            item.dimension_height
                              ? `${item.dimension_length}×${
                                  item.dimension_width
                                }×${item.dimension_height} ${
                                  item.dimension_unit || "cm"
                                }`
                              : "-"}
                          </td> */}
                          <td>
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="whitespace-nowrap">
                            {new Date(item.received_date).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
