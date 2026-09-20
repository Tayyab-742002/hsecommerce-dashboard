import { PDFDocument } from "pdf-lib";

export interface LabelSource {
  /** Used only to pick the decoder — PDF, PNG or JPG */
  name: string;
  bytes: Uint8Array;
}

/**
 * Merges shipping labels into a single PDF, in the order given. PDF labels
 * contribute all their pages; image labels get one page sized to the image.
 */
export async function mergeLabels(sources: LabelSource[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const { name, bytes } of sources) {
    if (/\.(png|jpe?g)$/i.test(name)) {
      const image = /\.png$/i.test(name)
        ? await merged.embedPng(bytes)
        : await merged.embedJpg(bytes);
      const page = merged.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    } else {
      const source = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(source, source.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }
  }

  return merged.save();
}
