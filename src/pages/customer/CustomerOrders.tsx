import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import OrderDetailsDialog from "@/components/OrderDetailsDialog";
import Spinner from "@/components/Spinner";
import { formatCurrency } from "@/lib/currency";
import { Search, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Order {
  id: string;
  order_number: string;
  status: string;
  order_type: string;
  priority?: string;
  requested_date: string;
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole, error: roleError } = await supabase
      .from("user_roles")
      .select("customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // If no role found or no customer_id, user cannot access customer orders
    if (roleError || !userRole?.customer_id) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("outbound_orders")
      .select(
        `
        *,
        warehouses (warehouse_name),
        outbound_order_items (order_item, quantity)
      `
      )
      .eq("customer_id", userRole.customer_id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setOrders(data as unknown as Order[]);
    }
    setLoading(false);
  };

  // Helper function to filter by date
  const filterByDate = (order: Order) => {
    if (dateFilter === "all") return true;
    
    // Extract date parts from the order date string (format: YYYY-MM-DD)
    const orderDateStr = order.requested_date.split('T')[0]; // Get just the date part
    const [orderYear, orderMonth, orderDay] = orderDateStr.split('-').map(Number);
    
    // Create date objects at midnight local time
    const orderDate = new Date(orderYear, orderMonth - 1, orderDay);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (dateFilter) {
      case "today":
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        const todayDay = today.getDate();
        return orderYear === todayYear && orderMonth - 1 === todayMonth && orderDay === todayDay;
      case "week":
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        return orderDate >= weekAgo && orderDate <= today;
      case "month":
        const monthAgo = new Date(today);
        monthAgo.setDate(today.getDate() - 30); // Last 30 days
        return orderDate >= monthAgo && orderDate <= today;
      default:
        return true;
    }
  };

  const filteredOrders = orders.filter((order) => {
    // Search filter
    const matchesSearch = order.order_number.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Date filter
    const matchesDate = filterByDate(order);
    
    // Status filter
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    // Order type filter
    const matchesOrderType = orderTypeFilter === "all" || order.order_type === orderTypeFilter;
    
    return matchesSearch && matchesDate && matchesStatus && matchesOrderType;
  });

  const clearFilters = () => {
    setDateFilter("all");
    setStatusFilter("all");
    setOrderTypeFilter("all");
  };

  const hasActiveFilters = dateFilter !== "all" || statusFilter !== "all" || orderTypeFilter !== "all";

  const handleOrderClick = (orderId: string) => {
    setSelectedOrderId(orderId);
    setDetailsDialogOpen(true);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">My Orders</h1>
        <p className="text-muted-foreground">Track your outbound orders</p>
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
                  {[dateFilter !== "all", statusFilter !== "all", orderTypeFilter !== "all"].filter(Boolean).length}
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
              Showing {filteredOrders.length} of {orders.length} orders
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner label="Loading orders" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders found
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {filteredOrders.map((order) => (
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
                        {/* <th>Contact</th> */}
                        {/* <th>City</th> */}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleOrderClick(order.id)}
                        >
                          <td className="font-medium whitespace-nowrap">
                            {order.order_number}
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
