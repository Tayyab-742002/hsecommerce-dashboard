import { formatCurrency } from "./currency.ts";

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
  email?: string | null;
  phone?: string | null;
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

/**
 * Brand palette. The logo pairs golden yellow with near-black, so the yellow is
 * always a background for dark text — never the other way round, which at this
 * lightness fails legibility.
 */
const BRAND = [235, 179, 10] as const;
const INK = [22, 22, 24] as const;
const MUTED = [118, 118, 124] as const;
const CREAM = [253, 247, 230] as const; // brand at ~8% over white
const DEEP = [138, 102, 4] as const; // readable heading on cream
const RULE = [232, 228, 216] as const;
const ZEBRA = [252, 250, 243] as const;

const MARGIN = 40;

const gbDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** Drops blanks so an address never renders with gaps. */
const lines = (parts: (string | null | undefined)[]) =>
  parts.filter((part) => part && String(part).trim()).map(String);

/** The app logo as a data URL. Returns null if it can't be loaded — the
 *  invoice must still render without it. */
async function loadLogo(): Promise<string | null> {
  try {
    const response = await fetch("/logo.png");
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

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
  const logo = await loadLogo();

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const right = pageWidth - MARGIN;
  const contentWidth = pageWidth - MARGIN * 2;

  const fill = (color: readonly number[]) =>
    doc.setFillColor(color[0], color[1], color[2]);
  const ink = (color: readonly number[]) =>
    doc.setTextColor(color[0], color[1], color[2]);
  const font = (style: "normal" | "bold", size: number) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  };

  // ─────────────────────────────────────────────────────────────────────
  // Header band: logo and company on the left, invoice meta on the right
  // ─────────────────────────────────────────────────────────────────────
  fill(CREAM);
  doc.rect(0, 0, pageWidth, 118, "F");
  fill(BRAND);
  doc.rect(0, 118, pageWidth, 4, "F");

  let textLeft = MARGIN;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", MARGIN, 26, 54, 54);
      textLeft = MARGIN + 66;
    } catch {
      // A logo that won't decode shouldn't cost us the invoice
    }
  }

  font("bold", 17);
  ink(INK);
  doc.text(company.company_name, textLeft, 50);

  font("normal", 9);
  ink(MUTED);
  const strap = lines([
    [company.city, company.postal_code].filter(Boolean).join(" "),
    company.email,
    company.phone,
  ]).join("   ·   ");
  if (strap) doc.text(strap, textLeft, 66);

  font("bold", 26);
  ink(INK);
  doc.text("INVOICE", right, 48, { align: "right" });

  font("bold", 11);
  ink(DEEP);
  doc.text(invoice.invoice_number, right, 66, { align: "right" });

  // label / value rows, labels muted and values bold
  const meta: [string, string][] = [
    ["Invoice Date", gbDate(invoice.issue_date)],
    ["Due Date", gbDate(invoice.due_date)],
  ];
  let metaY = 84;
  for (const [label, value] of meta) {
    font("normal", 9);
    ink(MUTED);
    doc.text(label, right - 96, metaY, { align: "right" });
    font("bold", 9);
    ink(INK);
    doc.text(value, right, metaY, { align: "right" });
    metaY += 14;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Billed By / Billed To
  // ─────────────────────────────────────────────────────────────────────
  const cardGap = 14;
  const cardWidth = (contentWidth - cardGap) / 2;
  const cardTop = 142;
  const pad = 14;

  const billedBy = lines([
    company.company_name,
    company.address_line1,
    company.address_line2,
    [company.city, company.postal_code].filter(Boolean).join(" "),
    company.country,
    company.company_number ? `Company no. ${company.company_number}` : null,
    company.vat_registered && company.vat_number
      ? `VAT ${company.vat_number}`
      : null,
    company.email ? `Email: ${company.email}` : null,
    company.phone ? `Phone: ${company.phone}` : null,
  ]);

  const billedTo = lines([
    customer.company_name || customer.contact_person,
    customer.address_line1,
    customer.address_line2,
    [customer.city, customer.postal_code].filter(Boolean).join(" "),
    customer.country,
    customer.tax_id ? `VAT ${customer.tax_id}` : null,
    customer.email ? `Email: ${customer.email}` : null,
    customer.phone ? `Phone: ${customer.phone}` : null,
    `Account: ${customer.customer_code}`,
  ]);

  // Wrap first so both cards can share the taller card's height
  const wrap = (source: string[]) =>
    source.flatMap((line) =>
      doc.splitTextToSize(line, cardWidth - pad * 2) as string[]
    );
  const leftLines = wrap(billedBy);
  const rightLines = wrap(billedTo);
  const cardHeight =
    pad + 16 + Math.max(leftLines.length, rightLines.length) * 13 + pad - 4;

  const drawCard = (x: number, title: string, body: string[]) => {
    fill(CREAM);
    doc.roundedRect(x, cardTop, cardWidth, cardHeight, 7, 7, "F");

    font("bold", 11);
    ink(DEEP);
    doc.text(title, x + pad, cardTop + pad + 6);

    let lineY = cardTop + pad + 24;
    body.forEach((line, index) => {
      font(index === 0 ? "bold" : "normal", 9);
      ink(index === 0 ? INK : MUTED);
      doc.text(line, x + pad, lineY);
      lineY += 13;
    });
  };

  drawCard(MARGIN, "Billed By", leftLines);
  drawCard(MARGIN + cardWidth + cardGap, "Billed To", rightLines);

  // Billing period sits between the cards and the table
  const periodY = cardTop + cardHeight + 20;
  font("normal", 9);
  ink(MUTED);
  doc.text("Billing period", MARGIN, periodY);
  font("bold", 9);
  ink(INK);
  doc.text(
    `${gbDate(invoice.period_start)} — ${gbDate(invoice.period_end)}`,
    MARGIN + 66,
    periodY
  );

  // ─────────────────────────────────────────────────────────────────────
  // Items
  // ─────────────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: periodY + 12,
    margin: { left: MARGIN, right: MARGIN, top: 56 },
    head: [["#", "Item", "Quantity", "Rate", "Amount"]],
    body: invoice.lines.map((line, index) => [
      String(index + 1),
      line.description,
      String(line.quantity),
      formatCurrency(line.unit_price),
      formatCurrency(line.amount),
    ]),
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: { top: 9, bottom: 9, left: 8, right: 8 },
      textColor: [INK[0], INK[1], INK[2]],
      lineColor: [RULE[0], RULE[1], RULE[2]],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [BRAND[0], BRAND[1], BRAND[2]],
      textColor: [INK[0], INK[1], INK[2]],
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 10, bottom: 10, left: 8, right: 8 },
      lineWidth: 0,
    },
    alternateRowStyles: {
      fillColor: [ZEBRA[0], ZEBRA[1], ZEBRA[2]],
    },
    columnStyles: {
      0: { cellWidth: 26, halign: "center", textColor: [MUTED[0], MUTED[1], MUTED[2]] },
      1: { cellWidth: "auto" },
      2: { cellWidth: 66, halign: "right" },
      3: { cellWidth: 70, halign: "right" },
      4: { cellWidth: 78, halign: "right", fontStyle: "bold" },
    },
    // Continuation pages get a slim branded strip instead of the full header
    didDrawPage: (data) => {
      if (data.pageNumber === 1) return;
      fill(CREAM);
      doc.rect(0, 0, pageWidth, 40, "F");
      fill(BRAND);
      doc.rect(0, 40, pageWidth, 3, "F");
      font("bold", 10);
      ink(INK);
      doc.text(company.company_name, MARGIN, 26);
      font("normal", 9);
      ink(MUTED);
      doc.text(invoice.invoice_number, right, 26, { align: "right" });
    },
  });

  // ─────────────────────────────────────────────────────────────────────
  // Bank details (left) and totals (right)
  // ─────────────────────────────────────────────────────────────────────
  let y =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 24;

  const bank: [string, string][] = [];
  if (company.account_name) bank.push(["Account Name", company.account_name]);
  if (company.account_number)
    bank.push(["Account Number", company.account_number]);
  if (company.sort_code) bank.push(["Sort Code", company.sort_code]);
  if (company.bank_name) bank.push(["Bank", company.bank_name]);
  bank.push(["Reference", invoice.invoice_number]);

  const totals: [string, string, boolean][] = [
    ["Subtotal", formatCurrency(invoice.subtotal), false],
  ];
  if (invoice.vat_rate > 0) {
    totals.push([
      `VAT @ ${invoice.vat_rate}%`,
      formatCurrency(invoice.vat_amount),
      false,
    ]);
  }
  if (invoice.amount_paid > 0) {
    totals.push(["Paid", `-${formatCurrency(invoice.amount_paid)}`, false]);
  }

  const bankHeight = pad + 18 + bank.length * 16 + pad - 6;
  const totalsHeight = totals.length * 16 + 44;
  const blockHeight = Math.max(bankHeight, totalsHeight);

  // Keep the closing block whole rather than splitting it across a page break
  if (y + blockHeight > pageHeight - 90) {
    doc.addPage();
    y = 70;
  }

  const bankWidth = cardWidth;
  fill(CREAM);
  doc.roundedRect(MARGIN, y, bankWidth, bankHeight, 7, 7, "F");

  font("bold", 11);
  ink(DEEP);
  doc.text("Bank Details", MARGIN + pad, y + pad + 6);

  let bankY = y + pad + 26;
  for (const [label, value] of bank) {
    font("bold", 9);
    ink(INK);
    doc.text(label, MARGIN + pad, bankY);
    font("normal", 9);
    ink(MUTED);
    doc.text(value, MARGIN + pad + 108, bankY);
    bankY += 16;
  }

  const totalsLeft = MARGIN + cardWidth + cardGap;
  const totalsWidth = cardWidth;
  let totalsY = y + 10;

  for (const [label, value] of totals) {
    font("normal", 10);
    ink(MUTED);
    doc.text(label, totalsLeft + 12, totalsY);
    font("normal", 10);
    ink(INK);
    doc.text(value, totalsLeft + totalsWidth - 12, totalsY, { align: "right" });
    totalsY += 16;
  }

  // The amount owed is the one number a reader looks for
  const dueLabel = invoice.amount_paid > 0 ? "Balance Due (GBP)" : "Total (GBP)";
  const dueValue = formatCurrency(invoice.total - invoice.amount_paid);

  fill(BRAND);
  doc.roundedRect(totalsLeft, totalsY - 2, totalsWidth, 34, 7, 7, "F");
  font("bold", 12);
  ink(INK);
  doc.text(dueLabel, totalsLeft + 12, totalsY + 20);
  font("bold", 14);
  doc.text(dueValue, totalsLeft + totalsWidth - 12, totalsY + 20, {
    align: "right",
  });

  // ─────────────────────────────────────────────────────────────────────
  // Notes and footer
  // ─────────────────────────────────────────────────────────────────────
  let footerY = Math.max(bankY, totalsY + 46) + 12;

  for (const block of [invoice.notes, company.invoice_footer]) {
    if (!block) continue;
    font("normal", 8);
    ink(MUTED);
    for (const line of doc.splitTextToSize(block, contentWidth) as string[]) {
      if (footerY > pageHeight - 60) break;
      doc.text(line, MARGIN, footerY);
      footerY += 11;
    }
    footerY += 4;
  }

  // Void stamp and page numbers, on every page
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);

    if (invoice.status === "void") {
      doc.saveGraphicsState();
      // @ts-expect-error — GState is present at runtime, not in the older types
      doc.setGState(new doc.GState({ opacity: 0.18 }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(90);
      doc.setTextColor(200, 30, 30);
      doc.text("VOID", pageWidth / 2, pageHeight / 2, {
        align: "center",
        angle: 24,
      });
      doc.restoreGraphicsState();
    }

    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, pageHeight - 46, right, pageHeight - 46);

    font("normal", 8);
    ink(MUTED);
    doc.text(
      `${company.company_name} · ${invoice.invoice_number}`,
      MARGIN,
      pageHeight - 32
    );
    doc.text(`Page ${page} of ${pageCount}`, right, pageHeight - 32, {
      align: "right",
    });
  }

  return doc.output("blob");
}
