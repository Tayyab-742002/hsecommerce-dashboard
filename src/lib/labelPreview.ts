/**
 * Thumbnails for shipping labels, so a stack of twenty parcels can be told
 * apart by eye rather than by filename.
 *
 * pdf.js is imported lazily and only when a PDF actually needs rendering —
 * images never load it.
 */

export interface LabelPreview {
  url: string;
  /** Revoke object URLs when the wizard closes; data URLs need no cleanup. */
  revoke: boolean;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/** Renders the first page of a PDF, or shows the image, at roughly `width` px. */
export async function labelThumbnail(
  file: File,
  width = 220
): Promise<LabelPreview | null> {
  if (/\.(png|jpe?g)$/i.test(file.name)) {
    return { url: URL.createObjectURL(file), revoke: true };
  }

  try {
    const pdfjs = await getPdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data }).promise;
    const page = await pdf.getPage(1);

    const base = page.getViewport({ scale: 1 });
    // Render at 2x for a crisp thumbnail on high-density screens
    const viewport = page.getViewport({ scale: (width / base.width) * 2 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext("2d");
    if (!context) return null;

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    void pdf.cleanup();

    return { url: canvas.toDataURL("image/jpeg", 0.8), revoke: false };
  } catch {
    // A label that won't render is still a valid file to upload
    return null;
  }
}
