import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/KPICard";
import Spinner from "@/components/Spinner";
import { formatCurrency } from "@/lib/currency";
import { DollarSign, TrendingUp, Package } from "lucide-react";

export default function CustomerBilling() {
  const [stats, setStats] = useState({
    totalCharges: 0,
    monthlyCharges: 0,
    totalOrders: 0,
  });
  const [recentCharges, setRecentCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("customer_id")
      .eq("user_id", user.id)
      .single();

    if (!userRole?.customer_id) return;

    // Fetch all orders for this customer
    const { data: orders } = await supabase
      .from("outbound_orders")
      .select("*")
      .eq("customer_id", userRole.customer_id);

    if (orders) {
      const totalCharges = orders.reduce(
        (sum, order) => sum + (order.total_charges || 0),
        0
      );

      // Calculate monthly charges
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const monthlyOrders = orders.filter(
        (order) => new Date(order.created_at) >= startOfMonth
      );
      const monthlyCharges = monthlyOrders.reduce(
        (sum, order) => sum + (order.total_charges || 0),
        0
      );

      setStats({
        totalCharges,
        monthlyCharges,
        totalOrders: orders.length,
      });

      setRecentCharges(orders.slice(0, 10));
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Billing</h1>
        <p className="text-muted-foreground">View your charges and invoices</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Total Charges"
          value={formatCurrency(stats.totalCharges)}
          icon={DollarSign}
        />
        <KPICard
          title="This Month"
          value={formatCurrency(stats.monthlyCharges)}
          icon={TrendingUp}
        />
        <KPICard
          title="Total Orders"
          value={stats.totalOrders}
          icon={Package}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Charges</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner label="Loading charges" />
            </div>
          ) : recentCharges.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No charges found
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {recentCharges.map((charge) => (
                  <div
                    key={charge.id}
                    className="border border-border rounded-[var(--radius-lg)] bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{charge.order_number}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(charge.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                      <div className="text-muted-foreground text-xs">
                        Handling
                      </div>
                      <div className="text-right">
                        {formatCurrency(charge.handling_charges ?? 0)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Delivery
                      </div>
                      <div className="text-right">
                        {formatCurrency(charge.delivery_charges ?? 0)}
                      </div>
                      <div className="text-muted-foreground text-xs">Total</div>
                      <div className="text-right font-semibold">
                        {formatCurrency(charge.total_charges ?? 0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block w-full overflow-x-auto">
                <div className="table-container min-w-[720px] pr-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order Number</th>
                        <th>Date</th>
                        <th>Handling</th>
                        {/* <th>Delivery</th> */}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentCharges.map((charge) => (
                        <tr key={charge.id}>
                          <td className="font-medium whitespace-nowrap">
                            {charge.order_number}
                          </td>
                          <td className="whitespace-nowrap">
                            {new Date(charge.created_at).toLocaleDateString()}
                          </td>
                          <td className="whitespace-nowrap">
                            {formatCurrency(charge.handling_charges ?? 0)}
                          </td>
                          {/* <td className="whitespace-nowrap">{formatCurrency(charge.delivery_charges ?? 0)}</td> */}
                          <td className="font-bold whitespace-nowrap">
                            {formatCurrency(charge.total_charges ?? 0)}
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
