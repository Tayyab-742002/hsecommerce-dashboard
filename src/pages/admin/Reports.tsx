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
  CalendarIcon,
  X,
  Filter,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import type { DateRange } from "react-day-picker";

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
  const [customerRevenue, setCustomerRevenue] = useState<CustomerRevenueData[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter states
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: undefined,
    to: undefined,
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [customers, setCustomers] = useState<
    Array<{ id: string; company_name: string; customer_code: string }>
  >([]);
  const [filteredRevenue, setFilteredRevenue] = useState<{
    revenue: number;
    orders: number;
  }>({ revenue: 0, orders: 0 });
  const [isCalculatingRevenue, setIsCalculatingRevenue] = useState(false);

  // Fetch customers for filter dropdown
  useEffect(() => {
    const fetchCustomers = async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, company_name, customer_code")
        .order("company_name");
      if (data) {
        setCustomers(data);
      }
    };
    fetchCustomers();
  }, []);

  // Calculate filtered revenue when filters change
  useEffect(() => {
    const calculateFilteredRevenue = async () => {
      // Only reset if no filters are active
      const hasDateFilter = dateRange?.from || dateRange?.to;
      const hasCustomerFilter =
        selectedCustomerId && selectedCustomerId !== "all";

      if (!hasDateFilter && !hasCustomerFilter) {
        setFilteredRevenue({ revenue: 0, orders: 0 });
        setIsCalculatingRevenue(false);
        return;
      }

      setIsCalculatingRevenue(true);

      try {
        // Build optimized query - only select what we need
        let query = supabase
          .from("outbound_orders")
          .select("total_charges", { count: "exact" });

        // Apply filters
        if (dateRange?.from) {
          const fromDateStr = format(dateRange.from, "yyyy-MM-dd");
          query = query.gte("requested_date", fromDateStr);
        }
        if (dateRange?.to) {
          const toDateStr = format(dateRange.to, "yyyy-MM-dd");
          query = query.lte("requested_date", toDateStr);
        }
        if (hasCustomerFilter) {
          query = query.eq("customer_id", selectedCustomerId);
        }

        // Execute the query
        const { data, error, count } = await query;

        if (error) {
          console.error("Error calculating filtered revenue:", error);
          setFilteredRevenue({ revenue: 0, orders: 0 });
          setIsCalculatingRevenue(false);
          return;
        }

        // Calculate revenue from filtered results - optimized calculation
        const revenue =
          data?.reduce(
            (sum, order) => sum + (Number(order.total_charges) || 0),
            0
          ) || 0;

        setFilteredRevenue({
          revenue,
          orders: count || data?.length || 0,
        });
        setIsCalculatingRevenue(false);
      } catch (error) {
        console.error("Error calculating filtered revenue:", error);
        setFilteredRevenue({ revenue: 0, orders: 0 });
        setIsCalculatingRevenue(false);
      }
    };

    // Reduced debounce for faster response - only 50ms for quick feedback
    const timeoutId = setTimeout(() => {
      calculateFilteredRevenue();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [dateRange?.from, dateRange?.to, selectedCustomerId]);

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
        const customerRevenuePromises = customersData.data.map(
          async (customer) => {
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
          }
        );

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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const clearFilters = () => {
    setDateRange(undefined);
    setSelectedCustomerId("all");
  };

  const hasActiveFilters =
    dateRange?.from || dateRange?.to || selectedCustomerId !== "all";

  // Quick date range presets
  const setDatePreset = (preset: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let from: Date;
    let to: Date = new Date(today);
    to.setHours(23, 59, 59, 999);

    switch (preset) {
      case "today":
        from = new Date(today);
        break;
      case "yesterday":
        from = new Date(today);
        from.setDate(from.getDate() - 1);
        to = new Date(from);
        to.setHours(23, 59, 59, 999);
        break;
      case "thisWeek": {
        // Monday as start of week (getDay() returns 0=Sunday, 1=Monday, etc.)
        from = new Date(today);
        const dayOfWeek = from.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days to Monday
        from.setDate(from.getDate() + diff);
        from.setHours(0, 0, 0, 0);
        to = new Date(today);
        to.setHours(23, 59, 59, 999);
        break;
      }
      case "lastWeek": {
        // Last week Monday to Sunday
        from = new Date(today);
        const lastWeekDay = from.getDay();
        const lastWeekDiff = lastWeekDay === 0 ? -13 : -6 - lastWeekDay; // Go back to last Monday
        from.setDate(from.getDate() + lastWeekDiff);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setDate(to.getDate() + 6); // Sunday of last week
        to.setHours(23, 59, 59, 999);
        break;
      }
      case "thisMonth":
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        from.setHours(0, 0, 0, 0);
        break;
      case "lastMonth":
        from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        from.setHours(0, 0, 0, 0);
        to = new Date(today.getFullYear(), today.getMonth(), 0);
        to.setHours(23, 59, 59, 999);
        break;
      case "last30Days":
        from = new Date(today);
        from.setDate(from.getDate() - 29); // Include today, so 29 days back
        from.setHours(0, 0, 0, 0);
        break;
      case "last90Days":
        from = new Date(today);
        from.setDate(from.getDate() - 89); // Include today, so 89 days back
        from.setHours(0, 0, 0, 0);
        break;
      default:
        return;
    }

    setDateRange({ from, to });
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

      {/* Revenue Filter Section */}
      <Card className="border border-border shadow-sm bg-gradient-to-br from-card to-card/50">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-xl font-semibold flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Filter className="h-5 w-5 text-primary" />
                </div>
                Revenue Analytics
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Filter revenue by date range and customer
              </p>
            </div>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="gap-2 self-start sm:self-auto"
              >
                <X className="h-4 w-4" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick Date Presets */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <label className="text-sm font-semibold">Quick Select</label>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Today", value: "today" },
                { label: "Yesterday", value: "yesterday" },
                { label: "This Week", value: "thisWeek" },
                { label: "Last Week", value: "lastWeek" },
                { label: "This Month", value: "thisMonth" },
                { label: "Last Month", value: "lastMonth" },
                { label: "Last 30 Days", value: "last30Days" },
                { label: "Last 90 Days", value: "last90Days" },
              ].map((preset) => (
                <Button
                  key={preset.value}
                  variant="outline"
                  size="sm"
                  onClick={() => setDatePreset(preset.value)}
                  className="text-xs font-medium transition-all hover:bg-primary/10 hover:border-primary/50 hover:text-primary"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Date Range & Customer Filter */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-border">
            {/* Date Range Picker */}
            <div className="space-y-3">
              <label className="text-sm font-semibold flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary" />
                Custom Date Range
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-between text-left font-normal h-11",
                      "hover:bg-accent hover:text-accent-foreground",
                      "border-2 transition-all",
                      dateRange?.from && dateRange?.to
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                      {dateRange?.from ? (
                        dateRange?.to ? (
                          <span className="font-medium">
                            {format(dateRange.from, "MMM dd, yyyy")} -{" "}
                            {format(dateRange.to, "MMM dd, yyyy")}
                          </span>
                        ) : (
                          <span className="font-medium">
                            {format(dateRange.from, "MMM dd, yyyy")} - Select
                            end date
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">
                          Select date range
                        </span>
                      )}
                    </div>
                    {dateRange?.from && dateRange?.to && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 shadow-lg" align="start">
                  <div className="p-3 border-b border-border bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground">
                      Select start and end dates
                    </p>
                  </div>
                  <Calendar
                    mode="range"
                    defaultMonth={dateRange?.from || new Date()}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                    className="rounded-md"
                  />
                </PopoverContent>
              </Popover>
              {dateRange?.from && dateRange?.to && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    {(() => {
                      const from = new Date(dateRange.from);
                      from.setHours(0, 0, 0, 0);
                      const to = new Date(dateRange.to);
                      to.setHours(0, 0, 0, 0);
                      const diffTime = to.getTime() - from.getTime();
                      const diffDays =
                        Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
                      return `${diffDays} ${
                        diffDays === 1 ? "day" : "days"
                      } selected`;
                    })()}
                  </span>
                </div>
              )}
            </div>

            {/* Customer Selector */}
            <div className="space-y-3">
              <label className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Filter by Customer
              </label>
              <Select
                value={selectedCustomerId}
                onValueChange={setSelectedCustomerId}
              >
                <SelectTrigger className="h-11 border-2">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.company_name || customer.customer_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCustomerId !== "all" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>
                    Showing revenue for{" "}
                    <span className="font-medium text-foreground">
                      {customers.find((c) => c.id === selectedCustomerId)
                        ?.company_name || "selected customer"}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Filtered Revenue Display */}
          {hasActiveFilters && (
            <div className="relative overflow-hidden rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 shadow-sm">
              <div className="absolute top-0 right-0 h-32 w-32 bg-primary/5 rounded-full blur-3xl -translate-y-16 translate-x-16" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Filtered Revenue Results
                      {isCalculatingRevenue && (
                        <RefreshCw className="h-3 w-3 animate-spin ml-1" />
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {dateRange?.from && dateRange?.to && (
                        <span className="px-2 py-1 bg-background/80 rounded-md border border-border/50">
                          {format(dateRange.from, "MMM dd")} -{" "}
                          {format(dateRange.to, "MMM dd, yyyy")}
                        </span>
                      )}
                      {dateRange?.from && !dateRange?.to && (
                        <span className="px-2 py-1 bg-background/80 rounded-md border border-border/50">
                          From {format(dateRange.from, "MMM dd, yyyy")}
                        </span>
                      )}
                      {!dateRange?.from && dateRange?.to && (
                        <span className="px-2 py-1 bg-background/80 rounded-md border border-border/50">
                          Until {format(dateRange.to, "MMM dd, yyyy")}
                        </span>
                      )}
                      {selectedCustomerId !== "all" && (
                        <span className="px-2 py-1 bg-background/80 rounded-md border border-border/50">
                          {customers.find((c) => c.id === selectedCustomerId)
                            ?.company_name || "Customer"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {isCalculatingRevenue ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Revenue
                      </p>
                      <p className="text-3xl font-bold text-primary">
                        {formatCurrency(filteredRevenue.revenue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Based on selected filters
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Orders Count
                      </p>
                      <p className="text-3xl font-bold text-foreground">
                        {filteredRevenue.orders}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {filteredRevenue.orders === 1 ? "Order" : "Orders"} in
                        this period
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KPICard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
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
                          <p className="font-semibold text-sm mb-1">
                            {data.name}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: payload[0].color }}
                          >
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
                      <th className="text-left py-3 px-4 font-semibold">
                        Customer
                      </th>
                      <th className="text-right py-3 px-4 font-semibold">
                        Revenue
                      </th>
                      <th className="text-right py-3 px-4 font-semibold">
                        Orders
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerRevenue.map((customer, index) => (
                      <tr
                        key={index}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium">
                          {customer.name}
                        </td>
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
