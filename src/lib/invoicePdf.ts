import { formatCurrency } from "@/lib/currency";

export interface InvoiceCompany {
  company_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  company_number: string | null;
  vat_registered: boolean;
  vat_number: string | null;
  bank_name: string | null;
  account_name: string | null;
  sort_code: string | null;
  account_number: string | null;
  invoice_footer: string | null;
}

export interface InvoiceCustomer {
  company_name: string | null;
  contact_person: string;
  customer_code: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  tax_id: string | null;
}

export interface InvoiceDocument {
  invoice_number: string;
  status: string;
  issue_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  notes: string | null;
  lines: {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }[];
}

const gbDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** Drops blank lines so an address never renders with gaps. */
const addressLines = (parts: (string | null | undefined)[]) =>
  parts.filter((part) => part && part.trim()).map((part) => part as string);

/**
 * Renders the invoice and returns it as a PDF blob.
 *
 * jsPDF and the autotable plugin are imported lazily so they stay out of the
 * main bundle — only the invoice screens pay for them.
 */
export async function buildInvoicePdf(
  invoice: InvoiceDocument,
  company: InvoiceCompany,
  customer: InvoiceCustomer
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const right = pageWidth - margin;

  const ink = [17, 24, 39] as const;
  const muted = [107, 114, 128] as const;

  // ── letterhead ────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...ink);
  doc.text(company.company_name, margin, 56);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  let y = 72;
  for (const line of addressLines([
    company.address_line1,
    company.address_line2,
    [company.city, company.postal_code].filter(Boolean).join(" "),
    company.country,
    company.email,
    company.phone,
    company.company_number ? `Company no. ${company.company_number}` : null,
    company.vat_registered && company.vat_number
      ? `VAT ${company.vat_number}`
      : null,
  ])) {
    doc.text(line, margin, y);
    y += 12;
  }

  // ── invoice meta, right aligned ───────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...ink);
  doc.text("INVOICE", right, 56, { align: "right" });

  doc.setFontSize(10);
  doc.text(invoice.invoice_number, right, 74, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(`Issued  ${gbDate(invoice.issue_date)}`, right, 90, {
    align: "right",
  });
  doc.text(`Due     ${gbDate(invoice.due_date)}`, right, 102, {
    align: "right",
  });

  if (invoice.status === "void") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(220, 38, 38);
    doc.text("VOID", pageWidth / 2, 300, { align: "center", angle: 20 });
  }

  // ── bill to / period ──────────────────────────────────────────────────
  const blockTop = Math.max(y, 118) + 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("BILL TO", margin, blockTop);
  doc.text("PERIOD", right, blockTop, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...ink);
  let billY = blockTop + 14;
  for (const line of addressLines([
    customer.company_name || customer.contact_person,
    customer.address_line1,
    customer.address_line2,
    [customer.city, customer.postal_code].filter(Boolean).join(" "),
    customer.country,
    customer.tax_id ? `VAT ${customer.tax_id}` : null,
  ])) {
    doc.text(line, margin, billY);
    billY += 12;
  }

  let metaY = blockTop + 14;
  doc.text(
    `${gbDate(invoice.period_start)} – ${gbDate(invoice.period_end)}`,
    right,
    metaY,
    { align: "right" }
  );
  metaY += 12;
  doc.text(`Account ${customer.customer_code}`, right, metaY, {
    align: "right",
  });

  // ── lines ─────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: Math.max(billY, metaY) + 18,
    margin: { left: margin, right: margin },
    head: [["Description", "Qty", "Unit", "Amount"]],
    body: invoice.lines.map((line) => [
      line.description,
      String(line.quantity),
      formatCurrency(line.unit_price),
      formatCurrency(line.amount),
    ]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 24, 39],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 44, halign: "right" },
      2: { cellWidth: 70, halign: "right" },
      3: { cellWidth: 80, halign: "right" },
    },
  });

  // ── totals ────────────────────────────────────────────────────────────
  const afterTable =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 18;

  const totals: [string, string, boolean][] = [
    ["Subtotal", formatCurrency(invoice.subtotal), false],
  ];
  // VAT only appears when the business is actually registered
  if (invoice.vat_rate > 0) {
    totals.push([
      `VAT @ ${invoice.vat_rate}%`,
      formatCurrency(invoice.vat_amount),
      false,
    ]);
  }
  totals.push(["Total", formatCurrency(invoice.total), true]);
  if (invoice.amount_paid > 0) {
    totals.push(["Paid", `-${formatCurrency(invoice.amount_paid)}`, false]);
    totals.push([
      "Balance due",
      formatCurrency(invoice.total - invoice.amount_paid),
      true,
    ]);
  }

  let totalsY = afterTable;
  for (const [label, value, strong] of totals) {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 11 : 9);
    const tone = strong ? ink : muted;
    doc.setTextColor(tone[0], tone[1], tone[2]);
    doc.text(label, right - 90, totalsY, { align: "right" });
    doc.setTextColor(...ink);
    doc.text(value, right, totalsY, { align: "right" });
    totalsY += strong ? 18 : 14;
  }

  // ── payment details and notes ─────────────────────────────────────────
  let footerY = totalsY + 16;
  const payment = addressLines([
    company.bank_name,
    company.account_name ? `Account name: ${company.account_name}` : null,
    company.sort_code ? `Sort code: ${company.sort_code}` : null,
    company.account_number ? `Account number: ${company.account_number}` : null,
    `Payment reference: ${invoice.invoice_number}`,
  ]);

  if (payment.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("PAYMENT DETAILS", margin, footerY);
    footerY += 14;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...ink);
    for (const line of payment) {
      doc.text(line, margin, footerY);
      footerY += 12;
    }
  }

  for (const block of [invoice.notes, company.invoice_footer]) {
    if (!block) continue;
    footerY += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    for (const line of doc.splitTextToSize(block, right - margin)) {
      doc.text(line, margin, footerY);
      footerY += 11;
    }
  }

  return doc.output("blob");
}
