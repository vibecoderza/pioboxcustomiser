// Reads design records and mints short-lived read links for files in the private Blob store.
// Nothing here is ever public: staff see files only through links this app signs, so the
// store can stay private and the order's raw URLs (which 403 on their own) are never exposed.
import { issueSignedToken, presignUrl } from "@vercel/blob";

const LINK_TTL_MS = 15 * 60 * 1000;

export type PreflightSummary = {
  status: "ready" | "review" | "fix";
  headline: string;
  facts: string[];
  flags: string[];
  dpi: number | null;
  colorCount: number | null;
  findings: { severity: string; short: string; detail?: string }[];
  methodFits: { method: string; label: string; status: string; note?: string }[];
};

export type DesignRecord = {
  version: number;
  designId: string;
  createdAt: string;
  product: { id: string; name: string; styleNumber: string; category: string };
  color: { hex: string; name: string; label: string; selection: unknown };
  method: string;
  methodLabel: string;
  quantity: number;
  sizes: { size: string; quantity: number; unit: number; variantId?: number | string }[];
  price: {
    currency: string;
    subtotal: number;
    unitPrice: number;
    setupTotal: number;
    decorationUnit: number;
    lines: { id?: string; kind: string; label: string; unit: number; qty: number; total: number }[];
    notes?: string[];
  };
  notes: string;
  email: string;
  layers: {
    side: string;
    areaLabel: string;
    placement: { cx: number; cy: number; width: number; rotation: number; flipX: boolean; area: string };
    printedWidthIn: number | null;
    text: { content: string; fontId: string; color: string; outline?: string | null } | null;
    fileName: string;
    isVector: boolean;
    naturalW: number;
    naturalH: number;
    preflight: PreflightSummary | null;
    url: string | null;
  }[];
  fonts: { name: string; type: string; url: string | null }[];
  mockups: { side: string; label: string; url: string | null }[];
  preview: string | null;
  storefront?: { origin: string; page: string; userAgent: string };
};

function pathnameOf(urlOrPath: string) {
  const raw = /^https?:\/\//i.test(urlOrPath) ? new URL(urlOrPath).pathname : urlOrPath;
  return decodeURIComponent(raw.replace(/^\/+/, ""));
}

export async function signedGetUrl(urlOrPath: string | null | undefined, ttlMs = LINK_TTL_MS) {
  if (!urlOrPath) return null;
  const pathname = pathnameOf(urlOrPath);
  const validUntil = Date.now() + ttlMs;
  const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private" });
  return presignedUrl;
}

export async function readDesignRecord(designId: string): Promise<DesignRecord | null> {
  if (!/^[A-Z0-9-]+$/i.test(designId)) return null;
  const url = await signedGetUrl(`designs/${designId}/design.json`, 60_000);
  const res = await fetch(url!);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Design record ${designId}: HTTP ${res.status}`);
  return (await res.json()) as DesignRecord;
}

/** The record with every file URL replaced by a signed link the browser can open. */
export async function signRecordFiles(record: DesignRecord) {
  const [layers, mockups, fonts, preview] = await Promise.all([
    Promise.all(record.layers.map((l) => signedGetUrl(l.url))),
    Promise.all(record.mockups.map((m) => signedGetUrl(m.url))),
    Promise.all(record.fonts.map((f) => signedGetUrl(f.url))),
    signedGetUrl(record.preview),
  ]);
  return {
    ...record,
    layers: record.layers.map((l, i) => ({ ...l, url: layers[i] })),
    mockups: record.mockups.map((m, i) => ({ ...m, url: mockups[i] })),
    fonts: record.fonts.map((f, i) => ({ ...f, url: fonts[i] })),
    preview,
  };
}

export function designIdsFromLineItems(lineItems: { customAttributes: { key: string; value: string | null }[] }[]) {
  const ids = new Set<string>();
  for (const li of lineItems) for (const a of li.customAttributes) if (a.key === "_pc_design_id" && a.value) ids.add(a.value);
  return [...ids];
}
