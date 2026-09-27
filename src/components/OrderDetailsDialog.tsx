import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import Spinner from "@/components/Spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Package,
  Calendar,
  User,
  CreditCard,
  FileText,
  RefreshCw,
  Trash2,
  Download,
  ExternalLink,
  Upload,
  Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LABEL_ACCEPT,
  downloadLabel,
  labelPreviewUrl,
  removeLabel,
  uploadLabel,
} from "@/lib/labels";
import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The nine order statuses collapse into five milestones a customer cares about.
 * 'cancelled' is not on the path — it replaces the timeline entirely.
 */
const MILESTONES = [
  { label: "Requested", statuses: ["pending"] },
  { label: "Approved", statuses: ["approved"] },
  { label: "Packed", statuses: ["picking", "packed", "ready"] },
  { label: "In transit", statuses: ["in_transit"] },
  { label: "Delivered", statuses: ["delivered", "completed"] },
];

function OrderTimeline({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-[var(--radius-lg)] border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
        This order was cancelled
      </div>
    );
  }

  const current = MILESTONES.findIndex((step) => step.statuses.includes(status));

  return (
    <ol className="flex items-start gap-1">
      {MILESTONES.map((step, index) => {
        const done = index <= current;
        return (
          <li key={step.label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              {/* connector on the left of every step but the first */}
              <span
                className={cn(
                  "h-0.5 flex-1",
                  index === 0
                    ? "bg-transparent"
                    : index <= current
                      ? "bg-primary"
                      : "bg-border"
                )}
              />
              <span
                className={cn(
                  "h-3 w-3 shrink-0 rounded-full border-2",
                  done
                    ? "border-primary bg-primary"
                    : "border-border bg-background"
                )}
              />
              <span
                className={cn(
                  "h-0.5 flex-1",
                  index === MILESTONES.length - 1
                    ? "bg-transparent"
                    : index < current
                      ? "bg-primary"
                      : "bg-border"
                )}
              />
            </div>
            <span
              className={cn(
                "text-center text-[10px] leading-tight sm:text-xs",
                done ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface OrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  showCustomerInfo?: boolean;
  onStatusUpdate?: (orderId: string, currentStatus: string) => void;
  onDeleted?: () => void;
}

interface OrderDetails {
  id: string;
  order_number: string;
  status: string;
  order_type: string;
  requested_date: string;
  scheduled_date: string | null;
  completed_date: string | null;
  total_items: number;
  total_quantity: number;
  handling_charges: number | null;
  delivery_charges: number | null;
  total_charges: number | null;
  special_instructions: string | null;
  order_category: string | null;
  label_path: string | null;
  customer_id: string;
  notes: string | null;
  customers?: {
    company_name: string;
    contact_person: string;
    email: string;
    phone: string;
  };
  warehouses: {
    warehouse_name: string;
    warehouse_code: string;
  };
  outbound_order_items: Array<{
    id: string;
    order_item: string;
    quantity: number;
    unit_price: number | null;
    inventory_item_id: string;
  }>;
}

export default function OrderDetailsDialog({
  open,
  onOpenChange,
  orderId,
  showCustomerInfo = false,
  onStatusUpdate,
  onDeleted,
}: OrderDetailsDialogProps) {
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pricing, setPricing] = useState(false);
  const [savingCharges, setSavingCharges] = useState(false);
  const [rate, setRate] = useState(0);
  const [delivery, setDelivery] = useState(0);
  const [prices, setPrices] = useState<Record<string, number>>({});

  /**
   * Customer-created orders arrive unpriced — the customer never sees rates.
   * This is where an admin puts a price on the work before invoicing it.
   */
  const startPricing = () => {
    if (!orderDetails) return;
    const quantity = orderDetails.total_quantity || 1;
    setRate(Number(((orderDetails.handling_charges ?? 0) / quantity).toFixed(4)));
    setDelivery(orderDetails.delivery_charges ?? 0);
    setPrices(
      Object.fromEntries(
        orderDetails.outbound_order_items.map((item) => [
          item.id,
          item.unit_price ?? 0,
        ])
      )
    );
    setPricing(true);
  };

  const itemsSubtotal = orderDetails
    ? orderDetails.outbound_order_items.reduce(
        (sum, item) =>
          sum +
          item.quantity *
            (pricing ? prices[item.id] ?? 0 : item.unit_price ?? 0),
        0
      )
    : 0;

  const handling = rate * (orderDetails?.total_quantity ?? 0);
  const pricedTotal = itemsSubtotal + handling + delivery;

  const saveCharges = async () => {
    if (!orderDetails) return;
    setSavingCharges(true);

    try {
      // Unit price is not a quantity, so none of the stock triggers fire here
      for (const item of orderDetails.outbound_order_items) {
        const next = prices[item.id] ?? 0;
        if (next === (item.unit_price ?? 0)) continue;

        const { error } = await supabase
          .from("outbound_order_items")
          .update({ unit_price: next })
          .eq("id", item.id);
        if (error) throw new Error(error.message);
      }

      const { error } = await supabase
        .from("outbound_orders")
        .update({
          handling_charges: handling,
          delivery_charges: delivery,
          total_charges: pricedTotal,
        })
        .eq("id", orderDetails.id);
      if (error) throw new Error(error.message);

      toast.success("Charges saved");
      setPricing(false);
      fetchOrderDetails();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save charges"
      );
    } finally {
      setSavingCharges(false);
    }
  };

  const labelInputRef = useRef<HTMLInputElement>(null);
  const [replacingLabel, setReplacingLabel] = useState(false);

  // Customers may only swap a label while the order is still pending; admins
  // always can. The database function enforces this too.
  const canReplaceLabel =
    !!orderDetails &&
    (showCustomerInfo || orderDetails.status === "pending");

  const handleReplaceLabel = async (file: File) => {
    if (!orderDetails) return;

    setReplacingLabel(true);
    let newPath: string | null = null;
    try {
      newPath = await uploadLabel(orderDetails.customer_id, file);

      const { data: oldPath, error } = await supabase.rpc(
        "replace_order_label",
        { p_order_id: orderDetails.id, p_label_path: newPath }
      );
      if (error) throw new Error(error.message);

      if (oldPath) await removeLabel(oldPath);
      toast.success("Shipping label replaced");
      fetchOrderDetails();
    } catch (error) {
      if (newPath) await removeLabel(newPath);
      toast.error(
        error instanceof Error ? error.message : "Failed to replace label"
      );
    } finally {
      setReplacingLabel(false);
      if (labelInputRef.current) labelInputRef.current.value = "";
    }
  };

  const handleLabelAction = async (action: "view" | "download") => {
    if (!orderDetails?.label_path) return;
    try {
      if (action === "view") {
        window.open(await labelPreviewUrl(orderDetails.label_path), "_blank");
      } else {
        await downloadLabel(orderDetails.label_path, orderDetails.order_number);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to open label"
      );
    }
  };

  const handleDelete = async () => {
    if (!orderId) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("outbound_orders")
        .delete()
        .eq("id", orderId);
      if (error) throw error;

      // Stock is returned by the outbound_order_items delete triggers; the label
      // file has nothing left pointing at it, so clean it up too
      if (orderDetails?.label_path) await removeLabel(orderDetails.label_path);

      toast.success("Order deleted successfully");
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      onDeleted?.();
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to delete order";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (open && orderId) {
      fetchOrderDetails();
    } else {
      setOrderDetails(null);
    }
  }, [open, orderId]);

  const fetchOrderDetails = async () => {
    if (!orderId) return;

    setLoading(true);
    try {
      const selectQuery = showCustomerInfo
        ? `
          *,
          warehouses (warehouse_name, warehouse_code),
          outbound_order_items (id, order_item, quantity, unit_price, inventory_item_id),
          customers (company_name, contact_person, email, phone)
        `
        : `
          *,
          warehouses (warehouse_name, warehouse_code),
          outbound_order_items (id, order_item, quantity, unit_price, inventory_item_id)
        `;

      const { data, error } = await supabase
        .from("outbound_orders")
        .select(selectQuery)
        .eq("id", orderId)
        .single();

      if (error) throw error;

      setOrderDetails(data as unknown as OrderDetails);
    } catch (error: unknown) {
      console.error("Error fetching order details:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Order Details</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner label="Loading order details" />
          </div>
        ) : orderDetails ? (
          <div className="space-y-6">
            <OrderTimeline status={orderDetails.status} />

            {/* Order Header */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Order Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Order Number:
                    </span>
                    <span className="font-semibold">
                      {orderDetails.order_number}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Status:
                    </span>
                    <StatusBadge status={orderDetails.status} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Type:</span>
                    <span className="capitalize">
                      {orderDetails.order_type}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Category:
                    </span>
                    <span className="font-medium">
                      {orderDetails.order_category || "Uncategorised"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Shipping Label:
                    </span>
                    <div className="flex flex-wrap justify-end gap-1">
                      {orderDetails.label_path ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => handleLabelAction("view")}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => handleLabelAction("download")}
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </Button>
                        </>
                      ) : (
                        <span className="self-center text-muted-foreground">
                          None
                        </span>
                      )}
                      {canReplaceLabel && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5"
                            disabled={replacingLabel}
                            onClick={() => labelInputRef.current?.click()}
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {replacingLabel ? "Uploading..." : "Replace"}
                          </Button>
                          <input
                            ref={labelInputRef}
                            type="file"
                            accept={LABEL_ACCEPT}
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) handleReplaceLabel(file);
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Warehouse:
                    </span>
                    <span className="font-medium">
                      {orderDetails.warehouses?.warehouse_name} (
                      {orderDetails.warehouses?.warehouse_code})
                    </span>
                  </div>
                </CardContent>
              </Card>

              {showCustomerInfo && orderDetails.customers && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Customer Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Company:
                      </span>
                      <span className="font-medium">
                        {orderDetails.customers.company_name}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Contact:
                      </span>
                      <span>{orderDetails.customers.contact_person}</span>
                    </div>
                    {orderDetails.customers.email && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                          Email:
                        </span>
                        <span className="text-sm">
                          {orderDetails.customers.email}
                        </span>
                      </div>
                    )}
                    {orderDetails.customers.phone && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                          Phone:
                        </span>
                        <span>{orderDetails.customers.phone}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Dates
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Dispatched Date:
                    </span>
                    <span>
                      {new Date(
                        orderDetails.requested_date
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  {orderDetails.scheduled_date && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Scheduled Date:
                      </span>
                      <span>
                        {new Date(
                          orderDetails.scheduled_date
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {orderDetails.completed_date && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Completed Date:
                      </span>
                      <span>
                        {new Date(
                          orderDetails.completed_date
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={pricing ? "md:col-span-2" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Charges
                    </span>
                    {showCustomerInfo && !pricing && (
                      <Button size="sm" variant="outline" onClick={startPricing}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        {(orderDetails.total_charges ?? 0) === 0
                          ? "Set charges"
                          : "Edit charges"}
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>

                {pricing ? (
                  <CardContent className="space-y-4">
                    {/* Per-item prices */}
                    <div className="space-y-2">
                      {orderDetails.outbound_order_items.map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_70px_110px_90px]"
                        >
                          <span className="truncate text-sm">
                            {item.order_item}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            × {item.quantity}
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={prices[item.id] ?? 0}
                            onChange={(event) =>
                              setPrices((prev) => ({
                                ...prev,
                                [item.id]: Number(event.target.value),
                              }))
                            }
                          />
                          <span className="text-right text-sm font-medium">
                            {formatCurrency(
                              item.quantity * (prices[item.id] ?? 0)
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Pick &amp; pack rate per unit</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={rate}
                          onChange={(event) =>
                            setRate(Number(event.target.value))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          × {orderDetails.total_quantity} units ={" "}
                          {formatCurrency(handling)}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Delivery charge</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={delivery}
                          onChange={(event) =>
                            setDelivery(Number(event.target.value))
                          }
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Items subtotal
                        </span>
                        <span>{formatCurrency(itemsSubtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Handling</span>
                        <span>{formatCurrency(handling)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Delivery</span>
                        <span>{formatCurrency(delivery)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 text-base font-bold">
                        <span>Total charges</span>
                        <span>{formatCurrency(pricedTotal)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button disabled={savingCharges} onClick={saveCharges}>
                        {savingCharges ? "Saving..." : "Save charges"}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={savingCharges}
                        onClick={() => setPricing(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                ) : (
                  <CardContent className="space-y-3">
                    {(orderDetails.total_charges ?? 0) === 0 &&
                      orderDetails.status === "pending" && (
                        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-500">
                          {showCustomerInfo
                            ? "Not priced yet — set the charges before invoicing."
                            : "Awaiting pricing by H&S E-commerce."}
                        </p>
                      )}

                    {itemsSubtotal !== 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Items Subtotal:
                        </span>
                        <span className="font-medium">
                          {formatCurrency(itemsSubtotal)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Handling Charges:
                      </span>
                      <span className="font-medium">
                        {formatCurrency(orderDetails.handling_charges ?? 0)}
                      </span>
                    </div>
                    {(orderDetails.delivery_charges ?? 0) !== 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Delivery:
                        </span>
                        <span className="font-medium">
                          {formatCurrency(orderDetails.delivery_charges ?? 0)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Total Quantity:
                      </span>
                      <span className="font-medium">
                        {orderDetails.total_quantity ?? 0}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        Total Charges:
                      </span>
                      <span className="text-lg font-bold">
                        {formatCurrency(orderDetails.total_charges ?? 0)}
                      </span>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>

            {/* Order Items */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Order Items ({orderDetails.total_items} items,{" "}
                  {orderDetails.total_quantity} total units)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {orderDetails.outbound_order_items &&
                  orderDetails.outbound_order_items.length > 0 ? (
                    <>
                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                                Item Name
                              </th>
                              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                                Quantity
                              </th>
                              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                                Unit Price
                              </th>
                              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                                Line Total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {orderDetails.outbound_order_items.map(
                              (item, index) => (
                                <tr
                                  key={index}
                                  className="border-b border-border/60 last:border-b-0"
                                >
                                  <td className="px-4 py-3 font-medium">
                                    {item.order_item || "-"}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {item.quantity}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {formatCurrency(item.unit_price ?? 0)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-medium">
                                    {formatCurrency(
                                      item.quantity * (item.unit_price ?? 0)
                                    )}
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Cards */}
                      <div className="md:hidden space-y-2">
                        {orderDetails.outbound_order_items.map(
                          (item, index) => (
                            <div
                              key={index}
                              className="p-3 border border-border rounded-lg space-y-1"
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-medium">
                                  {item.order_item || "-"}
                                </span>
                                <span className="text-muted-foreground">
                                  Qty: {item.quantity}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-sm text-muted-foreground">
                                <span>
                                  {formatCurrency(item.unit_price ?? 0)} / unit
                                </span>
                                <span className="font-medium text-foreground">
                                  {formatCurrency(
                                    item.quantity * (item.unit_price ?? 0)
                                  )}
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">
                      No items found
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Special Instructions & Notes */}
            {(orderDetails.special_instructions || orderDetails.notes) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Additional Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {orderDetails.special_instructions && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">
                        Special Instructions:
                      </h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {orderDetails.special_instructions}
                      </p>
                    </div>
                  )}
                  {orderDetails.notes && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Notes:</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {orderDetails.notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Order details not found
          </div>
        )}

        {/* Admin action footer */}
        {showCustomerInfo && orderDetails && (
          <DialogFooter className="flex gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              onClick={() => onStatusUpdate?.(orderDetails.id, orderDetails.status)}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Update Status
            </Button>
            <Button
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Order
            </Button>
          </DialogFooter>
        )}
      </DialogContent>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>
              Order <span className="font-semibold">{orderDetails?.order_number}</span> will be
              permanently deleted along with all its items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
