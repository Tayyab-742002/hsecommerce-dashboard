import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import Spinner from "@/components/Spinner";
import { Separator } from "@/components/ui/separator";
import { MapPin, Package, CalendarDays, Container } from "lucide-react";

interface PalletDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  palletId: string | null;
  showLocation?: boolean; // admins see location, customers don't
}

interface PalletDetail {
  id: string;
  pallet_number: string;
  container_number: string | null;
  location: string | null;
  status: string;
  condition: string;
  notes: string | null;
  received_date: string;
  storage_charges: number;
  customers: { company_name: string | null; contact_person: string } | null;
  warehouses: { warehouse_name: string } | null;
  pallet_items: {
    id: string;
    quantity: number;
    inventory_items: {
      item_name: string;
      item_code: string;
      sku: string | null;
    } | null;
  }[];
}

export default function PalletDetailSheet({
  open,
  onOpenChange,
  palletId,
  showLocation = true,
}: PalletDetailSheetProps) {
  const [pallet, setPallet] = useState<PalletDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && palletId) fetchPallet(palletId);
    else setPallet(null);
  }, [open, palletId]);

  const fetchPallet = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pallets")
        .select(`
          *,
          customers (company_name, contact_person),
          warehouses (warehouse_name),
          pallet_items (
            id,
            quantity,
            inventory_items (item_name, item_code, sku)
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setPallet(data as unknown as PalletDetail);
    } catch (error) {
      console.error("Error fetching pallet:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalUnits = pallet?.pallet_items.reduce((sum, pi) => sum + pi.quantity, 0) ?? 0;

  const conditionLabel: Record<string, string> = {
    good: "Good",
    damaged: "Damaged",
    water_damaged: "Water Damaged",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pallet ? pallet.pallet_number : "Pallet Details"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner label="Loading pallet..." />
          </div>
        ) : !pallet ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            Pallet not found.
          </p>
        ) : (
          <div className="space-y-5">
            {/* Status + Condition */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={pallet.status.replace(/_/g, " ")} />
              <span className="text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
                {conditionLabel[pallet.condition] ?? pallet.condition}
              </span>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {pallet.customers && (
                <>
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium text-right">
                    {pallet.customers.company_name || pallet.customers.contact_person}
                  </span>
                </>
              )}

              {pallet.warehouses && (
                <>
                  <span className="text-muted-foreground">Warehouse</span>
                  <span className="font-medium text-right">
                    {pallet.warehouses.warehouse_name}
                  </span>
                </>
              )}

              <span className="text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> Received
              </span>
              <span className="font-medium text-right">
                {new Date(pallet.received_date).toLocaleDateString("en-GB")}
              </span>

              {pallet.container_number && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Container className="h-3.5 w-3.5" /> Container
                  </span>
                  <span className="font-medium text-right">
                    {pallet.container_number}
                  </span>
                </>
              )}

              {showLocation && pallet.location && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> Location
                  </span>
                  <span className="font-medium text-right">{pallet.location}</span>
                </>
              )}

              {pallet.storage_charges > 0 && (
                <>
                  <span className="text-muted-foreground">Storage Charges</span>
                  <span className="font-medium text-right">
                    £{pallet.storage_charges.toFixed(2)}
                  </span>
                </>
              )}
            </div>

            {pallet.notes && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                {pallet.notes}
              </p>
            )}

            <Separator />

            {/* Contents */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Package className="h-4 w-4" />
                  Contents
                </h4>
                <span className="text-xs text-muted-foreground">
                  {pallet.pallet_items.length} SKU{pallet.pallet_items.length !== 1 ? "s" : ""}&nbsp;·&nbsp;
                  {totalUnits} unit{totalUnits !== 1 ? "s" : ""}
                </span>
              </div>

              {pallet.pallet_items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items recorded.</p>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          Item
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          SKU
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">
                          Qty
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pallet.pallet_items.map((pi) => (
                        <tr
                          key={pi.id}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-medium">
                              {pi.inventory_items?.item_name ?? "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {pi.inventory_items?.item_code}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {pi.inventory_items?.sku ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium">
                            {pi.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
