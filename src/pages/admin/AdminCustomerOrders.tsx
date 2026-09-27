import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import Spinner from "@/components/Spinner";
import TablePagination from "@/components/TablePagination";
import OrderStatusDialog from "@/components/OrderStatusDialog";
import OrderDetailsDialog from "@/components/OrderDetailsDialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { useDebounced } from "@/hooks/useDebounced";
import { dateFilterRange, likeTerm } from "@/lib/dateRange";
import {
  downloadLabel,
  downloadLabelsZip,
  downloadMergedLabels,
  removeLabel,
} from "@/lib/labels";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCheck,
  Download,
  FileArchive,
  Files,
  Folder,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

interface Order {
  id: string;
  order_number: string;
  status: string;
  order_type: string;
  requested_date: string;
  completed_date: string | null;
  created_at: string;
  total_items: number;
  total_quantity: number;
  total_charges: number | null;
  order_category: string | null;
  label_path: string | null;
  viewed_at: string | null;
  warehouses: { warehouse_name: string } | null;
  outbound_order_items?: { order_item: string; quantity: number }[];
}

/** A selected order, kept whole so a merge can span pages we no longer hold. */
interface SelectedLabel {
  id: string;
  orderNumber: string;
  labelPath: string;
}

interface CategoryStat {
  order_category: string;
  order_count: number;
  unread_count: number;
  label_count: number;
}

const ORDER_SELECT = `
  *,
  warehouses (warehouse_name),
  outbound_order_items (order_item, quantity)
`;

const UNCATEGORISED = "Uncategorised";

/** Unread first, then newest — so new requests always sit at the top. */
function orderedQuery<T>(query: {
  order: (
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean }
  ) => T;
}) {
  return query.order("viewed_at", { ascending: true, nullsFirst: true });
}

interface OrderRowProps {
  order: Order;
  selected: boolean;
  onToggle: (order: Order) => void;
  onOpen: (order: Order) => void;
  onStatus: (order: Order) => void;
  onDelete: (order: Order) => void;
  onLabel: (order: Order) => void;
  showCategory?: boolean;
}

function OrderRow({
  order,
  selected,
  onToggle,
  onOpen,
  onStatus,
  onDelete,
  onLabel,
  showCategory,
}: OrderRowProps) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-[var(--radius-lg)] border p-3 transition-colors md:flex-row md:items-center md:gap-4 ${
        order.viewed_at
          ? "border-border bg-card"
          : "border-primary/50 bg-primary/5"
      }`}
    >
      <div className="flex items-start gap-3 md:items-center">
        <Checkbox
          checked={selected}
          disabled={!order.label_path}
          onCheckedChange={() => onToggle(order)}
          aria-label={`Select order ${order.order_number}`}
          className="mt-1 md:mt-0"
        />
        <button
          type="button"
          onClick={() => onOpen(order)}
          className="min-w-0 flex-1 text-left md:w-44 md:flex-none"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{order.order_number}</span>
            {!order.viewed_at && (
              <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
                New
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(order.created_at).toLocaleDateString("en-GB")}
            {showCategory && ` · ${order.order_category || UNCATEGORISED}`}
          </p>
        </button>
      </div>

      <button
        type="button"
        onClick={() => onOpen(order)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-sm">
          {order.outbound_order_items
            ?.map((item) => item.order_item)
            .filter(Boolean)
            .join(", ") || "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          {order.total_items} items · {order.total_quantity} units ·{" "}
          {(order.total_charges ?? 0) === 0 ? (
            // Prompt the admin: an unpriced order would invoice at £0
            <span className="font-medium text-amber-600">Not priced</span>
          ) : (
            formatCurrency(order.total_charges)
          )}
        </p>
      </button>

      <div className="flex items-center justify-between gap-2 md:justify-end">
        <StatusBadge status={order.status} />

        <div className="flex items-center gap-1">
          {order.label_path ? (
            <Button
              size="icon"
              variant="ghost"
              title="Download shipping label"
              onClick={() => onLabel(order)}
            >
              <Download className="h-4 w-4" />
            </Button>
          ) : (
            <span className="px-2 text-xs text-muted-foreground">No label</span>
          )}
          <Button
            size="icon"
            variant="ghost"
            title="Update status"
            onClick={() => onStatus(order)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Delete order"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(order)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CategorySectionProps {
  customerId: string;
  category: string;
  rowProps: Omit<OrderRowProps, "order" | "selected">;
  isSelected: (id: string) => boolean;
}

/** Orders inside one folder. Only mounted while the folder is open. */
function CategorySection({
  customerId,
  category,
  rowProps,
  isSelected,
}: CategorySectionProps) {
  const orders = usePagedQuery<Order>(
    () => {
      const query = supabase
        .from("outbound_orders")
        .select(ORDER_SELECT, { count: "exact" })
        .eq("customer_id", customerId);

      return orderedQuery(
        category === UNCATEGORISED
          ? query.is("order_category", null)
          : query.eq("order_category", category)
      )
        .order("created_at", { ascending: false })
        .returns<Order[]>();
    },
    [customerId, category]
  );

  if (orders.loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner label="Loading orders" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orders.rows.map((order) => (
        <OrderRow
          key={order.id}
          order={order}
          selected={isSelected(order.id)}
          {...rowProps}
        />
      ))}
      <TablePagination
        page={orders.page}
        pageCount={orders.pageCount}
        from={orders.from}
        to={orders.to}
        total={orders.total}
        onPageChange={orders.setPage}
        label="orders"
      />
    </div>
  );
}

export default function AdminCustomerOrders() {
  const { customerId = "" } = useParams();
  const [customer, setCustomer] = useState<{
    name: string;
    code: string;
  } | null>(null);
  const [view, setView] = useState<"list" | "categories">("list");
  const [categories, setCategories] = useState<CategoryStat[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const debouncedSearch = useDebounced(searchTerm);

  const [selected, setSelected] = useState<SelectedLabel[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Order | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [markAllOpen, setMarkAllOpen] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    supabase
      .from("customers")
      .select("company_name, contact_person, customer_code")
      .eq("id", customerId)
      .maybeSingle()
      .then(({ data }) =>
        setCustomer(
          data
            ? {
                name: data.company_name || data.contact_person,
                code: data.customer_code,
              }
            : null
        )
      );
  }, [customerId]);

  const loadCategories = () => {
    if (!customerId) return;
    supabase
      .rpc("customer_order_category_stats", { p_customer_id: customerId })
      .then(({ data }) => setCategories(data ?? []));
  };

  useEffect(loadCategories, [customerId]);

  const orders = usePagedQuery<Order>(
    customerId
      ? () => {
          let query = supabase
            .from("outbound_orders")
            .select(ORDER_SELECT, { count: "exact" })
            .eq("customer_id", customerId);

          const term = debouncedSearch.trim();
          if (term) query = query.ilike("order_number", likeTerm(term));

          if (statusFilter !== "all") query = query.eq("status", statusFilter);

          const range = dateFilterRange(dateFilter);
          if (range) {
            query = query
              .gte("requested_date", range.from)
              .lte("requested_date", range.to);
          }

          return orderedQuery(query)
            .order("created_at", { ascending: false })
            .returns<Order[]>();
        }
      : null,
    [customerId, debouncedSearch, statusFilter, dateFilter]
  );

  const unreadTotal = categories.reduce(
    (sum, category) => sum + Number(category.unread_count),
    0
  );

  const refreshAll = () => {
    orders.refetch();
    loadCategories();
  };

  // ── selection ───────────────────────────────────────────────────────────
  const isSelected = (orderId: string) =>
    selected.some((entry) => entry.id === orderId);

  const toggleSelected = (order: Order) => {
    if (!order.label_path) return;
    setSelected((prev) =>
      prev.some((entry) => entry.id === order.id)
        ? prev.filter((entry) => entry.id !== order.id)
        : [
            ...prev,
            {
              id: order.id,
              orderNumber: order.order_number,
              labelPath: order.label_path as string,
            },
          ]
    );
  };

  // ── label downloads ─────────────────────────────────────────────────────
  const runDownload = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    try {
      await action();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to download labels"
      );
    } finally {
      setBusyAction(null);
    }
  };

  const today = () => new Date().toISOString().split("T")[0];

  const handleSingleLabel = (order: Order) =>
    runDownload(`one-${order.id}`, () =>
      downloadLabel(order.label_path as string, order.order_number)
    );

  const mergeSelected = () =>
    runDownload("merge-selection", async () => {
      await downloadMergedLabels(
        selected.map((entry) => entry.labelPath),
        `labels-${today()}.pdf`
      );
      toast.success(`Merged ${selected.length} labels`);
    });

  const zipSelected = () =>
    runDownload("zip-selection", async () => {
      await downloadLabelsZip(
        selected.map((entry) => ({
          path: entry.labelPath,
          name: entry.orderNumber,
        })),
        `labels-${today()}.zip`
      );
      toast.success(`Zipped ${selected.length} labels`);
    });

  /** Every label in a folder, fetched on demand — not just the page on screen. */
  const categoryLabels = async (category: string) => {
    let query = supabase
      .from("outbound_orders")
      .select("order_number, label_path")
      .eq("customer_id", customerId)
      .not("label_path", "is", null);

    query =
      category === UNCATEGORISED
        ? query.is("order_category", null)
        : query.eq("order_category", category);

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });
    if (error) throw new Error(error.message);

    const labels = (data ?? []).map((row) => ({
      path: row.label_path as string,
      name: row.order_number,
    }));
    if (labels.length === 0) throw new Error("No labels in this category");
    return labels;
  };

  const mergeCategory = (category: string) =>
    runDownload(`merge-${category}`, async () => {
      const labels = await categoryLabels(category);
      await downloadMergedLabels(
        labels.map((label) => label.path),
        `${category}-labels-${today()}.pdf`
      );
      toast.success(`Merged ${labels.length} labels from ${category}`);
    });

  const zipCategory = (category: string) =>
    runDownload(`zip-${category}`, async () => {
      const labels = await categoryLabels(category);
      await downloadLabelsZip(labels, `${category}-labels-${today()}.zip`);
      toast.success(`Zipped ${labels.length} labels from ${category}`);
    });

  // ── order actions ───────────────────────────────────────────────────────
  const openOrder = (order: Order) => {
    setDetailsId(order.id);
    setDetailsOpen(true);

    if (!order.viewed_at) {
      supabase
        .from("outbound_orders")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", order.id)
        .then(refreshAll);
    }
  };

  const openStatus = (order: Order) => {
    setStatusTarget(order);
    setStatusDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("outbound_orders")
      .delete()
      .eq("id", deleteTarget.id);

    if (error) {
      toast.error(error.message || "Failed to delete order");
    } else {
      // Stock is returned by the order item triggers; drop the orphaned label
      if (deleteTarget.label_path) await removeLabel(deleteTarget.label_path);
      setSelected((prev) =>
        prev.filter((entry) => entry.id !== deleteTarget.id)
      );
      toast.success("Order deleted");
      refreshAll();
    }
    setDeleteTarget(null);
  };

  const markAllRead = async () => {
    const { error } = await supabase
      .from("outbound_orders")
      .update({ viewed_at: new Date().toISOString() })
      .eq("customer_id", customerId)
      .is("viewed_at", null);

    if (error) {
      toast.error(error.message || "Failed to mark orders as read");
    } else {
      toast.success("Orders marked as read");
      refreshAll();
    }
    setMarkAllOpen(false);
  };

  const rowProps = {
    onToggle: toggleSelected,
    onOpen: openOrder,
    onStatus: openStatus,
    onDelete: setDeleteTarget,
    onLabel: handleSingleLabel,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/admin/orders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All customers
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
            {customer?.name ?? "Customer orders"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {customer?.code}
            {unreadTotal > 0 && ` · ${unreadTotal} new`}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={unreadTotal === 0}
          onClick={() => setMarkAllOpen(true)}
          className="w-full sm:w-auto"
        >
          <CheckCheck className="mr-2 h-4 w-4" />
          Mark all read
        </Button>
      </div>

      {/* View switch */}
      <div className="flex w-full gap-1 rounded-[var(--radius-lg)] border border-border bg-muted/40 p-1 sm:w-auto sm:self-start">
        {(["list", "categories"] as const).map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={view === mode ? "default" : "ghost"}
            className="flex-1 sm:flex-none"
            onClick={() => setView(mode)}
          >
            {mode === "list" ? (
              <Files className="mr-2 h-4 w-4" />
            ) : (
              <Folder className="mr-2 h-4 w-4" />
            )}
            {mode === "list" ? "All orders" : "By category"}
          </Button>
        ))}
      </div>

      {/* Selection actions */}
      {selected.length > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">
              {selected.length} order{selected.length === 1 ? "" : "s"} selected
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={mergeSelected}
                disabled={busyAction === "merge-selection"}
              >
                <Download className="mr-2 h-4 w-4" />
                {busyAction === "merge-selection"
                  ? "Merging..."
                  : "Merge into 1 PDF"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={zipSelected}
                disabled={busyAction === "zip-selection"}
              >
                <FileArchive className="mr-2 h-4 w-4" />
                {busyAction === "zip-selection" ? "Zipping..." : "Download ZIP"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "list" ? (
        <Card>
          <CardContent className="space-y-4 p-4">
            {/* Filters */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="relative sm:col-span-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search order number..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="packed">Packed</SelectItem>
                  <SelectItem value="in_transit">In transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last 7 days</SelectItem>
                  <SelectItem value="month">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {orders.loading ? (
              <div className="flex justify-center py-12">
                <Spinner label="Loading orders" />
              </div>
            ) : orders.rows.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">
                No orders found
              </p>
            ) : (
              <div className="space-y-2">
                {orders.rows.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    selected={isSelected(order.id)}
                    showCategory
                    {...rowProps}
                  />
                ))}
              </div>
            )}

            <TablePagination
              page={orders.page}
              pageCount={orders.pageCount}
              from={orders.from}
              to={orders.to}
              total={orders.total}
              onPageChange={orders.setPage}
              label="orders"
            />
          </CardContent>
        </Card>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            This customer has no orders yet
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {categories.map((stat) => {
            const name = stat.order_category || UNCATEGORISED;
            return (
              <AccordionItem
                key={name}
                value={name}
                className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pr-3 text-left">
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-semibold">{name}</span>
                    <Badge variant="secondary">{stat.order_count}</Badge>
                    {Number(stat.unread_count) > 0 && (
                      <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
                        {stat.unread_count} new
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="mb-3 flex flex-wrap gap-2 border-b border-border pb-3">
                    <Button
                      size="sm"
                      disabled={
                        Number(stat.label_count) === 0 ||
                        busyAction === `merge-${name}`
                      }
                      onClick={() => mergeCategory(name)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {busyAction === `merge-${name}`
                        ? "Merging..."
                        : `Merge ${stat.label_count} labels into 1 PDF`}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        Number(stat.label_count) === 0 ||
                        busyAction === `zip-${name}`
                      }
                      onClick={() => zipCategory(name)}
                    >
                      <FileArchive className="mr-2 h-4 w-4" />
                      {busyAction === `zip-${name}`
                        ? "Zipping..."
                        : "Download all as ZIP"}
                    </Button>
                  </div>

                  <CategorySection
                    customerId={customerId}
                    category={name}
                    rowProps={rowProps}
                    isSelected={isSelected}
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {statusTarget && (
        <OrderStatusDialog
          open={statusDialogOpen}
          onOpenChange={setStatusDialogOpen}
          orderId={statusTarget.id}
          currentStatus={statusTarget.status}
          onSuccess={refreshAll}
        />
      )}

      <OrderDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        orderId={detailsId}
        showCustomerInfo
        onStatusUpdate={(orderId, currentStatus) => {
          setDetailsOpen(false);
          setStatusTarget({ id: orderId, status: currentStatus } as Order);
          setStatusDialogOpen(true);
        }}
        onDeleted={() => {
          setDetailsOpen(false);
          refreshAll();
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>
              Order {deleteTarget?.order_number} and its items will be deleted,
              its stock returned to inventory and its shipping label removed.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={markAllOpen} onOpenChange={setMarkAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all as read?</AlertDialogTitle>
            <AlertDialogDescription>
              Clears the new indicator on {unreadTotal}{" "}
              {unreadTotal === 1 ? "order" : "orders"} for {customer?.name}. The
              orders themselves are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={markAllRead}>
              Mark all read
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
