import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import Spinner from "@/components/Spinner";
import PalletDetailSheet from "@/components/PalletDetailSheet";
import { Search, Eye, Filter, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import TablePagination from "@/components/TablePagination";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { useDebounced } from "@/hooks/useDebounced";
import { likeTerm } from "@/lib/dateRange";

interface Pallet {
  id: string;
  pallet_number: string;
  container_number: string | null;
  status: string;
  condition: string;
  received_date: string;
  pallet_items: {
    id: string;
    quantity: number;
    inventory_items: {
      item_name: string | null;
      sku: string | null;
      item_code: string | null;
    } | null;
  }[];
}

export default function CustomerPallets() {
  const { userRole } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPalletId, setSelectedPalletId] = useState<string | null>(null);

  const debouncedSearch = useDebounced(searchTerm);
  const customerId = userRole?.customer_id ?? null;

  const pallets = usePagedQuery<Pallet>(
    customerId
      ? () => {
          let query = supabase
            .from("pallets")
            .select(
              `
          id,
          pallet_number,
          container_number,
          status,
          condition,
          received_date,
          pallet_items (
            id,
            quantity,
            inventory_items (item_name, sku, item_code)
          )
        `,
              { count: "exact" }
            )
            .eq("customer_id", customerId);

          const term = debouncedSearch.trim();
          if (term) {
            query = query.or(
              [
                `pallet_number.ilike.${likeTerm(term)}`,
                `container_number.ilike.${likeTerm(term)}`,
              ].join(",")
            );
          }

          if (statusFilter !== "all") query = query.eq("status", statusFilter);

          return query
            .order("received_date", { ascending: false })
            .returns<Pallet[]>();
        }
      : null,
    [customerId, debouncedSearch, statusFilter]
  );

  const loading = pallets.loading;

  const hasActiveFilters = statusFilter !== "all" || searchTerm !== "";

  const statusLabel = (s: string) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const formatPalletItems = (items: Pallet["pallet_items"]) => {
    if (!items.length) return "—";

    const labels = items
      .map((item) => item.inventory_items?.item_name || item.inventory_items?.sku || item.inventory_items?.item_code)
      .filter((label): label is string => Boolean(label));

    if (!labels.length) return `${items.length} item${items.length > 1 ? "s" : ""}`;

    const uniqueLabels = Array.from(new Set(labels));
    const preview = uniqueLabels.slice(0, 2).join(", ");
    const remaining = uniqueLabels.length - 2;

    return remaining > 0 ? `${preview} +${remaining} more` : preview;
  };

  // KPI counts cover every pallet, not the page on screen, so they come from
  // count-only queries rather than the fetched rows
  const [counts, setCounts] = useState({
    total: 0,
    inStorage: 0,
    partiallyPicked: 0,
  });

  useEffect(() => {
    if (!customerId) return;

    const countPallets = (status?: string) => {
      let query = supabase
        .from("pallets")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId);
      if (status) query = query.eq("status", status);
      return query;
    };

    Promise.all([
      countPallets(),
      countPallets("in_storage"),
      countPallets("partially_picked"),
    ]).then(([all, inStorage, partiallyPicked]) =>
      setCounts({
        total: all.count ?? 0,
        inStorage: inStorage.count ?? 0,
        partiallyPicked: partiallyPicked.count ?? 0,
      })
    );
  }, [customerId, pallets.total]);

  const inStorage = counts.inStorage;
  const partiallyPicked = counts.partiallyPicked;


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Pallets</h1>
        <p className="text-sm text-muted-foreground">
          View your stored pallets and their contents
        </p>
      </div>

      {/* Summary KPIs */}
      {!loading && counts.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Total Pallets</p>
            <p className="text-2xl font-bold">{counts.total}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">In Storage</p>
            <p className="text-2xl font-bold text-green-600">{inStorage}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Partially Picked</p>
            <p className="text-2xl font-bold text-orange-500">{partiallyPicked}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Empty / Other</p>
            <p className="text-2xl font-bold text-muted-foreground">
              {counts.total - inStorage - partiallyPicked}
            </p>
          </div>
        </div>
      )}

      <Card className="border border-border shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="text-xl font-semibold">Pallet List</CardTitle>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by pallet number or container..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filter
              {hasActiveFilters && (
                <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {[statusFilter !== "all", searchTerm !== ""].filter(Boolean).length}
                </span>
              )}
            </Button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStatusFilter("all"); setSearchTerm(""); }}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="in_storage">In Storage</SelectItem>
                    <SelectItem value="partially_picked">Partially Picked</SelectItem>
                    <SelectItem value="empty">Empty</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
          </div>
        </CardHeader>

        <CardContent>
          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner label="Loading pallets" />
              </div>
            ) : pallets.rows.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No pallets found
              </div>
            ) : (
              pallets.rows.map((pallet) => (
                <div
                  key={pallet.id}
                  className="rounded-lg border border-border bg-card p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{pallet.pallet_number}</div>
                    <StatusBadge status={statusLabel(pallet.status)} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
                    <div className="text-muted-foreground text-xs">Container</div>
                    <div className="text-right">{pallet.container_number || "—"}</div>
                    <div className="text-muted-foreground text-xs">Items</div>
                    <div className="text-right">{formatPalletItems(pallet.pallet_items)}</div>
                    <div className="text-muted-foreground text-xs">Arrived</div>
                    <div className="text-right">
                      {new Date(pallet.received_date).toLocaleDateString("en-GB")}
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPalletId(pallet.id);
                        setDetailOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-3 text-left font-medium">Pallet No.</th>
                    <th className="px-3 py-3 text-left font-medium">Container</th>
                    <th className="px-3 py-3 text-left font-medium">Items</th>
                    <th className="px-3 py-3 text-left font-medium">Condition</th>
                    <th className="px-3 py-3 text-left font-medium">Status</th>
                    <th className="px-3 py-3 text-left font-medium">Arrived</th>
                    <th className="px-3 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                        Loading pallets...
                      </td>
                    </tr>
                  ) : pallets.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                        No pallets found
                      </td>
                    </tr>
                  ) : (
                    pallets.rows.map((pallet) => (
                      <tr
                        key={pallet.id}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <td className="px-3 py-3 font-medium whitespace-nowrap">
                          {pallet.pallet_number}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                          {pallet.container_number || "—"}
                        </td>
                        <td className="px-3 py-3 max-w-[260px] truncate">
                          {formatPalletItems(pallet.pallet_items)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap capitalize">
                          {pallet.condition.replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <StatusBadge status={statusLabel(pallet.status)} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {new Date(pallet.received_date).toLocaleDateString("en-GB")}
                        </td>
                        <td className="px-3 py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedPalletId(pallet.id);
                              setDetailOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        <TablePagination
            page={pallets.page}
            pageCount={pallets.pageCount}
            from={pallets.from}
            to={pallets.to}
            total={pallets.total}
            onPageChange={pallets.setPage}
            label="pallets"
          />
        </CardContent>
      </Card>

      <PalletDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        palletId={selectedPalletId}
        showLocation={false}
      />
    </div>
  );
}
