import { supabase } from "@/integrations/supabase/client";
import {
  buildInvoicePdf,
  type InvoiceCompany,
  type InvoiceCustomer,
  type InvoiceDocument,
} from "@/lib/invoicePdf";

const BUCKET = "invoices";

export const COMPANY_FIELDS =
  "company_name, address_line1, address_line2, city, postal_code, country, email, phone, company_number, vat_registered, vat_number, vat_rate, bank_name, account_name, sort_code, account_number, payment_terms_days, invoice_footer";

export const CUSTOMER_FIELDS =
  "company_name, contact_person, customer_code, address_line1, address_line2, city, postal_code, country, tax_id, email, phone";

/** Storage path for an invoice PDF: {customer_id}/{invoice_number}.pdf */
export const invoicePdfPath = (customerId: string, invoiceNumber: string) =>
  `${customerId}/${invoiceNumber}.pdf`;

export async function renderAndStoreInvoicePdf(
  customerId: string,
  invoice: InvoiceDocument,
  company: InvoiceCompany,
  customer: InvoiceCustomer
) {
  const blob = await buildInvoicePdf(invoice, company, customer);
  const path = invoicePdfPath(customerId, invoice.invoice_number);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(error.message);

  return path;
}

async function fetchPdf(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(error?.message || "Invoice PDF not found");
  }
  return data;
}

export async function downloadInvoicePdf(path: string, invoiceNumber: string) {
  const blob = await fetchPdf(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${invoiceNumber}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function invoicePreviewUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 600);
  if (error || !data) throw new Error(error?.message || "Could not open invoice");
  return data.signedUrl;
}

/** A link the customer can open from a chat, valid for a week. */
export async function invoiceShareLink(path: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (error || !data) throw new Error(error?.message || "Could not create link");
  return data.signedUrl;
}

/**
 * Hands the actual PDF to whatever the device can share with — on a phone that
 * includes WhatsApp. Returns false when the browser can't share files (most
 * desktops), so the caller can fall back to a wa.me link instead.
 */
export async function shareInvoiceFile(path: string, invoiceNumber: string) {
  const blob = await fetchPdf(path);
  const file = new File([blob], `${invoiceNumber}.pdf`, {
    type: "application/pdf",
  });

  if (!navigator.canShare?.({ files: [file] })) return false;

  try {
    await navigator.share({ files: [file], title: invoiceNumber });
    return true;
  } catch (error) {
    // The user dismissing the share sheet is not a failure worth reporting
    if (error instanceof DOMException && error.name === "AbortError") return true;
    throw error;
  }
}

/**
 * WhatsApp's click-to-chat link carries text only — it cannot attach a file.
 * So the message carries a signed link to the PDF instead.
 */
export function whatsAppUrl(phone: string | null, message: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const text = encodeURIComponent(message);
  return digits
    ? `https://wa.me/${digits}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

export function invoiceMessage(
  companyName: string,
  invoiceNumber: string,
  total: string,
  dueDate: string,
  link: string
) {
  return [
    `${companyName} — invoice ${invoiceNumber}`,
    `Amount due: ${total}`,
    `Due by: ${dueDate}`,
    "",
    `Download: ${link}`,
  ].join("\n");
}
