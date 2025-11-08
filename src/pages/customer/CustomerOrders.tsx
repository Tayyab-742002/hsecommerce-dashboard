import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import OrderDetailsDialog from "@/components/OrderDetailsDialog";
import Spinner from "@/components/Spinner";
import { formatCurrency } from "@/lib/currency";
import { Search } from "lucide-react";

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

  const filteredOrders = orders.filter((order) =>
    order.order_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <CardTitle>Order History</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search orders..."
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
