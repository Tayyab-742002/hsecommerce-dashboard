import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Spinner from "@/components/Spinner";
import TablePagination from "@/components/TablePagination";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { formatCurrency } from "@/lib/currency";
import { downloadInvoicePdf, invoicePreviewUrl } from "@/lib/invoices";
import { toast } from "sonner";
import { Download, ExternalLink, FileText, Receipt } from "lucide-react";
import { useState } from "react";

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  period_start: string;
  period_end: string;
  issue_date: string | null;
  due_date: string | null;
  total: number;
  pdf_path: string | null;
  viewed_at: string | null;
}

const gbDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB") : "—";

const isOverdue = (invoice: Invoice) =>
  invoice.status === "sent" &&
  !!invoice.due_date &&
  new Date(invoice.due_date) < new Date();

function statusBadge(invoice: Invoice) {
  if (invoice.status === "void")
    return { label: "void", tone: "bg-muted text-muted-foreground" };
  if (invoice.status === "paid")
    return { label: "paid", tone: "bg-green-600 text-white" };
  if (isOverdue(invoice))
    return { label: "overdue", tone: "bg-destructive text-destructive-foreground" };
  return { label: "due", tone: "bg-blue-600 text-white" };
}

export default function CustomerInvoices({
  customerId,
}: {
  customerId: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const invoices = usePagedQuery<Invoice>(
    customerId
      ? () =>
          supabase
            .from("invoices")
            .select("*", { count: "exact" })
            .eq("customer_id", customerId)
            .order("issue_date", { ascending: false, nullsFirst: false })
            .returns<Invoice[]>()
      : null,
    [customerId]
  );

  /** Opening an invoice is also the read receipt the admin sees. */
  const open = async (invoice: Invoice) => {
    if (!invoice.pdf_path) {
      toast.error("This invoice has no document attached");
      return;
    }

    setBusy(invoice.id);
    try {
      const url = await invoicePreviewUrl(invoice.pdf_path);
      window.open(url, "_blank");
      if (!invoice.viewed_at) {
        await supabase.rpc("mark_invoice_viewed", { p_invoice_id: invoice.id });
        invoices.refetch();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open");
    } finally {
      setBusy(null);
    }
  };

  const download = async (invoice: Invoice) => {
    if (!invoice.pdf_path) return;
    setBusy(invoice.id);
    try {
      await downloadInvoicePdf(invoice.pdf_path, invoice.invoice_number);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download");
    } finally {
      setBusy(null);
    }
  };

  const outstanding = invoices.rows
    .filter((invoice) => invoice.status === "sent")
    .reduce((sum, invoice) => sum + Number(invoice.total), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Invoices
        </CardTitle>
        {outstanding > 0 && (
          <span className="text-sm text-muted-foreground">
            {formatCurrency(outstanding)} outstanding on this page
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {invoices.loading ? (
          <div className="flex justify-center py-12">
            <Spinner label="Loading invoices" />
          </div>
        ) : invoices.rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No invoices yet
          </p>
        ) : (
          invoices.rows.map((invoice) => {
            const badge = statusBadge(invoice);
            return (
              <div
                key={invoice.id}
                className={`flex flex-col gap-3 rounded-[var(--radius-lg)] border p-3 md:flex-row md:items-center md:gap-4 ${
                  invoice.viewed_at
                    ? "border-border bg-card"
                    : "border-primary/50 bg-primary/5"
                }`}
              >
                <div className="flex items-center gap-3 md:w-44">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                      {invoice.invoice_number}
                      {!invoice.viewed_at && (
                        <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
                          New
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Issued {gbDate(invoice.issue_date)}
                    </p>
                  </div>
                </div>

                <div className="min-w-0 flex-1 text-sm">
                  <p>
                    {gbDate(invoice.period_start)} – {gbDate(invoice.period_end)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due {gbDate(invoice.due_date)}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <span className="font-semibold">
                    {formatCurrency(invoice.total)}
                  </span>
                  <Badge className={`capitalize ${badge.tone}`}>
                    {badge.label}
                  </Badge>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="View invoice"
                      disabled={busy === invoice.id}
                      onClick={() => open(invoice)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Download PDF"
                      disabled={busy === invoice.id}
                      onClick={() => download(invoice)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
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
  );
}
