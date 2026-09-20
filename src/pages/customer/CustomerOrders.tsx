import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import Spinner from "@/components/Spinner";
import TablePagination from "@/components/TablePagination";
import OrderDetailsDialog from "@/components/OrderDetailsDialog";
import OrderWizard, { type OrderWizardInitial } from "@/components/OrderWizard";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Download,
  FileArchive,
  Files,
  Folder,
  Plus,
  RotateCcw,
  Search,
  Truck,
  X,
} from "lucide-react";

interface Order {
  id: string;
  order_number: string;
  status: string;
  order_type: string;
  warehouse_id: string;
  requested_date: string;
  created_at: string;
  total_items: number;
  total_quantity: number;
  total_charges: number | null;
  order_category: string | null;
  label_path: string | null;
  warehouses: { warehouse_name: string } | null;
  outbound_order_items?: { order_item: string; quantity: number }[];
}

interface SelectedLabel {
  id: string;
  orderNumber: string;
  labelPath: string;
}

interface CategoryStat {
  order_category: string;
  order_count: number;
  label_count: number;
}

const ORDER_SELECT = `
  *,
  warehouses (warehouse_name),
  outbound_order_items (order_item, quantity)
`;

const UNCATEGORISED = "Uncategorised";

/** Every status the database allows, in the order an order moves through them. */
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "picking", label: "Picking" },
  { value: "packed", label: "Packed" },
  { value: "ready", label: "Ready" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const AWAITING_DISPATCH = ["pending", "approved", "picking", "packed", "ready"];

/**
 * A new order has no charges until H&S prices it, so £0.00 would read as free.
 */
function chargeLabel(order: Order) {
  const charges = order.total_charges ?? 0;
  if (charges === 0 && order.status === "pending") return "Awaiting pricing";
  return formatCurrency(charges);
}

interface OrderRowProps {
  order: Order;
  selected: boolean;
  onToggle: (order: Order) => void;
  onOpen: (order: Order) => void;
  onLabel: (order: Order) => void;
  onReorder: (order: Order) => void;
  onCancel: (order: Order) => void;
  showCategory?: boolean;
}

function OrderRow({
  order,
  selected,
  onToggle,
  onOpen,
  onLabel,
  onReorder,
  onCancel,
  showCategory,
}: OrderRowProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-3 md:flex-row md:items-center md:gap-4">
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
          className="min-w-0 text-left md:w-40"
        >
          <p className="font-semibold">{order.order_number}</p>
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
          {chargeLabel(order)}
        </p>
      </button>

      <div className="flex items-center justify-between gap-2 md:justify-end">
        <StatusBadge status={order.status} />

        <div className="flex items-center gap-1">
          {order.label_path && (
            <Button
              size="icon"
              variant="ghost"
              title="Download shipping label"
              onClick={() => onLabel(order)}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            title="Order these items again"
            onClick={() => onReorder(order)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          {order.status === "pending" && (
            <Button
              size="icon"
              variant="ghost"
              title="Cancel this order"
              className="text-destructive hover:text-destructive"
              onClick={() => onCancel(order)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
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
  refreshKey: number;
}

/** Orders in one folder. Mounted only while the folder is open. */
function CategorySection({
  customerId,
  category,
  rowProps,
  isSelected,
  refreshKey,
}: CategorySectionProps) {
  const orders = usePagedQuery<Order>(
    () => {
      const query = supabase
        .from("outbound_orders")
        .select(ORDER_SELECT, { count: "exact" })
        .eq("customer_id", customerId);

      return (
        category === UNCATEGORISED
          ? query.is("order_category", null)
          : query.eq("order_category", category)
      )
        .order("created_at", { ascending: false })
        .returns<Order[]>();
    },
    [customerId, category, refreshKey]
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

export default function CustomerOrders() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [view, setView] = useState<"list" | "categories">("list");
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [tiles, setTiles] = useState({
    total: 0,
    awaiting: 0,
    inTransit: 0,
    delivered: 0,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const debouncedSearch = useDebounced(searchTerm);

  const [selected, setSelected] = useState<SelectedLabel[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reorderFrom, setReorderFrom] = useState<
    OrderWizardInitial | undefined
  >();
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  useEffect(() => {
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

    resolveCustomer();
  }, []);

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

          if (categoryFilter === "none") {
            query = query.is("order_category", null);
          } else if (categoryFilter !== "all") {
            query = query.eq("order_category", categoryFilter);
          }

          return query
            .order("created_at", { ascending: false })
            .returns<Order[]>();
        }
      : null,
    [
      customerId,
      debouncedSearch,
      statusFilter,
      dateFilter,
      categoryFilter,
      refreshKey,
    ]
  );

  // Folder list and summary tiles both count every order, not the page on screen
  const loadSummary = useCallback(async () => {
    if (!customerId) return;

    const { data } = await supabase.rpc("customer_order_category_stats", {
      p_customer_id: customerId,
    });
    setCategories(data ?? []);

    const countBy = (apply: (query: any) => any) =>
      apply(
        supabase
          .from("outbound_orders")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", customerId)
      );

    const [all, awaiting, inTransit, delivered] = await Promise.all([
      countBy((query) => query),
      countBy((query) => query.in("status", AWAITING_DISPATCH)),
      countBy((query) => query.eq("status", "in_transit")),
      countBy((query) => query.in("status", ["delivered", "completed"])),
    ]);

    setTiles({
      total: all.count ?? 0,
      awaiting: awaiting.count ?? 0,
      inTransit: inTransit.count ?? 0,
      delivered: delivered.count ?? 0,
    });
  }, [customerId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, refreshKey]);

  // The warehouse moves orders along; reflect that without a manual refresh
  useEffect(() => {
    if (!customerId) return;

    const channel = supabase
      .channel(`customer-orders-${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "outbound_orders",
          filter: `customer_id=eq.${customerId}`,
        },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId]);

  const refresh = () => setRefreshKey((key) => key + 1);
  const loading = customerLoading || orders.loading;

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

  /** Every label in a folder, not just the page on screen. */
  const categoryLabels = async (category: string) => {
    let query = supabase
      .from("outbound_orders")
      .select("order_number, label_path")
      .eq("customer_id", customerId as string)
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
      toast.success(`Merged ${labels.length} labels`);
    });

  const zipCategory = (category: string) =>
    runDownload(`zip-${category}`, async () => {
      const labels = await categoryLabels(category);
      await downloadLabelsZip(labels, `${category}-labels-${today()}.zip`);
      toast.success(`Zipped ${labels.length} labels`);
    });

  // ── order actions ───────────────────────────────────────────────────────
  const openOrder = (order: Order) => {
    setDetailsId(order.id);
    setDetailsOpen(true);
  };

  /** Copies a past order's lines into a fresh order. A new label is required. */
  const startReorder = async (order: Order) => {
    const { data, error } = await supabase
      .from("outbound_order_items")
      .select("inventory_item_id, quantity, unit_price")
      .eq("outbound_order_id", order.id);

    if (error || !data?.length) {
      toast.error("Could not load the items from that order");
      return;
    }

    setReorderFrom({
      warehouse_id: order.warehouse_id,
      order_type: order.order_type,
      order_category: order.order_category,
      items: data.map((item) => ({
        inventory_item_id: item.inventory_item_id,
        quantity: item.quantity,
        unit_price: item.unit_price ?? 0,
      })),
    });
    setCreateOpen(true);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;

    const { error } = await supabase
      .from("outbound_orders")
      .delete()
      .eq("id", cancelTarget.id);

    if (error) {
      toast.error(
        "This order can no longer be cancelled — please contact H&S E-commerce"
      );
    } else {
      // Stock returns automatically via the order item triggers
      if (cancelTarget.label_path) await removeLabel(cancelTarget.label_path);
      setSelected((prev) =>
        prev.filter((entry) => entry.id !== cancelTarget.id)
      );
      toast.success(`Order ${cancelTarget.order_number} cancelled`);
      refresh();
    }
    setCancelTarget(null);
  };

  const closeWizard = () => {
    setCreateOpen(false);
    setReorderFrom(undefined);
  };

  const rowProps = {
    onToggle: toggleSelected,
    onOpen: openOrder,
    onLabel: handleSingleLabel,
    onReorder: startReorder,
    onCancel: setCancelTarget,
  };

  const hasFilters =
    statusFilter !== "all" || dateFilter !== "all" || categoryFilter !== "all";

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            My Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            Create orders and track them through to delivery
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          disabled={!customerId}
          onClick={() => {
            setReorderFrom(undefined);
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Order
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total orders", value: tiles.total, tone: "" },
          {
            label: "Awaiting dispatch",
            value: tiles.awaiting,
            tone: "text-amber-600",
          },
          { label: "In transit", value: tiles.inTransit, tone: "text-blue-600" },
          {
            label: "Delivered",
            value: tiles.delivered,
            tone: "text-green-600",
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3"
          >
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className={`text-2xl font-bold ${tile.tone}`}>{tile.value}</p>
          </div>
        ))}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative lg:col-span-1">
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
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="none">Uncategorised</SelectItem>
                  {categories
                    .filter((stat) => stat.order_category)
                    .map((stat) => (
                      <SelectItem
                        key={stat.order_category}
                        value={stat.order_category}
                      >
                        {stat.order_category}
                      </SelectItem>
                    ))}
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

            {loading ? (
              <div className="flex justify-center py-12">
                <Spinner label="Loading orders" />
              </div>
            ) : orders.rows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Truck className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {hasFilters || debouncedSearch
                      ? "No orders match those filters"
                      : "No orders yet"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {hasFilters || debouncedSearch
                      ? "Try clearing a filter."
                      : "Create your first order and attach its shipping label."}
                  </p>
                </div>
                {!hasFilters && !debouncedSearch && (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Order
                  </Button>
                )}
              </div>
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
            You have no orders yet
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
                    customerId={customerId as string}
                    category={name}
                    rowProps={rowProps}
                    isSelected={isSelected}
                    refreshKey={refreshKey}
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => (open ? setCreateOpen(true) : closeWizard())}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {reorderFrom ? "Reorder" : "Create New Order"}
            </DialogTitle>
          </DialogHeader>
          {customerId && (
            <OrderWizard
              key={reorderFrom ? "reorder" : "new"}
              customerId={customerId}
              initialOrder={reorderFrom}
              onComplete={() => {
                closeWizard();
                refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <OrderDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        orderId={detailsId}
        showCustomerInfo={false}
        onDeleted={refresh}
      />

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancel order {cancelTarget?.order_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The order and its shipping label will be removed and the stock
              returned to your inventory. This can only be done while an order is
              still pending, and it cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel}>
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
