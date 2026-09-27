// Runnable check: node --experimental-strip-types scripts/check-invoice-pdf.ts
// Renders a real invoice through the same code path the app uses. There is no
// logo and no browser here, so it also exercises the fallbacks.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { buildInvoicePdf } from "../src/lib/invoicePdf.ts";

const company = {
  company_name: "H & S E-commerce Ltd",
  address_line1: "Unit 1, Office 1, George Street West",
  address_line2: null,
  city: "Blackburn",
  postal_code: "BB2 1PQ",
  country: "United Kingdom",
  email: "handsecommerce@gmail.com",
  phone: "+44 7955 426807",
  company_number: "12345678",
  vat_registered: false,
  vat_number: null,
  bank_name: "Monzo Business",
  account_name: "H & S ECOMMERCE LTD",
  sort_code: "040003",
  account_number: "56887399",
  invoice_footer: "Thank you for your business.",
};

const customer = {
  company_name: "EAZWORKS LTD",
  contact_person: "A. Rehman",
  customer_code: "CUS-014",
  address_line1: "Room 15, 226 Dogsthorpe Road",
  address_line2: null,
  city: "Peterborough",
  postal_code: "PE1 3PB",
  country: "United Kingdom",
  tax_id: null,
  email: "adbulrehmanenterprize@gmail.com",
  phone: "+44 7307 608672",
};

const line = (n: number) => ({
  description: `OUT-2026-${String(n).padStart(4, "0")} · 02 Aug · 4 items, 14 units · T-Shirts`,
  quantity: 1,
  unit_price: 12.5,
  amount: 12.5,
});

// Enough lines to force a page break, so the continuation header and the
// keep-the-totals-together rule both run
const many = Array.from({ length: 45 }, (_, i) => line(i + 1));
const subtotal = many.reduce((sum, row) => sum + row.amount, 0);

const invoice = {
  invoice_number: "INV-2026-0042",
  status: "sent",
  issue_date: "2026-09-01",
  due_date: "2026-09-15",
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  subtotal,
  vat_rate: 0,
  vat_amount: 0,
  total: subtotal,
  amount_paid: 0,
  notes: "Storage for August is billed separately.",
  lines: many,
};

const blob = await buildInvoicePdf(invoice, company, customer);
const bytes = new Uint8Array(await blob.arrayBuffer());

assert.equal(blob.type, "application/pdf");
assert.ok(bytes.length > 5000, "a rendered invoice should not be near-empty");
assert.deepEqual(
  Array.from(bytes.slice(0, 4)),
  [0x25, 0x50, 0x44, 0x46],
  "starts with %PDF"
);

// Multi-page: the page tree must report more than one page for 45 lines
const text = Buffer.from(bytes).toString("latin1");
const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
assert.ok(pageCount > 1, `expected a page break, got ${pageCount} page(s)`);

// A one-line invoice must render too, with no VAT row and a paid balance
const paid = await buildInvoicePdf(
  {
    ...invoice,
    status: "paid",
    lines: [line(1)],
    subtotal: 12.5,
    total: 12.5,
    amount_paid: 12.5,
    notes: null,
  },
  company,
  customer
);
assert.ok((await paid.arrayBuffer()).byteLength > 2000, "single-line invoice renders");

// Void invoices carry a watermark and still render
const voided = await buildInvoicePdf(
  { ...invoice, status: "void", lines: [line(1)] },
  company,
  customer
);
assert.ok((await voided.arrayBuffer()).byteLength > 2000, "void invoice renders");

const out = process.argv[2];
if (out) {
  writeFileSync(out, bytes);
  console.log(`wrote ${out}`);
}

console.log(`ok — invoice renders across ${pageCount} pages`);
