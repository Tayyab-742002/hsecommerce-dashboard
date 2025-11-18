import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/KPICard";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from "recharts";
import {
  Package,
  TrendingUp,
  PoundSterling,
  FileText,
  RefreshCw,
  Users,
} from "lucide-react";

// Enhanced color palette with better contrast and aesthetics
const CHART_COLORS = {
  primary: "#FBBF24", // Brand yellow
  secondary: "#60A5FA", // Blue
  success: "#34D399", // Green
  warning: "#F59E0B", // Orange
  danger: "#EF4444", // Red
  purple: "#A78BFA", // Purple
  pink: "#F472B6", // Pink
  teal: "#2DD4BF", // Teal
};

const PIE_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.success,
  CHART_COLORS.purple,
  CHART_COLORS.pink,
  CHART_COLORS.teal,
];

interface Stats {
  totalRevenue: number;
  monthlyOrders: number;
  inventoryValue: number;
  activeCustomers: number;
}

interface ChartData {
  name: string;
  value: number;
}

interface RevenueData {
  month: string;
  revenue: number;
  orders: number;
}

interface CustomerRevenueData {
  name: string;
  revenue: number;
  orders: number;
}

export default function AdminReports() {
  const [stats, setStats] = useState<Stats>({
    totalRevenue: 0,
    monthlyOrders: 0,
    inventoryValue: 0,
    activeCustomers: 0,
  });
  const [ordersByStatus, setOrdersByStatus] = useState<ChartData[]>([]);
  const [inventoryByCategory, setInventoryByCategory] = useState<ChartData[]>(
    []
  );
  const [revenueByMonth, setRevenueByMonth] = useState<RevenueData[]>([]);
  const [customerRevenue, setCustomerRevenue] = useState<CustomerRevenueData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchReportData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      // Parallel data fetching for better performance
      const [
        ordersData,
        monthlyOrdersCount,
        inventoryData,
        activeCustomersCount,
        statusData,
        categoryData,
        customersData,
      ] = await Promise.all([
        supabase.from("outbound_orders").select("total_charges, created_at"),
        supabase
          .from("outbound_orders")
          .select("*", { count: "exact", head: true })
          .gte(
            "created_at",
            new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              1
            ).toISOString()
          ),
        supabase.from("inventory_items").select("declared_value, quantity"),
        supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("status", "active"),
        supabase.from("outbound_orders").select("status"),
        supabase.from("inventory_items").select("category, quantity"),
        supabase.from("customers").select("id, company_name, customer_code"),
      ]);

      // Calculate total revenue
      const totalRevenue =
        ordersData.data?.reduce(
          (sum, order) => sum + (order.total_charges || 0),
          0
        ) || 0;

      // Calculate inventory value
      const inventoryValue =
        inventoryData.data?.reduce(
          (sum, item) => sum + (item.declared_value || 0) * item.quantity,
          0
        ) || 0;

      setStats({
        totalRevenue,
        monthlyOrders: monthlyOrdersCount.count || 0,
        inventoryValue,
        activeCustomers: activeCustomersCount.count || 0,
      });

      // Process orders by status
      const statusCounts = statusData.data?.reduce(
        (acc: Record<string, number>, order) => {
          const status = order.status || "unknown";
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        },
        {}
      );

      setOrdersByStatus(
        Object.entries(statusCounts || {}).map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1).replace("-", " "),
          value,
        }))
      );

      // Process inventory by category
      const categoryCounts = categoryData.data?.reduce(
        (acc: Record<string, number>, item) => {
          const cat = item.category || "Uncategorized";
          acc[cat] = (acc[cat] || 0) + item.quantity;
          return acc;
        },
        {}
      );

      setInventoryByCategory(
        Object.entries(categoryCounts || {})
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      );

      const revenuePromises = [];

      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

        revenuePromises.push(
          supabase
            .from("outbound_orders")
            .select("total_charges")
            .gte("created_at", monthStart.toISOString())
            .lte("created_at", monthEnd.toISOString())
            .then(({ data }) => {
              const revenue =
                data?.reduce((sum, order) => {
                  const charge = Number(order.total_charges) || 0;
                  return sum + charge;
                }, 0) || 0;
              return {
                month: monthStart.toLocaleDateString("en-US", {
                  month: "short",
                  year: "2-digit",
                }),
                revenue: Number(revenue),
                orders: data?.length || 0,
              };
            })
        );
      }

      const resolvedRevenue = await Promise.all(revenuePromises);
      setRevenueByMonth(resolvedRevenue);

      // Calculate customer revenue breakdown
      if (customersData.data) {
        const customerRevenuePromises = customersData.data.map(async (customer) => {
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
            name: customer.company_name || customer.customer_code,
            revenue,
            orders: orders?.length || 0,
          };
        });

        const customerRevenueData = await Promise.all(customerRevenuePromises);
        // Sort by revenue descending and take top 10
        const sortedCustomerRevenue = customerRevenueData
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10);
        
        setCustomerRevenue(sortedCustomerRevenue);
      }
    } catch (error) {
      console.error("Error fetching report data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const handleRefresh = () => fetchReportData(true);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  interface TooltipProps {
    active?: boolean;
    payload?: Array<{
      name: string;
      value: number;
      color: string;
    }>;
    label?: string;
  }

  const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-1">{label}</p>
          {payload.map((entry, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}:{" "}
              {entry.name.includes("Revenue")
                ? formatCurrency(entry.value)
                : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="dashboard-loader">
        <div className="loader-spinner"></div>
      </div>
    );
  }

  return (
    <div className="reports-container">
      {/* Header */}
      <div className="reports-header">
        <div className="reports-header-content">
          <div className="reports-icon-wrapper">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="reports-title">Reports & Analytics</h1>
            <p className="reports-subtitle">
              Business insights and performance metrics
            </p>
          </div>
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

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KPICard
          title="Total Revenue"
          value={`£${stats.totalRevenue.toLocaleString()}`}
          icon={PoundSterling}
        />
        <KPICard
          title="Monthly Orders"
          value={stats.monthlyOrders.toLocaleString()}
          icon={TrendingUp}
        />
        {/* <KPICard
          title="Inventory Value"
          value={formatCurrency(stats.inventoryValue)}
          icon={Package}
        /> */}
        <KPICard
          title="Active Customers"
          value={stats.activeCustomers.toLocaleString()}
          icon={Users}
        />
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Revenue Trend Chart */}
        <Card className="chart-card">
          <CardHeader>
            <CardTitle className="text-lg">
              Revenue Trend (Last 6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={revenueByMonth}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={CHART_COLORS.primary}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={CHART_COLORS.primary}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.3}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(value) => {
                    if (value === 0) return "£0";
                    if (value >= 1000000) {
                      return `£${(value / 1000000).toFixed(1)}M`;
                    } else if (value >= 1000) {
                      return `£${(value / 1000).toFixed(0)}K`;
                    } else {
                      return `£${Math.round(value)}`;
                    }
                  }}
                  domain={[0, "auto"]}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  fill="url(#colorRevenue)"
                  name="Revenue (GBP)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Orders by Status Chart */}
        <Card className="chart-card">
          <CardHeader>
            <CardTitle className="text-lg">Orders by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={ordersByStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {ordersByStatus.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Inventory by Category Chart */}
        <Card className="chart-card">
          <CardHeader>
            <CardTitle className="text-lg">Inventory by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={inventoryByCategory}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.3}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar
                  dataKey="value"
                  fill={CHART_COLORS.secondary}
                  name="Quantity"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly Order Volume Chart */}
        <Card className="chart-card">
          <CardHeader>
            <CardTitle className="text-lg">Order Volume Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={revenueByMonth}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.3}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke={CHART_COLORS.success}
                  strokeWidth={3}
                  dot={{ fill: CHART_COLORS.success, r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Orders Count"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Customer Revenue Breakdown Chart */}
        <Card className="chart-card">
          <CardHeader>
            <CardTitle className="text-lg">Top Customers by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={customerRevenue} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.3}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(value) => {
                    if (value === 0) return "£0";
                    if (value >= 1000000) {
                      return `£${(value / 1000000).toFixed(1)}M`;
                    } else if (value >= 1000) {
                      return `£${(value / 1000).toFixed(0)}K`;
                    } else {
                      return `£${Math.round(value)}`;
                    }
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={120}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as CustomerRevenueData;
                      return (
                        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
                          <p className="font-semibold text-sm mb-1">{data.name}</p>
                          <p className="text-xs" style={{ color: payload[0].color }}>
                            Revenue: {formatCurrency(data.revenue)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Orders: {data.orders}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar
                  dataKey="revenue"
                  fill={CHART_COLORS.primary}
                  name="Revenue (GBP)"
                  radius={[0, 8, 8, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Customer Revenue Table */}
        <Card className="chart-card">
          <CardHeader>
            <CardTitle className="text-lg">Customer Revenue Details</CardTitle>
          </CardHeader>
          <CardContent>
            {customerRevenue.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No customer revenue data available
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-semibold">Customer</th>
                      <th className="text-right py-3 px-4 font-semibold">Revenue</th>
                      <th className="text-right py-3 px-4 font-semibold">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerRevenue.map((customer, index) => (
                      <tr
                        key={index}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium">{customer.name}</td>
                        <td className="py-3 px-4 text-right font-semibold text-primary">
                          {formatCurrency(customer.revenue)}
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground">
                          {customer.orders}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
