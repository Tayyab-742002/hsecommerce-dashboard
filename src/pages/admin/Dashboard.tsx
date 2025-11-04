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
      <div className="dashboard-loader">
        <div className="loader-spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header Section */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">
            Welcome to HSEcommerce Admin Portal
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="refresh-button"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
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
          value={`${stats.warehouseCapacity.toLocaleString()} sqft`}
          icon={Warehouse}
        />
      </div>

      {/* Recent Orders Section */}
      <Card className="orders-card">
        <CardHeader className="orders-card-header">
          <CardTitle className="orders-card-title">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="orders-card-content">
          {recentOrders.length === 0 ? (
            <div className="empty-state">
              <Package className="empty-state-icon" />
              <p className="empty-state-text">No recent orders found</p>
            </div>
          ) : (
            <>
              {/* Mobile Cards View */}
              <div className="orders-mobile">
                {recentOrders.map((order) => (
                  <div key={order.id} className="order-card-mobile">
                    <div className="order-card-header-mobile">
                      <div>
                        <div className="order-number-mobile">
                          {order.order_number}
                        </div>
                        <div className="order-customer-mobile">
                          {getCustomerName(order)}
                        </div>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="order-details-mobile">
                      <div>
                        <div className="order-label">Type</div>
                        <div className="order-value capitalize">
                          {order.order_type}
                        </div>
                      </div>
                      <div>
                        <div className="order-label">Items</div>
                        <div className="order-value">{order.total_items}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="order-label">Requested</div>
                        <div className="order-value">
                          {formatDate(order.requested_date)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="orders-desktop">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order Number</th>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Requested Date</th>
                      <th className="text-right">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id}>
                        <td className="font-semibold">{order.order_number}</td>
                        <td className="max-w-[200px] truncate">
                          {getCustomerName(order)}
                        </td>
                        <td>
                          <span className="capitalize text-muted-foreground">
                            {order.order_type}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="text-muted-foreground">
                          {formatDate(order.requested_date)}
                        </td>
                        <td className="text-right font-medium">
                          {order.total_items}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
