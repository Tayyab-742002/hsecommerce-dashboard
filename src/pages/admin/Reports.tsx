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
  DollarSign,
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

const STATUS_COLORS: Record<string, string> = {
  pending: CHART_COLORS.warning,
  approved: CHART_COLORS.success,
  "in-progress": CHART_COLORS.secondary,
  completed: CHART_COLORS.success,
  cancelled: CHART_COLORS.danger,
};

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

      // Calculate revenue by month (last 6 months)
      const monthlyRevenue: RevenueData[] = [];
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
            .then(({ data }) => ({
              month: monthStart.toLocaleDateString("en-US", {
                month: "short",
                year: "2-digit",
              }),
              revenue:
                data?.reduce(
                  (sum, order) => sum + (order.total_charges || 0),
                  0
                ) || 0,
              orders: data?.length || 0,
            }))
        );
      }

      const resolvedRevenue = await Promise.all(revenuePromises);
      setRevenueByMonth(resolvedRevenue);
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
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
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
          value={formatCurrency(stats.totalRevenue)}
          icon={DollarSign}
        />
        <KPICard
          title="Monthly Orders"
          value={stats.monthlyOrders}
          icon={TrendingUp}
        />
        <KPICard
          title="Inventory Value"
          value={formatCurrency(stats.inventoryValue)}
          icon={Package}
        />
        <KPICard
          title="Active Customers"
          value={stats.activeCustomers}
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
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  fill="url(#colorRevenue)"
                  name="Revenue (USD)"
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
      </div>
    </div>
  );
}
