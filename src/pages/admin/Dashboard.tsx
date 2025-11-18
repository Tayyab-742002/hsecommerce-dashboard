import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KPICard } from "@/components/KPICard";
import {
  Package,
  TrendingUp,
  Users,
  Warehouse,
  RefreshCw,
  Boxes,
  PoundSterling,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";

interface DashboardStats {
  todayRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  totalInventory: number;
  totalCustomers: number;
  pendingOrders: number;
  warehouseCapacity: number;
  currentQuantity: number;
  totalQuantity: number;
}

interface Order {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
  requested_date: string;
  total_items: number;
  customers?: {
    company_name?: string;
    contact_person?: string;
  };
}

interface TopCustomer {
  id: string;
  name: string;
  revenue: number;
  orders: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    todayRevenue: 0,
    weeklyRevenue: 0,
    monthlyRevenue: 0,
    totalInventory: 0,
    totalCustomers: 0,
    pendingOrders: 0,
    warehouseCapacity: 0,
    currentQuantity: 0,
    totalQuantity: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      // Calculate date ranges for revenue
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayDateStr = today.toISOString().split('T')[0];
      
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      const weekStart = weekAgo.toISOString().split('T')[0];
      
      const monthAgo = new Date(today);
      monthAgo.setDate(today.getDate() - 30);
      const monthStart = monthAgo.toISOString().split('T')[0];

      const [
        { count: inventoryCount },
        { count: customerCount },
        { count: pendingCount },
        { data: warehouse },
        { data: orders },
        { data: inventoryItems },
        { data: todayOrders },
        { data: weeklyOrders },
        { data: monthlyOrders },
        { data: customersData },
      ] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase
          .from("outbound_orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase.from("warehouses").select("total_capacity").single(),
        supabase
          .from("outbound_orders")
          .select("*, customers(company_name, contact_person)")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("inventory_items").select("quantity, total_quantity"),
        // Revenue queries - filter by requested_date
        supabase
          .from("outbound_orders")
          .select("total_charges, requested_date")
          .eq("requested_date", todayDateStr),
        supabase
          .from("outbound_orders")
          .select("total_charges, requested_date")
          .gte("requested_date", weekStart)
          .lte("requested_date", todayDateStr),
        supabase
          .from("outbound_orders")
          .select("total_charges, requested_date")
          .gte("requested_date", monthStart)
          .lte("requested_date", todayDateStr),
        supabase.from("customers").select("id, company_name, customer_code"),
      ]);

      // Calculate total current and total quantities
      // Note: total_quantity may not be in TypeScript types yet, but exists in DB after migration
      type InventoryItemWithTotal = {
        quantity: number;
        total_quantity?: number;
      };
      const items =
        (inventoryItems as unknown as InventoryItemWithTotal[]) || [];

      const currentQuantity = items.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      );
      const totalQuantity = items.reduce(
        (sum, item) => sum + (item.total_quantity || item.quantity || 0),
        0
      );

      // Calculate revenue for different time periods
      // Today's revenue - already filtered by exact date match in query
      const todayRevenue = (todayOrders || []).reduce(
        (sum, order) => sum + (order.total_charges || 0),
        0
      );

      // Calculate weekly revenue (last 7 days including today)
      const weeklyRevenue = (weeklyOrders || []).reduce(
        (sum, order) => sum + (order.total_charges || 0),
        0
      );

      // Calculate monthly revenue (last 30 days including today)
      const monthlyRevenue = (monthlyOrders || []).reduce(
        (sum, order) => sum + (order.total_charges || 0),
        0
      );

      setStats({
        todayRevenue,
        weeklyRevenue,
        monthlyRevenue,
        totalInventory: inventoryCount || 0,
        totalCustomers: customerCount || 0,
        pendingOrders: pendingCount || 0,
        warehouseCapacity: warehouse?.total_capacity || 0,
        currentQuantity,
        totalQuantity,
      });

      setRecentOrders(orders || []);

      // Fetch top customers by revenue
      if (customersData) {
        const customerRevenuePromises = customersData.map(async (customer) => {
          const { data: orders } = await supabase
            .from("outbound_orders")
            .select("total_charges")
            .eq("customer_id", customer.id);

          const revenue =
            orders?.reduce(
              (sum, order) => sum + (order.total_charges || 0),
              0
            ) || 0;

          return {
            id: customer.id,
            name: customer.company_name || customer.customer_code,
            revenue,
            orders: orders?.length || 0,
          };
        });

        const customerRevenueData = await Promise.all(customerRevenuePromises);
        // Sort by revenue descending and take top 5
        const sortedTopCustomers = customerRevenueData
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);
        
        setTopCustomers(sortedTopCustomers);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = () => fetchDashboardData(true);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getCustomerName = (order: Order) => {
    return (
      order.customers?.company_name || order.customers?.contact_person || "N/A"
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome to H&S E-commerce Admin Portal
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="w-full sm:w-auto"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <KPICard
          title="Today Revenue"
          value={formatCurrency(stats.todayRevenue)}
          icon={PoundSterling}
        />
        <KPICard
          title="Weekly Revenue"
          value={formatCurrency(stats.weeklyRevenue)}
          icon={PoundSterling}
        />
        <KPICard
          title="Monthly Revenue"
          value={formatCurrency(stats.monthlyRevenue)}
          icon={PoundSterling}
        />
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
          title="Overall Quantities"
          value={`${stats.currentQuantity.toLocaleString()} / ${stats.totalQuantity.toLocaleString()}`}
          icon={Boxes}
        />
        <KPICard
          title="Warehouse Capacity"
          value={`${stats.warehouseCapacity.toLocaleString()} sqft`}
          icon={Warehouse}
        />
      </div>

      {/* Top Customers by Revenue Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Top Customers by Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No customer revenue data available
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {topCustomers.map((customer, index) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-semibold">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {customer.orders} {customer.orders === 1 ? "order" : "orders"}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-primary">
                        {formatCurrency(customer.revenue)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders Section */}
        <Card className="border border-border shadow-sm">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-xl font-semibold">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-8 text-center">
              <Package className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No recent orders found
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Cards View */}
              <div className="space-y-3 sm:hidden">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-lg border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {order.order_number}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {getCustomerName(order)}
                        </div>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs uppercase text-muted-foreground">
                          Type
                        </div>
                        <div className="capitalize">{order.order_type}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-muted-foreground">
                          Items
                        </div>
                        <div>{order.total_items}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs uppercase text-muted-foreground">
                          Requested
                        </div>
                        <div>{formatDate(order.requested_date)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden sm:block">
                <div className="w-full overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-3 text-left font-medium">
                          Order Number
                        </th>
                        <th className="px-3 py-3 text-left font-medium">
                          Customer
                        </th>
                        <th className="px-3 py-3 text-left font-medium">
                          Type
                        </th>
                        <th className="px-3 py-3 text-left font-medium">
                          Status
                        </th>
                        <th className="px-3 py-3 text-left font-medium">
                          Requested Date
                        </th>
                        <th className="px-3 py-3 text-right font-medium">
                          Items
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <td className="px-3 py-3 font-semibold">
                            {order.order_number}
                          </td>
                          <td className="px-3 py-3 max-w-[220px] truncate">
                            {getCustomerName(order)}
                          </td>
                          <td className="px-3 py-3">
                            <span className="capitalize text-muted-foreground">
                              {order.order_type}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {formatDate(order.requested_date)}
                          </td>
                          <td className="px-3 py-3 text-right font-medium">
                            {order.total_items}
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
      </div>
    </div>
  );
}
