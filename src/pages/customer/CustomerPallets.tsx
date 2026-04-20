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

interface Pallet {
  id: string;
  pallet_number: string;
  container_number: string | null;
  status: string;
  condition: string;
  received_date: string;
  pallet_items: { id: string }[];
}

export default function CustomerPallets() {
  const { userRole } = useAuth();
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPalletId, setSelectedPalletId] = useState<string | null>(null);

  useEffect(() => {
    if (userRole?.customer_id) fetchPallets(userRole.customer_id);
  }, [userRole]);

  const fetchPallets = async (customerId: string) => {
    try {
      const { data, error } = await supabase
        .from("pallets")
        .select(`
          id,
          pallet_number,
          container_number,
          status,
          condition,
          received_date,
          pallet_items (id)
        `)
        .eq("customer_id", customerId)
        .order("received_date", { ascending: false });

      if (error) throw error;
      setPallets((data as unknown as Pallet[]) || []);
    } catch (error) {
      console.error("Error fetching pallets:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPallets = pallets.filter((p) => {
    const matchesSearch =
      p.pallet_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.container_number || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const hasActiveFilters = statusFilter !== "all" || searchTerm !== "";

  const statusLabel = (s: string) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const inStorage = pallets.filter((p) => p.status === "in_storage").length;
  const partiallyPicked = pallets.filter((p) => p.status === "partially_picked").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Pallets</h1>
        <p className="text-sm text-muted-foreground">
          View your stored pallets and their contents
        </p>
      </div>

      {/* Summary KPIs */}
      {!loading && pallets.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Total Pallets</p>
            <p className="text-2xl font-bold">{pallets.length}</p>
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
              {pallets.length - inStorage - partiallyPicked}
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
            Showing {filteredPallets.length} of {pallets.length} pallets
          </div>
        </CardHeader>

        <CardContent>
          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner label="Loading pallets" />
              </div>
            ) : filteredPallets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No pallets found
              </div>
            ) : (
              filteredPallets.map((pallet) => (
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
                    <div className="text-right">{pallet.pallet_items.length} SKUs</div>
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
                    <th className="px-3 py-3 text-left font-medium">SKUs</th>
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
                  ) : filteredPallets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                        No pallets found
                      </td>
                    </tr>
                  ) : (
                    filteredPallets.map((pallet) => (
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
                        <td className="px-3 py-3 whitespace-nowrap">
                          {pallet.pallet_items.length}
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
