import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KPICard } from "@/components/KPICard";
import { Package, TrendingUp, Users, Warehouse, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";

interface DashboardStats {
  totalInventory: number;
  totalCustomers: number;
  pendingOrders: number;
  warehouseCapacity: number;
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

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalInventory: 0,
    totalCustomers: 0,
    pendingOrders: 0,
    warehouseCapacity: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [
        { count: inventoryCount },
        { count: customerCount },
        { count: pendingCount },
        { data: warehouse },
        { data: orders },
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
      ]);

      setStats({
        totalInventory: inventoryCount || 0,
        totalCustomers: customerCount || 0,
        pendingOrders: pendingCount || 0,
        warehouseCapacity: warehouse?.total_capacity || 0,
      });

      setRecentOrders(orders || []);
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        {/* <KPICard
          title="Pending Orders"
          value={stats.pendingOrders}
          icon={TrendingUp}
        /> */}
        <KPICard
          title="Warehouse Capacity"
          value={`${stats.warehouseCapacity.toLocaleString()} sqft`}
          icon={Warehouse}
        />
      </div>

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
  );
}
