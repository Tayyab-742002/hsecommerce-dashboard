import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import Spinner from "@/components/Spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Package,
  Calendar,
  Building2,
  User,
  CreditCard,
  FileText,
} from "lucide-react";

interface OrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  showCustomerInfo?: boolean; // For admin view, show customer info
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
    order_item: string;
    quantity: number;
    inventory_item_id: string;
  }>;
}

export default function OrderDetailsDialog({
  open,
  onOpenChange,
  orderId,
  showCustomerInfo = false,
}: OrderDetailsDialogProps) {
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(false);

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
          outbound_order_items (order_item, quantity, inventory_item_id),
          customers (company_name, contact_person, email, phone)
        `
        : `
          *,
          warehouses (warehouse_name, warehouse_code),
          outbound_order_items (order_item, quantity, inventory_item_id)
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

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Charges
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Pick & Pack Charges:
                    </span>
                    <span className="font-medium">
                      {formatCurrency(
                        orderDetails.handling_charges /
                          orderDetails.total_quantity || 0
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Total Quantity:
                    </span>
                    <span className="font-medium">
                      {orderDetails.total_quantity ?? 0}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold">
                      Total Charges:
                    </span>
                    <span className="text-lg font-bold">
                      {formatCurrency(orderDetails.total_charges ?? 0)}
                    </span>
                  </div>
                </CardContent>
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
                              className="flex justify-between items-center p-3 border border-border rounded-lg"
                            >
                              <span className="font-medium">
                                {item.order_item || "-"}
                              </span>
                              <span className="text-muted-foreground">
                                Qty: {item.quantity}
                              </span>
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
      </DialogContent>
    </Dialog>
  );
}
