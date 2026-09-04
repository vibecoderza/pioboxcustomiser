// Node serverless signature (req, res). The web-standard Request/Response form is not
// reliably detected here and silently hangs the request, so use the explicit form.
//
// Uploads use the presigned flow (OIDC-authenticated), NOT a static BLOB_READ_WRITE_TOKEN.
// An absent static token is correct here, so this reports the presigned inputs instead.
export default function handler(req, res) {
  const uploads = {
    mode: "presigned",
    storeId: Boolean(process.env.BLOB_STORE_ID),
    oidc: Boolean(process.env.VERCEL_OIDC_TOKEN),
    webhookKey: Boolean(process.env.BLOB_WEBHOOK_PUBLIC_KEY),
    staticToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  };
  res.status(200).json({
    ok: true,
    service: "piobox-customizer-host",
    uploads,
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    time: new Date().toISOString(),
  });
}
