import { supabase } from "@/integrations/supabase/client";

const BUCKET = "shipping-labels";

export const LABEL_ACCEPT = ".pdf,.png,.jpg,.jpeg";
const MAX_LABEL_BYTES = 10 * 1024 * 1024;

/** Uploads a label file and returns its storage path: {customer_id}/{filename} */
export async function uploadLabel(customerId: string, file: File): Promise<string> {
  if (file.size > MAX_LABEL_BYTES) {
    throw new Error("Label file must be 10MB or smaller");
  }
  if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
    throw new Error("Label must be a PDF, PNG or JPG file");
  }

  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const path = `${customerId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(error.message || "Failed to upload label");
  return path;
}

export async function removeLabel(path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}

async function fetchLabel(path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Could not read label ${path}: ${error?.message ?? "not found"}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

function saveAs(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Downloads one label as-is, keeping its original format. */
export async function downloadLabel(path: string, filename: string) {
  const bytes = await fetchLabel(path);
  const ext = path.split(".").pop()?.toLowerCase() ?? "pdf";
  const type = ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
  saveAs(new Blob([bytes], { type }), `${filename}.${ext}`);
}

/**
 * Merges the given labels into one PDF and downloads it. pdf-lib is imported
 * lazily so it stays out of the main bundle.
 */
export async function downloadMergedLabels(paths: string[], filename: string) {
  const { mergeLabels } = await import("./mergePdf");

  const sources = [];
  for (const path of paths) {
    sources.push({ name: path, bytes: await fetchLabel(path) });
  }

  const merged = await mergeLabels(sources);
  saveAs(new Blob([merged], { type: "application/pdf" }), filename);
}

/**
 * Downloads several labels as one ZIP, each file keeping its own format and
 * named after its order. fflate is imported lazily, like pdf-lib.
 */
export async function downloadLabelsZip(
  labels: { path: string; name: string }[],
  filename: string
) {
  const { zipSync } = await import("fflate");

  const files: Record<string, Uint8Array> = {};
  for (const label of labels) {
    const ext = label.path.split(".").pop()?.toLowerCase() ?? "pdf";
    const safeName = label.name.replace(/[^\w.-]/g, "_");

    // Two orders can share a number in theory; don't let one overwrite the other
    let entry = `${safeName}.${ext}`;
    let suffix = 2;
    while (files[entry]) entry = `${safeName}-${suffix++}.${ext}`;

    files[entry] = await fetchLabel(label.path);
  }

  saveAs(new Blob([zipSync(files)], { type: "application/zip" }), filename);
}

/** Short-lived viewable URL, for previewing a label in a new tab. */
export async function labelPreviewUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw new Error(error?.message || "Could not open label");
  return data.signedUrl;
}
