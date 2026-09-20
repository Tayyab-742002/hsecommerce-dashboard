import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import OrderDetailsDialog from "@/components/OrderDetailsDialog";
import Spinner from "@/components/Spinner";
import { formatCurrency } from "@/lib/currency";
import { Search, Filter, X, Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import OrderWizard from "@/components/OrderWizard";
import { downloadLabel } from "@/lib/labels";
import { toast } from "sonner";
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

interface Order {
  id: string;
  order_number: string;
  status: string;
  order_type: string;
  priority?: string;
  requested_date: string;
  order_category?: string | null;
  label_path?: string | null;
  scheduled_date?: string | null;
  completed_date?: string | null;
  total_items: number;
  total_quantity: number;
  total_charges: number;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  delivery_city?: string | null;
  warehouses: {
    warehouse_name: string;
  };
  outbound_order_items?: Array<{
    order_item: string;
    quantity: number;
  }>;
}

export default function CustomerOrders() {
  const [searchTerm, setSearchTerm] = useState("");
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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

  // Folder list comes from its own query — the current page only holds 25 orders.
  // RLS scopes the function to this customer's own orders.
  const loadCategories = async () => {
    const { data } = await supabase.rpc("order_category_options");
    setCategories((data ?? []).map((row) => row.order_category));
  };

  useEffect(() => {
    if (customerId) loadCategories();
  }, [customerId]);

  const orders = usePagedQuery<Order>(
    customerId
      ? () => {
          let query = supabase
            .from("outbound_orders")
            .select(
              `
        *,
        warehouses (warehouse_name),
        outbound_order_items (order_item, quantity)
      `,
              { count: "exact" }
            )
            .eq("customer_id", customerId);

          if (debouncedSearch.trim()) {
            query = query.ilike("order_number", likeTerm(debouncedSearch));
          }

          const range = dateFilterRange(dateFilter);
          if (range) {
            query = query
              .gte("requested_date", range.from)
              .lte("requested_date", range.to);
          }

          if (statusFilter !== "all") query = query.eq("status", statusFilter);
          if (orderTypeFilter !== "all") {
            query = query.eq("order_type", orderTypeFilter);
          }
          if (categoryFilter === "none") {
            query = query.is("order_category", null);
          } else if (categoryFilter !== "all") {
            query = query.eq("order_category", categoryFilter);
          }

          return query
            .order("created_at", { ascending: false })
            .returns<Order[]>();
        }
      : null,
    [
      customerId,
      debouncedSearch,
      dateFilter,
      statusFilter,
      orderTypeFilter,
      categoryFilter,
    ]
  );

  const loading = customerLoading || orders.loading;

  const clearFilters = () => {
    setDateFilter("all");
    setStatusFilter("all");
    setOrderTypeFilter("all");
    setCategoryFilter("all");
  };

  const hasActiveFilters =
    dateFilter !== "all" ||
    statusFilter !== "all" ||
    orderTypeFilter !== "all" ||
    categoryFilter !== "all";

  const handleLabelDownload = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!order.label_path) return;
    try {
      await downloadLabel(order.label_path, order.order_number);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to download label"
      );
    }
  };

  const handleOrderClick = (orderId: string) => {
    setSelectedOrderId(orderId);
    setDetailsDialogOpen(true);
  };


  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">My Orders</h1>
          <p className="text-muted-foreground">
            Create and track your outbound orders
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" disabled={!customerId}>
              <Plus className="mr-2 h-4 w-4" />
              Create Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Order</DialogTitle>
            </DialogHeader>
            {customerId && (
              <OrderWizard
                customerId={customerId}
                onComplete={() => {
                  setCreateDialogOpen(false);
                  orders.refetch();
                  loadCategories();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Order History</CardTitle>
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
                  {[dateFilter !== "all", statusFilter !== "all", orderTypeFilter !== "all", categoryFilter !== "all"].filter(Boolean).length}
                </span>
              )}
            </Button>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search orders..."
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
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Order Type</label>
                  <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="pickup">Pickup</SelectItem>
                      <SelectItem value="delivery">Delivery</SelectItem>
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
                      <SelectItem value="none">Uncategorised</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
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


          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner label="Loading orders" />
            </div>
          ) : orders.rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders found
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {orders.rows.map((order) => (
                  <div
                    key={order.id}
                    className="border border-border rounded-[var(--radius-lg)] bg-card p-3 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleOrderClick(order.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{order.order_number}</div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                      <div className="text-muted-foreground text-xs">
                        Item Names
                      </div>
                      <div className="text-right">
                        {order.outbound_order_items
                          ?.map((item) => item.order_item)
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Warehouse
                      </div>
                      <div className="text-right">
                        {order.warehouses?.warehouse_name}
                      </div>
                      <div className="text-muted-foreground text-xs">Type</div>
                      <div className="text-right capitalize">
                        {order.order_type}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Category
                      </div>
                      <div className="text-right">
                        {order.order_category || "-"}
                      </div>
                      {/* <div className="text-muted-foreground text-xs">
                        Priority
                      </div>
                      <div className="text-right capitalize">
                        {order.priority || "-"}
                      </div> */}
                      <div className="text-muted-foreground text-xs">Items</div>
                      <div className="text-right">
                        {order.total_items} ({order.total_quantity})
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Requested
                      </div>
                      <div className="text-right">
                        {new Date(order.requested_date).toLocaleDateString()}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Charges
                      </div>
                      <div className="text-right font-medium">
                        {formatCurrency(order.total_charges ?? 0)}
                      </div>
                    </div>
                    {order.label_path && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={(e) => handleLabelDownload(order, e)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Shipping Label
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block w-full overflow-x-auto">
                <div className="table-container min-w-[960px] pr-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order Number</th>
                        <th>Category</th>
                        <th>Item Names</th>
                        <th>Warehouse</th>
                        <th>Type</th>
                        {/* <th>Priority</th> */}
                        <th>Status</th>
                        <th>Items</th>
                        <th>Dispatched</th>
                        {/* <th>Scheduled</th> */}
                        <th>Completed</th>
                        <th>Charges</th>
                        <th>Label</th>
                        {/* <th>Contact</th> */}
                        {/* <th>City</th> */}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.rows.map((order) => (
                        <tr
                          key={order.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleOrderClick(order.id)}
                        >
                          <td className="font-medium whitespace-nowrap">
                            {order.order_number}
                          </td>
                          <td className="whitespace-nowrap">
                            {order.order_category || "-"}
                          </td>
                          <td className="whitespace-nowrap">
                            {order.outbound_order_items
                              ?.map((item) => item.order_item)
                              .filter(Boolean)
                              .join(", ") || "-"}
                          </td>
                          <td className="whitespace-nowrap">
                            {order.warehouses?.warehouse_name}
                          </td>
                          <td className="capitalize whitespace-nowrap">
                            {order.order_type}
                          </td>
                          {/* <td className="capitalize whitespace-nowrap">
                            {order.priority || "-"}
                          </td> */}
                          <td>
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="whitespace-nowrap">
                            {order.total_items} ({order.total_quantity} units)
                          </td>
                          <td className="whitespace-nowrap">
                            {new Date(
                              order.requested_date
                            ).toLocaleDateString()}
                          </td>
                          {/* <td className="whitespace-nowrap">
                            {order.scheduled_date
                              ? new Date(
                                  order.scheduled_date
                                ).toLocaleDateString()
                              : "-"}
                          </td> */}
                          <td className="whitespace-nowrap">
                            {order.completed_date
                              ? new Date(
                                  order.completed_date
                                ).toLocaleDateString()
                              : "-"}
                          </td>
                          <td className="font-medium whitespace-nowrap">
                            {formatCurrency(order.total_charges ?? 0)}
                          </td>
                          <td className="whitespace-nowrap">
                            {order.label_path ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Download shipping label"
                                onClick={(e) => handleLabelDownload(order, e)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            ) : (
                              "-"
                            )}
                          </td>
                          {/* <td className="whitespace-nowrap">
                            {order.delivery_contact_name || "-"}
                            {order.delivery_contact_phone
                              ? ` (${order.delivery_contact_phone})`
                              : ""}
                          </td>  */}
                          {/* <td className="whitespace-nowrap">
                            {order.delivery_city || "-"}
                          </td> */}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            <TablePagination
              page={orders.page}
              pageCount={orders.pageCount}
              from={orders.from}
              to={orders.to}
              total={orders.total}
              onPageChange={orders.setPage}
              label="orders"
            />
            </>
          )}
        </CardContent>
      </Card>

      <OrderDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        orderId={selectedOrderId}
        showCustomerInfo={false}
      />
    </div>
  );
}
