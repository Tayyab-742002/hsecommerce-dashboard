import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Spinner from "@/components/Spinner";
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
import { formatCurrency } from "@/lib/currency";
import {
  COMPANY_FIELDS,
  CUSTOMER_FIELDS,
  downloadInvoicePdf,
  invoiceMessage,
  invoicePreviewUrl,
  invoiceShareLink,
  renderAndStoreInvoicePdf,
  shareInvoiceFile,
  whatsAppUrl,
} from "@/lib/invoices";
import type { InvoiceCompany, InvoiceCustomer } from "@/lib/invoicePdf";
import { toast } from "sonner";
import {
  Ban,
  Download,
  ExternalLink,
  MessageCircle,
  Plus,
  Send,
  Share2,
  Trash2,
  Wallet,
} from "lucide-react";

export interface InvoiceRecord {
  id: string;
  invoice_number: string | null;
  customer_id: string;
  status: string;
  period_start: string;
  period_end: string;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
  pdf_path: string | null;
  customers?: { company_name: string | null; contact_person: string; phone: string | null };
}

interface Line {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  source_type: string;
  source_id: string | null;
}

interface InvoiceDialogProps {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const gbDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB") : "—";

const lineTotal = (line: Line) => line.quantity * line.unit_price;

export default function InvoiceDialog({
  invoiceId,
  open,
  onOpenChange,
  onChanged,
}: InvoiceDialogProps) {
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [payment, setPayment] = useState({
    date: new Date().toISOString().split("T")[0],
    method: "Bank transfer",
    reference: "",
  });

  const isDraft = invoice?.status === "draft";

  const load = async () => {
    if (!invoiceId) return;
    setLoading(true);

    const [{ data: header }, { data: rows }] = await Promise.all([
      supabase
        .from("invoices")
        .select("*, customers (company_name, contact_person, phone)")
        .eq("id", invoiceId)
        .maybeSingle(),
      supabase
        .from("invoice_lines")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("line_no"),
    ]);

    setInvoice((header as unknown as InvoiceRecord) ?? null);
    setNotes(header?.notes ?? "");
    setLines(
      (rows ?? []).map((row) => ({
        id: row.id,
        description: row.description,
        quantity: Number(row.quantity),
        unit_price: Number(row.unit_price),
        source_type: row.source_type,
        source_id: row.source_id,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    if (open && invoiceId) load();
    else if (!open) setInvoice(null);
  }, [open, invoiceId]);

  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const vatRate = invoice ? Number(invoice.vat_rate) : 0;
  const vatAmount = (subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something failed");
    } finally {
      setBusy(null);
    }
  };

  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );

  /** Draft lines are rewritten wholesale — simpler than syncing row by row. */
  const saveDraft = async () => {
    if (!invoice) return;

    await supabase.from("invoice_lines").delete().eq("invoice_id", invoice.id);

    if (lines.length > 0) {
      const { error } = await supabase.from("invoice_lines").insert(
        lines.map((line, index) => ({
          invoice_id: invoice.id,
          line_no: index + 1,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unit_price,
          amount: lineTotal(line),
          source_type: line.source_type,
          source_id: line.source_id,
        }))
      );
      if (error) throw new Error(error.message);
    }

    const { error } = await supabase
      .from("invoices")
      .update({ notes, subtotal, vat_amount: vatAmount, total })
      .eq("id", invoice.id);
    if (error) throw new Error(error.message);

    toast.success("Draft saved");
    onChanged();
    load();
  };

  /**
   * Issuing is the point of no return: the invoice takes its number, the PDF is
   * rendered and stored, and the customer can see it in their portal.
   */
  const issue = async () => {
    if (!invoice) return;
    if (lines.length === 0) throw new Error("Add at least one line first");

    await saveDraft();

    const [{ data: company }, { data: customer }] = await Promise.all([
      supabase.from("company_settings").select(COMPANY_FIELDS).eq("id", 1).maybeSingle(),
      supabase
        .from("customers")
        .select(CUSTOMER_FIELDS)
        .eq("id", invoice.customer_id)
        .maybeSingle(),
    ]);

    if (!company?.company_name) {
      throw new Error("Add your company details in Settings before issuing");
    }
    if (!customer) throw new Error("Customer not found");

    const { data: number, error: numberError } = await supabase.rpc(
      "next_invoice_number"
    );
    if (numberError || !number) {
      throw new Error(numberError?.message || "Could not allocate a number");
    }

    const issueDate = new Date();
    const dueDate = new Date(issueDate);
    dueDate.setDate(issueDate.getDate() + (company.payment_terms_days ?? 14));
    const iso = (date: Date) => date.toISOString().split("T")[0];

    const pdfPath = await renderAndStoreInvoicePdf(
      invoice.customer_id,
      {
        invoice_number: number,
        status: "sent",
        issue_date: iso(issueDate),
        due_date: iso(dueDate),
        period_start: invoice.period_start,
        period_end: invoice.period_end,
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        amount_paid: 0,
        notes,
        lines: lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unit_price,
          amount: lineTotal(line),
        })),
      },
      company as InvoiceCompany,
      customer as InvoiceCustomer
    );

    const { error } = await supabase
      .from("invoices")
      .update({
        invoice_number: number,
        status: "sent",
        issue_date: iso(issueDate),
        due_date: iso(dueDate),
        subtotal,
        vat_amount: vatAmount,
        total,
        pdf_path: pdfPath,
        sent_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
    if (error) throw new Error(error.message);

    toast.success(`${number} issued and published to the customer portal`);
    onChanged();
    load();
  };

  const markPaid = async () => {
    if (!invoice) return;
    const { error } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        amount_paid: invoice.total,
        paid_at: new Date(payment.date).toISOString(),
        payment_method: payment.method,
        payment_reference: payment.reference || null,
      })
      .eq("id", invoice.id);

    if (error) toast.error(error.message);
    else {
      toast.success("Marked as paid");
      onChanged();
      load();
    }
    setPayOpen(false);
  };

  const voidInvoice = async () => {
    if (!invoice) return;
    const { error } = await supabase
      .from("invoices")
      .update({
        status: "void",
        voided_at: new Date().toISOString(),
        void_reason: voidReason || null,
      })
      .eq("id", invoice.id);

    if (error) toast.error(error.message);
    else {
      toast.success("Invoice voided — its orders can be invoiced again");
      onChanged();
      load();
    }
    setVoidOpen(false);
    setVoidReason("");
  };

  const shareOnWhatsApp = async () => {
    if (!invoice?.pdf_path || !invoice.invoice_number) return;

    // On a phone the PDF itself can go into the chat; elsewhere send a link
    const shared = await shareInvoiceFile(
      invoice.pdf_path,
      invoice.invoice_number
    );
    if (shared) return;

    const link = await invoiceShareLink(invoice.pdf_path);
    const { data: company } = await supabase
      .from("company_settings")
      .select("company_name")
      .eq("id", 1)
      .maybeSingle();

    window.open(
      whatsAppUrl(
        invoice.customers?.phone ?? null,
        invoiceMessage(
          company?.company_name ?? "H&S E-commerce",
          invoice.invoice_number,
          formatCurrency(invoice.total),
          gbDate(invoice.due_date),
          link
        )
      ),
      "_blank"
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {invoice?.invoice_number ?? "Draft invoice"}
              {invoice && (
                <Badge
                  variant={invoice.status === "void" ? "destructive" : "secondary"}
                  className="capitalize"
                >
                  {invoice.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {loading || !invoice ? (
            <div className="flex justify-center py-12">
              <Spinner label="Loading invoice" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">
                    {invoice.customers?.company_name ||
                      invoice.customers?.contact_person}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Period</p>
                  <p className="font-medium">
                    {gbDate(invoice.period_start)} – {gbDate(invoice.period_end)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Issued</p>
                  <p className="font-medium">{gbDate(invoice.issue_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due</p>
                  <p className="font-medium">{gbDate(invoice.due_date)}</p>
                </div>
              </div>

              <Separator />

              {/* Lines */}
              <div className="space-y-2">
                {lines.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No lines yet
                  </p>
                )}

                {lines.map((line, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-2 rounded-[var(--radius-lg)] border border-border p-2 sm:grid-cols-[1fr_70px_90px_90px_auto] sm:items-center"
                  >
                    <Input
                      value={line.description}
                      disabled={!isDraft}
                      onChange={(event) =>
                        updateLine(index, { description: event.target.value })
                      }
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={line.quantity}
                      disabled={!isDraft}
                      onChange={(event) =>
                        updateLine(index, {
                          quantity: Number(event.target.value),
                        })
                      }
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={line.unit_price}
                      disabled={!isDraft}
                      onChange={(event) =>
                        updateLine(index, {
                          unit_price: Number(event.target.value),
                        })
                      }
                    />
                    <p className="text-right text-sm font-medium">
                      {formatCurrency(lineTotal(line))}
                    </p>
                    {isDraft && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setLines((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}

                {isDraft && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        {
                          description: "",
                          quantity: 1,
                          unit_price: 0,
                          source_type: "manual",
                          source_id: null,
                        },
                      ])
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add line
                  </Button>
                )}
              </div>

              {/* Totals */}
              <div className="ml-auto w-full space-y-1 text-sm sm:w-64">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {vatRate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      VAT @ {vatRate}%
                    </span>
                    <span>{formatCurrency(vatAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 text-base font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                {invoice.amount_paid > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Paid</span>
                    <span>-{formatCurrency(invoice.amount_paid)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notes shown on the invoice</Label>
                <Textarea
                  rows={2}
                  value={notes}
                  disabled={!isDraft}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                {isDraft ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => run("save", saveDraft)}
                    >
                      {busy === "save" ? "Saving..." : "Save draft"}
                    </Button>
                    <Button
                      disabled={busy !== null || lines.length === 0}
                      onClick={() => run("issue", issue)}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {busy === "issue" ? "Issuing..." : "Issue & send to portal"}
                    </Button>
                  </>
                ) : (
                  <>
                    {invoice.pdf_path && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() =>
                            run("open", async () => {
                              const url = await invoicePreviewUrl(
                                invoice.pdf_path as string
                              );
                              window.open(url, "_blank");
                            })
                          }
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            run("download", () =>
                              downloadInvoicePdf(
                                invoice.pdf_path as string,
                                invoice.invoice_number as string
                              )
                            )
                          }
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy === "share"}
                          onClick={() => run("share", shareOnWhatsApp)}
                        >
                          {typeof navigator !== "undefined" && navigator.canShare ? (
                            <Share2 className="mr-2 h-4 w-4" />
                          ) : (
                            <MessageCircle className="mr-2 h-4 w-4" />
                          )}
                          {busy === "share" ? "Preparing..." : "Send on WhatsApp"}
                        </Button>
                      </>
                    )}
                    {invoice.status === "sent" && (
                      <Button onClick={() => setPayOpen(true)}>
                        <Wallet className="mr-2 h-4 w-4" />
                        Mark as paid
                      </Button>
                    )}
                    {invoice.status !== "void" && (
                      <Button
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setVoidOpen(true)}
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Void
                      </Button>
                    )}
                  </>
                )}
              </div>

              {!isDraft && invoice.status !== "void" && (
                <p className="text-xs text-muted-foreground">
                  An issued invoice can't be edited. To correct it, void this one
                  and raise a new invoice — its orders become billable again.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Record payment */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment date</Label>
              <Input
                type="date"
                value={payment.date}
                onChange={(event) =>
                  setPayment({ ...payment, date: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Input
                value={payment.method}
                onChange={(event) =>
                  setPayment({ ...payment, method: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input
                placeholder="Optional"
                value={payment.reference}
                onChange={(event) =>
                  setPayment({ ...payment, reference: event.target.value })
                }
              />
            </div>
            <Button className="w-full" onClick={markPaid}>
              Mark {formatCurrency(invoice?.total ?? 0)} as paid
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              It stays on record marked VOID, and the orders it covered become
              billable again so you can reissue. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={voidInvoice}>Void</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
