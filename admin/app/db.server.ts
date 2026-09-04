import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

// Each serverless invocation gets its own Prisma client, so Prisma's default pool of 5
// connections per client multiplies fast and exhausts Postgres — the logs showed
// "Timed out fetching a new connection from the connection pool" under light use. One
// connection per invocation is the documented setting for serverless.
function serverlessUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw || !process.env.VERCEL) return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    return url.toString();
  } catch {
    return raw;
  }
}

const client = () => {
  const url = serverlessUrl();
  return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
};

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = client();
  }
}

const prisma = global.prismaGlobal ?? client();

export default prisma;
