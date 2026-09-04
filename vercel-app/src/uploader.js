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
    return files;
  };
}

function dataUrlToFile(dataUrl, name, type) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new File([u8], name, { type: type || "application/octet-stream" });
}
