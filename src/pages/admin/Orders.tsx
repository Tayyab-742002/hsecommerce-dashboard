import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Search, RefreshCw, Trash2, Filter, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import OrderWizard from "@/components/OrderWizard";
import OrderStatusDialog from "@/components/OrderStatusDialog";
import OrderDetailsDialog from "@/components/OrderDetailsDialog";
import { toast } from "sonner";
import Spinner from "@/components/Spinner";
import { formatCurrency } from "@/lib/currency";
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

interface Order {
  id: string;
  order_number: string;
  status: string;
  order_type: string;
  requested_date: string;
  scheduled_date: string | null;
  completed_date: string | null;
  total_items: number;
  total_quantity: number;
  total_charges: number;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;
  delivery_city?: string | null;
  customers: {
    company_name: string;
    contact_person: string;
  };
  warehouses: {
    warehouse_name: string;
  };
  outbound_order_items?: Array<{
    order_item: string;
    quantity: number;
  }>;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<{
    id: string;
    status: string;
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  
  // Filter states
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("outbound_orders")
      .select(
        `
        *,
        customers (company_name, contact_person),
        warehouses (warehouse_name),
        outbound_order_items (order_item, quantity)
      `
      )
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
    const matchesSearch =
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customers?.company_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());
    
    // Date filter
    const matchesDate = filterByDate(order);
    
    // Status filter
    const matchesStatus =
      statusFilter === "all" || order.status === statusFilter;
    
    // Order type filter
    const matchesOrderType =
      orderTypeFilter === "all" || order.order_type === orderTypeFilter;
    
    return matchesSearch && matchesDate && matchesStatus && matchesOrderType;
  });

  // Clear all filters
  const clearFilters = () => {
    setDateFilter("all");
    setStatusFilter("all");
    setOrderTypeFilter("all");
    setSearchTerm("");
  };

  const hasActiveFilters = 
    dateFilter !== "all" || 
    statusFilter !== "all" || 
    orderTypeFilter !== "all" || 
    searchTerm !== "";

  const handleStatusChange = (orderId: string, currentStatus: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedOrder({ id: orderId, status: currentStatus });
    setStatusDialogOpen(true);
  };

  const handleOrderClick = (orderId: string) => {
    setSelectedOrderId(orderId);
    setDetailsDialogOpen(true);
  };

  const handleDeleteClick = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrderToDelete(orderId);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!orderToDelete) return;

    try {
      const { error } = await supabase
        .from("outbound_orders")
        .delete()
        .eq("id", orderToDelete);

      if (error) throw error;
      toast.success("Order deleted successfully");
      fetchOrders();
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to delete order";
      toast.error(message);
    } finally {
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Orders Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage outbound orders and deliveries
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Create Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Order</DialogTitle>
              </DialogHeader>
              <OrderWizard
                onComplete={() => {
                  setDialogOpen(false);
                  fetchOrders();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border border-border shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="text-xl font-semibold">All Orders</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 transform h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order number or customer..."
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
                  {[dateFilter !== "all", statusFilter !== "all", orderTypeFilter !== "all", searchTerm !== ""].filter(Boolean).length}
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
                <label className="text-sm font-medium">Order Date</label>
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Order Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Order Type</label>
                <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="pickup">Pickup</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          {/* Results Count */}
          <div className="text-sm text-muted-foreground">
            Showing {filteredOrders.length} of {orders.length} orders
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
              {/* Mobile: card list */}
              <div className="space-y-3 sm:hidden">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-lg border border-border bg-card p-3 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleOrderClick(order.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold whitespace-nowrap">
                        {order.outbound_order_items
                          ?.map((item) => item.order_item)
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                      <div className="text-muted-foreground text-xs">
                        Customer
                      </div>
                      <div className="text-right">
                        {order.customers?.company_name ||
                          order.customers?.contact_person}
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
                      <div className="text-muted-foreground text-xs">Items</div>
                      <div className="text-right">
                        {order.total_items} ({order.total_quantity})
                      </div>
                      {/* <div className="text-muted-foreground text-xs">
                        Item Names
                      </div>
                      <div className="text-right text-xs">
                        {order.outbound_order_items
                          ?.map((item) => item.order_item)
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </div> */}
                      <div className="text-muted-foreground text-xs">
                        Dispatched
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
                    <div 
                      className="mt-3 flex justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) =>
                          handleStatusChange(order.id, order.status, e)
                        }
                      >
                        <RefreshCw className="h-4 w-4 mr-1" /> Status
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => handleDeleteClick(order.id, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: wide table */}
              <div className="hidden sm:block">
                <div className="w-full overflow-x-auto pb-2">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-3 text-left font-medium">
                          Item Names
                        </th>
                        <th className="px-3 py-3 text-left font-medium">
                          Customer
                        </th>
                        <th className="px-3 py-3 text-left font-medium">
                          Warehouse
                        </th>
                        <th className="px-3 py-3 text-left font-medium">
                          Type
                        </th>
                        <th className="px-3 py-3 text-left font-medium">
                          Status
                        </th>
                        <th className="px-3 py-3 text-left font-medium">
                          Items (Count)
                        </th>
                        {/* <th className="px-3 py-3 text-left font-medium">
                          Item Names
                        </th> */}
                        <th className="px-3 py-3 text-left font-medium">
                          Dispatched
                        </th>
                        {/* <th className="px-3 py-3 text-left font-medium">
                          Scheduled
                        </th> */}
                        <th className="px-3 py-3 text-left font-medium">
                          Completed
                        </th>
                        <th className="px-3 py-3 text-left font-medium">
                          Charges
                        </th>
                        {/* <th className="px-3 py-3 text-left font-medium">
                          Contact
                        </th> */}
                        {/* <th className="px-3 py-3 text-left font-medium">
                          City
                        </th> */}
                        <th className="px-3 py-3 text-left font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="border-b border-border/60 last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleOrderClick(order.id)}
                        >
                          <td className="px-3 py-3 font-medium whitespace-nowrap">
                            {order.outbound_order_items
                              ?.map((item) => item.order_item)
                              .filter(Boolean)
                              .join(", ") || "-"}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {order.customers?.company_name ||
                              order.customers?.contact_person}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {order.warehouses?.warehouse_name}
                          </td>
                          <td className="px-3 py-3 capitalize whitespace-nowrap">
                            {order.order_type}
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {order.total_items} ({order.total_quantity} units)
                          </td>
                          {/* <td className="px-3 py-3 text-sm max-w-xs truncate">
                            {order.outbound_order_items
                              ?.map((item) => item.order_item)
                              .filter(Boolean)
                              .join(", ") || "-"}
                          </td> */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            {new Date(
                              order.requested_date
                            ).toLocaleDateString()}
                          </td>
                          {/* <td className="px-3 py-3 whitespace-nowrap">
                            {order.scheduled_date
                              ? new Date(
                                  order.scheduled_date
                                ).toLocaleDateString()
                              : "-"}
                          </td> */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            {order.completed_date
                              ? new Date(
                                  order.completed_date
                                ).toLocaleDateString()
                              : "-"}
                          </td>
                          <td className="px-3 py-3 font-medium whitespace-nowrap">
                            {formatCurrency(order.total_charges ?? 0)}
                          </td>
                          {/* <td className="px-3 py-3 whitespace-nowrap">
                            {order.delivery_contact_name || "-"}
                            {order.delivery_contact_phone
                              ? ` (${order.delivery_contact_phone})`
                              : ""}
                          </td> */}
                          {/* <td className="px-3 py-3 whitespace-nowrap">
                            {order.delivery_city || "-"}
                          </td> */}
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) =>
                                  handleStatusChange(order.id, order.status, e)
                                }
                              >
                                <RefreshCw className="mr-1 h-4 w-4" /> Status
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={(e) => handleDeleteClick(order.id, e)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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

      {selectedOrder && (
        <OrderStatusDialog
          open={statusDialogOpen}
          onOpenChange={setStatusDialogOpen}
          orderId={selectedOrder.id}
          currentStatus={selectedOrder.status}
          onSuccess={fetchOrders}
        />
      )}

      <OrderDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        orderId={selectedOrderId}
        showCustomerInfo={true}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this order and all associated items.
              This action cannot be undone.
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
