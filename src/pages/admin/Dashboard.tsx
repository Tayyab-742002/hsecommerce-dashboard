import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KPICard } from "@/components/KPICard";
import { Package, TrendingUp, Users, Warehouse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";

interface DashboardStats {
  totalInventory: number;
  totalCustomers: number;
  pendingOrders: number;
  warehouseCapacity: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalInventory: 0,
    totalCustomers: 0,
    pendingOrders: 0,
    warehouseCapacity: 0,
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    // Fetch inventory count
    const { count: inventoryCount } = await supabase
      .from('inventory_items')
      .select('*', { count: 'exact', head: true });

    // Fetch customer count
    const { count: customerCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });

    // Fetch pending orders count
    const { count: pendingCount } = await supabase
      .from('outbound_orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Fetch warehouse capacity
    const { data: warehouse } = await supabase
      .from('warehouses')
      .select('total_capacity')
      .single();

    // Fetch recent orders
    const { data: orders } = await supabase
      .from('outbound_orders')
      .select(`
        *,
        customers (company_name, contact_person)
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    setStats({
      totalInventory: inventoryCount || 0,
      totalCustomers: customerCount || 0,
      pendingOrders: pendingCount || 0,
      warehouseCapacity: warehouse?.total_capacity || 0,
    });

    setRecentOrders(orders || []);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to Depot Buddy Admin Portal</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Inventory"
          value={stats.totalInventory}
          icon={Package}
        />
        <KPICard
          title="Active Customers"
          value={stats.totalCustomers}
          icon={Users}
        />
        <KPICard
          title="Pending Orders"
          value={stats.pendingOrders}
          icon={TrendingUp}
        />
        <KPICard
          title="Warehouse Capacity"
          value={`${stats.warehouseCapacity} sqft`}
          icon={Warehouse}
        />
      </div>

      {/* Recent Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order Number</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Requested Date</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="font-medium">{order.order_number}</td>
                    <td>{order.customers?.company_name || order.customers?.contact_person}</td>
                    <td className="capitalize">{order.order_type}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td>{new Date(order.requested_date).toLocaleDateString()}</td>
                    <td>{order.total_items}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
