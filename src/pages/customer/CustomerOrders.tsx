import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Search } from "lucide-react";

interface Order {
  id: string;
  order_number: string;
  status: string;
  order_type: string;
  requested_date: string;
  total_items: number;
  total_quantity: number;
  total_charges: number;
  warehouses: {
    warehouse_name: string;
  };
}

export default function CustomerOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('customer_id')
      .eq('user_id', user.id)
      .single();

    if (!userRole?.customer_id) return;

    const { data, error } = await supabase
      .from('outbound_orders')
      .select(`
        *,
        warehouses (warehouse_name)
      `)
      .eq('customer_id', userRole.customer_id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data as Order[]);
    }
    setLoading(false);
  };

  const filteredOrders = orders.filter(order =>
    order.order_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders found
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order Number</th>
                    <th>Warehouse</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Requested Date</th>
                    <th>Charges</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="font-medium">{order.order_number}</td>
                      <td>{order.warehouses?.warehouse_name}</td>
                      <td className="capitalize">{order.order_type}</td>
                      <td><StatusBadge status={order.status} /></td>
                      <td>{order.total_items} ({order.total_quantity} units)</td>
                      <td>{new Date(order.requested_date).toLocaleDateString()}</td>
                      <td className="font-medium">PKR {order.total_charges?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
