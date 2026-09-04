// Browser-side uploader. Files go straight from the customer's browser to Vercel Blob,
// which is what lets us accept artwork larger than the 4.5 MB serverless body limit.
// Presigned uploads: the browser gets a signed PUT URL and streams the file straight to
// Blob storage with no bearer token in flight. Works with an OIDC-connected store.
import { uploadPresigned } from "@vercel/blob/client";

/**
 * Uploads every file in a submitted design and returns the map the Shopify adapter expects:
 *   { "mockup-front": url, "preview": url, "art-0": url, "font-0": url, ... }
 *
 * Pass as `uploadFiles` to createShopifyCart().
 */
export function createVercelBlobUploader({ handleUploadUrl = "/api/upload", onProgress = null } = {}) {
  return async function uploadFiles(payload, { designId }) {
    const jobs = [];
    const add = (field, file) => file && jobs.push({ field, file });

    for (const m of payload.mockups) add(`mockup-${m.side}`, m.file);
    if (payload.finalPreview) add("preview", new File([payload.finalPreview], "preview.png", { type: "image/png" }));
    payload.layers.forEach((l, i) => add(`art-${i}`, l.file));
    payload.fonts.forEach((f, i) => add(`font-${i}`, dataUrlToFile(f.dataUrl, f.name, f.type)));

    const files = {};
    let done = 0;
    for (const job of jobs) {
      const safe = job.file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const blob = await uploadPresigned(`designs/${designId}/${job.field}-${safe}`, job.file, {
        access: "public",
        handleUploadUrl,
        clientPayload: JSON.stringify({ designId, field: job.field }),
      });
      files[job.field] = blob.url;
      onProgress?.(++done, jobs.length, job.field);
    }

    // Line-item properties only carry a few strings; the full design — placements, preflight,
    // price breakdown, size run, where every file went — is written next to the files so the
    // admin can rebuild the order from the design id alone.
    const record = designRecord(payload, files, designId);
    const rec = await uploadPresigned(`designs/${designId}/design.json`,
      new File([JSON.stringify(record)], "design.json", { type: "application/json" }),
      { access: "public", handleUploadUrl, clientPayload: JSON.stringify({ designId, field: "design" }) });
    files.design = rec.url;
    return files;
  };
}

// Strips File/Blob objects so the record is pure JSON; everything else is already plain data.
const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof Blob !== "undefined" && x instanceof Blob ? undefined : x)));

function designRecord(payload, files, designId) {
  return plain({
    version: 1,
    designId,
    createdAt: new Date().toISOString(),
    product: payload.product,
    color: payload.color,
    method: payload.method,
    methodLabel: payload.priceMethodLabel ?? payload.method,
    quantity: payload.quantity,
    sizes: payload.sizes,
    price: payload.price,
    notes: payload.notes,
    email: payload.email,
    layers: payload.layers.map((l, i) => ({
      side: l.side, placement: l.placement, areaLabel: l.areaLabel, printedWidthIn: l.printedWidthIn ?? null,
      text: l.text, fileName: l.fileName, isVector: l.isVector, naturalW: l.naturalW, naturalH: l.naturalH,
      preflight: l.preflight ?? null,
      url: files[`art-${i}`] ?? null,
    })),
    fonts: payload.fonts.map((f, i) => ({ name: f.name, type: f.type, url: files[`font-${i}`] ?? null })),
    mockups: payload.mockups.map((m) => ({ side: m.side, label: m.label, url: files[`mockup-${m.side}`] ?? null })),
    preview: files.preview ?? null,
    design: payload.design,
    storefront: { origin: location.origin, page: location.href, userAgent: navigator.userAgent },
  });
}

function dataUrlToFile(dataUrl, name, type) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new File([u8], name, { type: type || "application/octet-stream" });
}
