import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import Spinner from "@/components/Spinner";
import TablePagination from "@/components/TablePagination";
import InvoiceDialog from "@/components/InvoiceDialog";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { formatCurrency } from "@/lib/currency";
import { lastMonthRange } from "@/lib/dateRange";
import { toast } from "sonner";
import { AlertTriangle, FileText, Plus, Receipt } from "lucide-react";

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  status: string;
  period_start: string;
  period_end: string;
  issue_date: string | null;
  due_date: string | null;
  total: number;
  customers: { company_name: string | null; contact_person: string } | null;
}

interface Candidate {
  source_type: string;
  source_id: string;
  occurred_on: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

const gbDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB") : "—";

/**
 * A candidate with no charges is work nobody priced. Invoicing it at £0 spends
 * it — the once-only guard means it can never be billed again — so these are
 * flagged and left unticked.
 */
const isUnpriced = (row: Candidate) => Number(row.amount) === 0;

function statusTone(invoice: InvoiceRow) {
  if (invoice.status === "void") return "bg-muted text-muted-foreground";
  if (invoice.status === "paid") return "bg-green-600 text-white";
  if (
    invoice.status === "sent" &&
    invoice.due_date &&
    new Date(invoice.due_date) < new Date()
  ) {
    return "bg-destructive text-destructive-foreground";
  }
  if (invoice.status === "sent") return "bg-blue-600 text-white";
  return "bg-amber-500 text-white";
}

function statusLabel(invoice: InvoiceRow) {
  if (
    invoice.status === "sent" &&
    invoice.due_date &&
    new Date(invoice.due_date) < new Date()
  ) {
    return "overdue";
  }
  return invoice.status;
}

export default function AdminInvoices() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [customers, setCustomers] = useState<
    { id: string; name: string }[]
  >([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ customerId: "", ...lastMonthRange() });
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("customers")
      .select("id, company_name, contact_person")
      .eq("status", "active")
      .order("company_name")
      .then(({ data }) =>
        setCustomers(
          (data ?? []).map((customer) => ({
            id: customer.id,
            name: customer.company_name || customer.contact_person,
          }))
        )
      );
  }, []);

  const invoices = usePagedQuery<InvoiceRow>(
    () => {
      let query = supabase
        .from("invoices")
        .select("*, customers (company_name, contact_person)", {
          count: "exact",
        });

      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      return query
        .order("created_at", { ascending: false })
        .returns<InvoiceRow[]>();
    },
    [statusFilter, refreshKey]
  );

  const refresh = () => setRefreshKey((key) => key + 1);

  const loadCandidates = async () => {
    if (!draft.customerId) {
      toast.error("Pick a customer first");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.rpc("invoice_candidates", {
      p_customer_id: draft.customerId,
      p_from: draft.from,
      p_to: draft.to,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setCandidates(data ?? []);
    setChosen(
      (data ?? []).filter((row) => !isUnpriced(row)).map((row) => row.source_id)
    );
  };

  const createDraft = async () => {
    const picked = (candidates ?? []).filter((row) =>
      chosen.includes(row.source_id)
    );

    setBusy(true);
    try {
      const { data: settings } = await supabase
        .from("company_settings")
        .select("vat_registered, vat_rate")
        .eq("id", 1)
        .maybeSingle();

      const subtotal = picked.reduce((sum, row) => sum + Number(row.amount), 0);
      const vatRate = settings?.vat_registered ? Number(settings.vat_rate) : 0;
      const vatAmount = (subtotal * vatRate) / 100;

      const { data: user } = await supabase.auth.getUser();
      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert({
          customer_id: draft.customerId,
          period_start: draft.from,
          period_end: draft.to,
          subtotal,
          vat_rate: vatRate,
          vat_amount: vatAmount,
          total: subtotal + vatAmount,
          created_by: user.user?.id ?? null,
        })
        .select()
        .single();

      if (error || !invoice) throw new Error(error?.message || "Failed");

      if (picked.length > 0) {
        const { error: lineError } = await supabase.from("invoice_lines").insert(
          picked.map((row, index) => ({
            invoice_id: invoice.id,
            line_no: index + 1,
            description: row.description,
            quantity: Number(row.quantity),
            unit_price: Number(row.unit_price),
            amount: Number(row.amount),
            source_type: row.source_type,
            source_id: row.source_id,
          }))
        );
        if (lineError) {
          await supabase.from("invoices").delete().eq("id", invoice.id);
          throw new Error(lineError.message);
        }
      }

      toast.success("Draft created — review it, then issue");
      closeCreate();
      refresh();
      setOpenId(invoice.id);
      setDialogOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create draft"
      );
    } finally {
      setBusy(false);
    }
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCandidates(null);
    setChosen([]);
    setDraft({ customerId: "", ...lastMonthRange() });
  };

  const unpricedCount = (candidates ?? []).filter(isUnpriced).length;

  const chosenTotal = (candidates ?? [])
    .filter((row) => chosen.includes(row.source_id))
    .reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            Bill a customer for a period, then send it to their portal
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New invoice
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>

          {invoices.loading ? (
            <div className="flex justify-center py-12">
              <Spinner label="Loading invoices" />
            </div>
          ) : invoices.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No invoices yet</p>
              <p className="text-sm text-muted-foreground">
                Create one for last month to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.rows.map((invoice) => (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => {
                    setOpenId(invoice.id);
                    setDialogOpen(true);
                  }}
                  className="flex w-full flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 md:flex-row md:items-center md:gap-4"
                >
                  <div className="flex items-center gap-3 md:w-48">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {invoice.invoice_number ?? "Draft"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Issued {gbDate(invoice.issue_date)}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {invoice.customers?.company_name ||
                        invoice.customers?.contact_person}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {gbDate(invoice.period_start)} –{" "}
                      {gbDate(invoice.period_end)} · due{" "}
                      {gbDate(invoice.due_date)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    <span className="font-semibold">
                      {formatCurrency(invoice.total)}
                    </span>
                    <Badge className={`capitalize ${statusTone(invoice)}`}>
                      {statusLabel(invoice)}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}

          <TablePagination
            page={invoices.page}
            pageCount={invoices.pageCount}
            from={invoices.from}
            to={invoices.to}
            total={invoices.total}
            onPageChange={invoices.setPage}
            label="invoices"
          />
        </CardContent>
      </Card>

      {/* Build a draft from a period */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => (open ? setCreateOpen(true) : closeCreate())}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-3">
                <Label>Customer</Label>
                <Select
                  value={draft.customerId}
                  onValueChange={(value) => {
                    setDraft({ ...draft, customerId: value });
                    setCandidates(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>From</Label>
                <Input
                  type="date"
                  value={draft.from}
                  onChange={(event) => {
                    setDraft({ ...draft, from: event.target.value });
                    setCandidates(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input
                  type="date"
                  value={draft.to}
                  onChange={(event) => {
                    setDraft({ ...draft, to: event.target.value });
                    setCandidates(null);
                  }}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={loadCandidates}
                >
                  {busy ? "Loading..." : "Find billable items"}
                </Button>
              </div>
            </div>

            {candidates && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Dispatched orders and pallet storage in this period that aren't
                  already on a live invoice.
                </p>

                {candidates.length === 0 ? (
                  <p className="rounded-[var(--radius-lg)] border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    Nothing billable found. You can still create an empty draft
                    and add lines by hand.
                  </p>
                ) : (
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-[var(--radius-lg)] border border-border p-2">
                    {candidates.map((row) => (
                      <label
                        key={row.source_id}
                        className={`flex cursor-pointer items-center gap-3 rounded-md p-2 text-sm ${
                          isUnpriced(row)
                            ? "bg-amber-500/10 hover:bg-amber-500/20"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={chosen.includes(row.source_id)}
                          onCheckedChange={(checked) =>
                            setChosen((prev) =>
                              checked
                                ? [...prev, row.source_id]
                                : prev.filter((id) => id !== row.source_id)
                            )
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {row.description}
                        </span>
                        {isUnpriced(row) && (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-amber-500/60 text-amber-600"
                          >
                            Unpriced
                          </Badge>
                        )}
                        <span
                          className={`font-medium ${
                            isUnpriced(row) ? "text-amber-600" : ""
                          }`}
                        >
                          {formatCurrency(Number(row.amount))}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {unpricedCount > 0 && (
                  <div className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p>
                      {unpricedCount}{" "}
                      {unpricedCount === 1 ? "item has" : "items have"} no
                      charges yet, so {unpricedCount === 1 ? "it is" : "they are"}{" "}
                      left unticked. Price the order first, or invoice at £0 —
                      once invoiced it can't be billed again.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-[var(--radius-lg)] bg-muted/50 px-3 py-2 text-sm">
                  <span>{chosen.length} selected</span>
                  <span className="font-semibold">
                    {formatCurrency(chosenTotal)}
                  </span>
                </div>

                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={createDraft}
                >
                  {busy ? "Creating..." : "Create draft"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <InvoiceDialog
        invoiceId={openId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onChanged={refresh}
      />
    </div>
  );
}
