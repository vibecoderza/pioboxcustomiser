// Issues presigned upload URLs so the browser sends design files straight to Vercel Blob.
// Files never pass through this function, so the 4.5 MB serverless body limit does not apply.
//
// This store is connected with OIDC (BLOB_STORE_ID + VERCEL_OIDC_TOKEN) and has no static
// read-write token, which is why we use the presigned flow: issueSignedToken authenticates
// via OIDC, and the upload-completed callback is verified with BLOB_WEBHOOK_PUBLIC_KEY.
//
// Security: a storefront has no signed-in user, so this route is reachable by anyone who can
// load the shop. It is constrained by an origin allow-list, a content-type allow-list, a size
// cap, and a random path suffix so uploaded URLs are unguessable.
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";

const ALLOWED_CONTENT_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif",
  "application/pdf", "application/postscript",
  "font/woff2", "font/woff", "font/ttf", "font/otf",
  "application/json",
  "application/octet-stream",
];

// The design record must live at a path the admin can derive from the design id alone
// (designs/<id>/design.json), so it gets no random suffix. A retried submit may rewrite it.
const isRecord = (pathname) => pathname.endsWith("/design.json");
const MAX_BYTES = 30 * 1024 * 1024;
const TOKEN_TTL_MS = 60 * 60 * 1000;

const allowedOrigins = () =>
  (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

// handleUploadPresigned verifies the completion callback against the incoming Request, so
// give it a real one built from the Node request.
function toWebRequest(req, body) {
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return new Request(`${proto}://${host}${req.url}`, {
    method: req.method,
    headers: new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === "string")),
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  const origin = req.headers.origin ?? "";
  const list = allowedOrigins();
  const originOk = list.length === 0 || list.includes(origin.replace(/\/$/, ""));

  res.setHeader("Access-Control-Allow-Origin", originOk && origin ? origin : list.length ? "null" : "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: "Malformed JSON" }); }

  // Blob's upload-completed callback is server-to-server, so it carries no Origin header. It is
  // authenticated by its signature inside handleUploadPresigned instead; the storefront origin
  // allow-list must not apply to it, or every completion is rejected and no upload ever logs.
  const isCallback = body?.type === "blob.upload-completed";
  if (!isCallback && list.length && !originOk) return res.status(403).json({ error: "Origin not allowed" });

  try {
    const callbackUrl = body?.payload?.callbackUrl;
    const json = await handleUploadPresigned({
      body,
      request: toWebRequest(req, body),
      getSignedToken: async (pathname, clientPayload) => {
        if (!pathname.startsWith("designs/")) throw new Error("Uploads must live under designs/.");
        let payload = {};
        try { payload = clientPayload ? JSON.parse(clientPayload) : {}; } catch { /* ignore */ }
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          validUntil: Date.now() + TOKEN_TTL_MS,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: ALLOWED_CONTENT_TYPES,
            maximumSizeInBytes: MAX_BYTES,
            addRandomSuffix: !isRecord(pathname),
            allowOverwrite: isRecord(pathname),
            validUntil: Date.now() + 10 * 60 * 1000,
            // The completion callback only fires when it is declared here, nested — a top-level
            // tokenPayload is silently ignored, which is why no upload ever logged before.
            ...(typeof callbackUrl === "string" && callbackUrl.startsWith("https://")
              ? { onUploadCompleted: { callbackUrl, tokenPayload: JSON.stringify({ designId: payload.designId ?? null, field: payload.field ?? null, origin }) } }
              : {}),
          },
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("design file stored", { url: blob.url, tokenPayload });
      },
    });
    return res.status(200).json(json);
  } catch (error) {
    return res.status(400).json({ error: error?.message ?? "Upload failed" });
  }
}
