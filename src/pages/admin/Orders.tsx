import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Search, RefreshCw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import OrderWizard from "@/components/OrderWizard";
import OrderStatusDialog from "@/components/OrderStatusDialog";
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
  priority: string;
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
        warehouses (warehouse_name)
      `
      )
      .order("created_at", { ascending: false });

    if (!error && data) {
      setOrders(data as Order[]);
    }
    setLoading(false);
  };

  const filteredOrders = orders.filter(
    (order) =>
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customers?.company_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  const handleStatusChange = (orderId: string, currentStatus: string) => {
    setSelectedOrder({ id: orderId, status: currentStatus });
    setStatusDialogOpen(true);
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Orders Management</h1>
          <p className="text-muted-foreground">
            Manage outbound orders and deliveries
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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

      <Card>
        <CardHeader>
          <CardTitle>All Orders</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search by order number or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 focus:border-none"
            />
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
              <div className="md:hidden space-y-3">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="border border-border rounded-[var(--radius-lg)] bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold whitespace-nowrap">
                        {order.order_number}
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
                      <div className="text-muted-foreground text-xs">
                        Priority
                      </div>
                      <div className="text-right capitalize">
                        {order.priority}
                      </div>
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
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleStatusChange(order.id, order.status)
                        }
                      >
                        <RefreshCw className="h-4 w-4 mr-1" /> Status
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setOrderToDelete(order.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: wide table */}
              <div className="hidden md:block w-full overflow-x-auto pb-2">
                <div className="table-container min-w-[1000px] pr-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order Number</th>
                        <th>Customer</th>
                        <th>Warehouse</th>
                        <th>Type</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Items</th>
                        <th>Requested Date</th>
                        <th>Scheduled</th>
                        <th>Completed</th>
                        <th>Charges</th>
                        <th>Contact</th>
                        <th>City</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr key={order.id}>
                          <td className="font-medium whitespace-nowrap">
                            {order.order_number}
                          </td>
                          <td className="whitespace-nowrap">
                            {order.customers?.company_name ||
                              order.customers?.contact_person}
                          </td>
                          <td className="whitespace-nowrap">
                            {order.warehouses?.warehouse_name}
                          </td>
                          <td className="capitalize whitespace-nowrap">
                            {order.order_type}
                          </td>
                          <td className="capitalize whitespace-nowrap">
                            {order.priority}
                          </td>
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
                          <td className="whitespace-nowrap">
                            {order.scheduled_date
                              ? new Date(
                                  order.scheduled_date
                                ).toLocaleDateString()
                              : "-"}
                          </td>
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
                            {order.delivery_contact_name || "-"}
                            {order.delivery_contact_phone
                              ? ` (${order.delivery_contact_phone})`
                              : ""}
                          </td>
                          <td className="whitespace-nowrap">
                            {order.delivery_city || "-"}
                          </td>
                          <td>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleStatusChange(order.id, order.status)
                                }
                              >
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Status
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setOrderToDelete(order.id);
                                  setDeleteDialogOpen(true);
                                }}
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
