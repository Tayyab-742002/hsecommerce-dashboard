import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, FileText, Clock, TrendingUp } from "lucide-react";
import { KPICard } from "@/components/KPICard";

export default function CustomerDashboard() {
  const { userRole } = useAuth();
  const [stats, setStats] = useState({
    totalItems: 0,
    pendingOrders: 0,
    currentCharges: 0,
    recentActivity: [] as any[],
  });

  useEffect(() => {
    if (userRole?.customer_id) {
      fetchCustomerData();
    }
  }, [userRole]);

  const fetchCustomerData = async () => {
    if (!userRole?.customer_id) return;

    // Fetch inventory count
    const { count: itemCount } = await supabase
      .from('inventory_items')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', userRole.customer_id);

    // Fetch pending orders
    const { count: pendingCount } = await supabase
      .from('outbound_orders')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', userRole.customer_id)
      .eq('status', 'pending');

    // Fetch recent orders for activity
    const { data: orders } = await supabase
      .from('outbound_orders')
      .select('*')
      .eq('customer_id', userRole.customer_id)
      .order('created_at', { ascending: false })
      .limit(5);

    setStats({
      totalItems: itemCount || 0,
      pendingOrders: pendingCount || 0,
      currentCharges: 0, // TODO: Calculate from invoices
      recentActivity: orders || [],
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to your HSEcommerce portal</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Items Stored"
          value={stats.totalItems}
          icon={Package}
        />
        <KPICard
          title="Pending Requests"
          value={stats.pendingOrders}
          icon={Clock}
        />
        <KPICard
          title="Current Charges"
          value={`$${stats.currentCharges.toFixed(2)}`}
          icon={TrendingUp}
        />
        <KPICard
          title="Active Orders"
          value={stats.recentActivity.length}
          icon={FileText}
        />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentActivity.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No recent activity</p>
          ) : (
            <div className="space-y-4">
              {stats.recentActivity.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div>
                    <p className="font-medium">{order.order_number}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.order_type} - {order.status}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
