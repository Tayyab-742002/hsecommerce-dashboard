import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/KPICard";
import Spinner from "@/components/Spinner";
import { formatCurrency } from "@/lib/currency";
import { PoundSterling, TrendingUp, Package } from "lucide-react";
import TablePagination from "@/components/TablePagination";
import { usePagedQuery } from "@/hooks/usePagedQuery";

export default function CustomerBilling() {
  const [stats, setStats] = useState({
    totalCharges: 0,
    monthlyCharges: 0,
    totalOrders: 0,
  });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLoading, setCustomerLoading] = useState(true);

  useEffect(() => {
    resolveCustomer();
  }, []);

  const resolveCustomer = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCustomerLoading(false);
      return;
    }

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    setCustomerId(userRole?.customer_id ?? null);
    setCustomerLoading(false);
  };

  // Totals are summed in the database — they used to mean fetching every order
  useEffect(() => {
    if (!customerId) return;

    supabase
      .rpc("customer_billing_summary", { p_customer_id: customerId })
      .then(({ data }) => {
        const summary = data?.[0];
        if (!summary) return;
        setStats({
          totalCharges: Number(summary.total_charges),
          monthlyCharges: Number(summary.monthly_charges),
          totalOrders: Number(summary.total_orders),
        });
      });
  }, [customerId]);

  const charges = usePagedQuery<any>(
    customerId
      ? () =>
          supabase
            .from("outbound_orders")
            .select("*", { count: "exact" })
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
      : null,
    [customerId]
  );

  const loading = customerLoading || charges.loading;


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
          icon={PoundSterling}
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
          ) : charges.rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No charges found
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {charges.rows.map((charge) => (
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
                        <th>Total Charges</th>
                        {/* <th>Delivery</th> */}
                        {/* <th>Total</th> */}
                      </tr>
                    </thead>
                    <tbody>
                      {charges.rows.map((charge) => (
                        <tr key={charge.id}>
                          <td className="font-medium whitespace-nowrap">
                            {charge.order_number}
                          </td>
                          <td className="whitespace-nowrap">
                            {new Date(charge.created_at).toLocaleDateString()}
                          </td>
                          {/* <td className="whitespace-nowrap">
                            {formatCurrency(charge.handling_charges ?? 0)}
                          </td> */}
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
            <TablePagination
            page={charges.page}
            pageCount={charges.pageCount}
            from={charges.from}
            to={charges.to}
            total={charges.total}
            onPageChange={charges.setPage}
            label="charges"
          />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
