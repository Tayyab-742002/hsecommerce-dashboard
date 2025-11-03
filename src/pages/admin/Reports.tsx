import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/KPICard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Package, TrendingUp, DollarSign, FileText } from "lucide-react";

const COLORS = ['#FBBF24', '#F59E0B', '#D97706', '#B45309', '#92400E'];

export default function AdminReports() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    monthlyOrders: 0,
    inventoryValue: 0,
    activeCustomers: 0
  });
  const [ordersByStatus, setOrdersByStatus] = useState<any[]>([]);
  const [inventoryByCategory, setInventoryByCategory] = useState<any[]>([]);
  const [revenueByMonth, setRevenueByMonth] = useState<any[]>([]);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    // Fetch total revenue
    const { data: orders } = await supabase
      .from('outbound_orders')
      .select('total_charges');
    const totalRevenue = orders?.reduce((sum, order) => sum + (order.total_charges || 0), 0) || 0;

    // Fetch monthly orders
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const { count: monthlyOrders } = await supabase
      .from('outbound_orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString());

    // Fetch inventory value
    const { data: inventory } = await supabase
      .from('inventory_items')
      .select('declared_value, quantity');
    const inventoryValue = inventory?.reduce((sum, item) => 
      sum + ((item.declared_value || 0) * item.quantity), 0) || 0;

    // Fetch active customers
    const { count: activeCustomers } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    setStats({
      totalRevenue,
      monthlyOrders: monthlyOrders || 0,
      inventoryValue,
      activeCustomers: activeCustomers || 0
    });

    // Orders by status
    const { data: statusData } = await supabase
      .from('outbound_orders')
      .select('status');
    const statusCounts = statusData?.reduce((acc: any, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});
    setOrdersByStatus(Object.entries(statusCounts || {}).map(([name, value]) => ({ name, value })));

    // Inventory by category
    const { data: categoryData } = await supabase
      .from('inventory_items')
      .select('category, quantity');
    const categoryCounts = categoryData?.reduce((acc: any, item) => {
      const cat = item.category || 'uncategorized';
      acc[cat] = (acc[cat] || 0) + item.quantity;
      return acc;
    }, {});
    setInventoryByCategory(Object.entries(categoryCounts || {}).map(([name, value]) => ({ name, value })));

    // Revenue by month (last 6 months)
    const monthlyRevenue: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const { data } = await supabase
        .from('outbound_orders')
        .select('total_charges')
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());
      
      const revenue = data?.reduce((sum, order) => sum + (order.total_charges || 0), 0) || 0;
      monthlyRevenue.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
        revenue: revenue
      });
    }
    setRevenueByMonth(monthlyRevenue);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-lg">
          <FileText className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">Business insights and performance metrics</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Revenue"
          value={`PKR ${stats.totalRevenue.toFixed(2)}`}
          icon={DollarSign}
        />
        <KPICard
          title="Monthly Orders"
          value={stats.monthlyOrders}
          icon={TrendingUp}
        />
        <KPICard
          title="Inventory Value"
          value={`PKR ${stats.inventoryValue.toFixed(2)}`}
          icon={Package}
        />
        <KPICard
          title="Active Customers"
          value={stats.activeCustomers}
          icon={FileText}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="revenue" fill="#FBBF24" name="Revenue (PKR)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={ordersByStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {ordersByStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={inventoryByCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#F59E0B" name="Quantity" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
