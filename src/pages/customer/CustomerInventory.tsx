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
import TablePagination from "@/components/TablePagination";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { useDebounced } from "@/hooks/useDebounced";
import { dateFilterRange, likeTerm } from "@/lib/dateRange";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const debouncedSearch = useDebounced(searchTerm);

  useEffect(() => {
    resolveCustomer();
  }, []);

  const resolveCustomer = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCustomerLoading(false);
      return;
    }

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    setCustomerId(userRole?.customer_id ?? null);
    setCustomerLoading(false);
  };

  const items = usePagedQuery<InventoryItem>(
    customerId
      ? () => {
          let query = supabase
            .from("inventory_items")
            .select("*, warehouses (warehouse_name)", { count: "exact" })
            .eq("customer_id", customerId);

          const term = debouncedSearch.trim();
          if (term) {
            query = query.or(
              [
                `item_code.ilike.${likeTerm(term)}`,
                `item_name.ilike.${likeTerm(term)}`,
              ].join(",")
            );
          }

          const range = dateFilterRange(dateFilter);
          if (range) {
            query = query
              .gte("received_date", range.from)
              .lte("received_date", range.to);
          }

          if (statusFilter !== "all") query = query.eq("status", statusFilter);
          if (categoryFilter !== "all") {
            query = query.eq("category", categoryFilter);
          }

          return query
            .order("received_date", { ascending: false })
            .returns<InventoryItem[]>();
        }
      : null,
    [customerId, debouncedSearch, dateFilter, statusFilter, categoryFilter]
  );

  const loading = customerLoading || items.loading;

  // Category options for this customer, fetched separately from the page of rows
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .rpc("inventory_category_options")
      .then(({ data }) => setCategories((data ?? []).map((row) => row.category)));
  }, []);

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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner label="Loading inventory" />
            </div>
          ) : items.rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No inventory items found
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {items.rows.map((item) => (
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
                      {items.rows.map((item) => (
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
            <TablePagination
            page={items.page}
            pageCount={items.pageCount}
            from={items.from}
            to={items.to}
            total={items.total}
            onPageChange={items.setPage}
            label="items"
          />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
