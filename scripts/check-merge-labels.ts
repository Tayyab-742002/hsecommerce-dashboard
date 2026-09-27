// Runnable check for the label merge: node --experimental-strip-types scripts/check-merge-labels.ts
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { mergeLabels } from "../src/lib/mergePdf.ts";

async function pdfWith(pageCount: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([283, 425]); // ~10x15cm label
  return doc.save();
}

// 1x1 red PNG
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  )
);

const merged = await mergeLabels([
  { name: "a/one.pdf", bytes: await pdfWith(1) },
  { name: "a/two.pdf", bytes: await pdfWith(2) },
  { name: "a/three.png", bytes: PNG },
]);

const result = await PDFDocument.load(merged);
assert.equal(result.getPageCount(), 4, "1 + 2 pdf pages + 1 image page");

const imagePage = result.getPage(3);
assert.equal(Math.round(imagePage.getWidth()), 1, "image page is sized to the image");

console.log("ok — merged 3 labels into 4 pages");
