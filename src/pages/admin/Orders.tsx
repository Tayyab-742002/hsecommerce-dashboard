import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import OrderWizard from "@/components/OrderWizard";
import BatchOrderWizard from "@/components/BatchOrderWizard";
import Spinner from "@/components/Spinner";
import { toast } from "sonner";
import { CheckCheck, ChevronRight, Inbox, Plus, Search } from "lucide-react";

interface CustomerStats {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  contact_person: string;
  total_orders: number;
  unread_orders: number;
  pending_orders: number;
  last_order_at: string | null;
}

export default function AdminOrders() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<CustomerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [markAllOpen, setMarkAllOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchStats = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_customer_order_stats");
    if (error) {
      toast.error(error.message || "Failed to load customers");
    } else {
      setStats(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // A customer submitting an order changes the indicator on their card
  useEffect(() => {
    const channel = supabase
      .channel("admin-order-stats")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "outbound_orders" },
        (payload) => {
          const order = payload.new as { order_number: string };
          toast.info(`New order ${order.order_number} requested`);
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  const markAllRead = async () => {
    setMarkingAll(true);
    const { error } = await supabase
      .from("outbound_orders")
      .update({ viewed_at: new Date().toISOString() })
      .is("viewed_at", null);

    if (error) {
      toast.error(error.message || "Failed to mark orders as read");
    } else {
      toast.success("All orders marked as read");
      fetchStats();
    }
    setMarkingAll(false);
    setMarkAllOpen(false);
  };

  const term = searchTerm.trim().toLowerCase();
  const visible = term
    ? stats.filter((customer) =>
        [customer.customer_name, customer.customer_code, customer.contact_person]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(term))
      )
    : stats;

  const totalUnread = stats.reduce(
    (sum, customer) => sum + Number(customer.unread_orders),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Orders Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick a customer to view and process their orders
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Batch Orders
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Batch Orders</DialogTitle>
              </DialogHeader>
              <BatchOrderWizard
                onComplete={() => {
                  setBatchDialogOpen(false);
                  fetchStats();
                }}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Create Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Order</DialogTitle>
              </DialogHeader>
              <OrderWizard
                onComplete={() => {
                  setDialogOpen(false);
                  fetchStats();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          {totalUnread > 0 && (
            <span className="text-sm text-muted-foreground">
              {totalUnread} new {totalUnread === 1 ? "order" : "orders"}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={totalUnread === 0}
            onClick={() => setMarkAllOpen(true)}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all read
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner label="Loading customers" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No customers found</p>
            <p className="text-sm text-muted-foreground">
              {term ? "Try a different search." : "Add a customer to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((customer) => {
            const unread = Number(customer.unread_orders);
            return (
              <button
                key={customer.customer_id}
                type="button"
                onClick={() => navigate(`/admin/orders/${customer.customer_id}`)}
                className={`group rounded-[var(--radius-lg)] border p-4 text-left shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  unread > 0
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {customer.customer_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {customer.customer_code}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {unread > 0 && (
                      <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
                        {unread} new
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted/50 py-2">
                    <dt className="text-[11px] text-muted-foreground">Orders</dt>
                    <dd className="text-lg font-semibold leading-tight">
                      {customer.total_orders}
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted/50 py-2">
                    <dt className="text-[11px] text-muted-foreground">Pending</dt>
                    <dd className="text-lg font-semibold leading-tight text-amber-600">
                      {customer.pending_orders}
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted/50 py-2">
                    <dt className="text-[11px] text-muted-foreground">New</dt>
                    <dd
                      className={`text-lg font-semibold leading-tight ${
                        unread > 0 ? "text-destructive" : ""
                      }`}
                    >
                      {unread}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs text-muted-foreground">
                  {customer.last_order_at
                    ? `Last order ${new Date(
                        customer.last_order_at
                      ).toLocaleDateString("en-GB")}`
                    : "No orders yet"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <AlertDialog open={markAllOpen} onOpenChange={setMarkAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all orders as read?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the new-order indicator on every customer (
              {totalUnread} {totalUnread === 1 ? "order" : "orders"}). The orders
              themselves are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={markAllRead} disabled={markingAll}>
              {markingAll ? "Marking..." : "Mark all read"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
