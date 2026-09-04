import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  Badge, BlockStack, Box, Button, Card, DataTable, Divider, InlineGrid, InlineStack, Layout, Page, Text, Thumbnail,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { designIdsFromLineItems, readDesignRecord, signRecordFiles } from "../lib/records.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const gid = `gid://shopify/Order/${params.id}`;
  const res = await admin.graphql(
    `#graphql
      query CustomizerOrder($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          note
          displayFinancialStatus
          displayFulfillmentStatus
          customer { displayName email phone }
          shippingAddress { formatted }
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 100) {
            nodes { title variantTitle quantity originalUnitPriceSet { shopMoney { amount currencyCode } } customAttributes { key value } }
          }
        }
      }`,
    { variables: { id: gid } },
  );
  const json = await res.json();
  const order = json.data?.order;
  if (!order) throw new Response("Order not found", { status: 404 });

  const designIds = designIdsFromLineItems(order.lineItems.nodes);
  const designs = await Promise.all(
    designIds.map(async (id) => {
      const record = await readDesignRecord(id);
      return { id, record: record ? await signRecordFiles(record) : null };
    }),
  );
  for (const d of designs) if (!d.record) console.warn("design record missing", d.id);
  return { order, designs };
};

// Without this the route's own render errors bubble to the parent boundary and can paint an
// empty frame, which is indistinguishable from "loaded but blank".
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

const fmt = (amount: number | string, currency: string) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(typeof amount === "string" ? Number(amount) : amount / 100);

const preflightTone = (s?: string) => (s === "ready" ? "success" : s === "review" ? "attention" : s === "fix" ? "critical" : undefined);

export default function Order() {
  const { order, designs } = useLoaderData<typeof loader>();
  const cur = order.totalPriceSet.shopMoney.currencyCode;

  return (
    <Page
      title={`Order ${order.name}`}
      subtitle={new Date(order.createdAt).toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "short" })}
      backAction={{ url: "/app" }}
      titleMetadata={
        <InlineStack gap="200">
          <Badge tone={order.displayFinancialStatus === "PAID" ? "success" : "attention"}>{order.displayFinancialStatus}</Badge>
          <Badge>{order.displayFulfillmentStatus}</Badge>
        </InlineStack>
      }
    >
      <TitleBar title={`Order ${order.name}`} />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {designs.map(({ id, record }) =>
              record ? <Design key={id} record={record} /> : <MissingRecord key={id} id={id} />,
            )}
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">Customer</Text>
                <Text as="p">{order.customer?.displayName ?? "—"}</Text>
                {order.customer?.email ? <Text as="p" tone="subdued">{order.customer.email}</Text> : null}
                {order.customer?.phone ? <Text as="p" tone="subdued">{order.customer.phone}</Text> : null}
                {order.shippingAddress?.formatted?.length ? (
                  <Text as="p" tone="subdued">{order.shippingAddress.formatted.join(", ")}</Text>
                ) : null}
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">Order lines</Text>
                <DataTable
                  columnContentTypes={["text", "numeric", "numeric"]}
                  headings={["Item", "Qty", "Unit"]}
                  rows={order.lineItems.nodes.map((li: any) => [
                    `${li.title}${li.variantTitle ? ` · ${li.variantTitle}` : ""}`,
                    li.quantity,
                    fmt(li.originalUnitPriceSet.shopMoney.amount, cur),
                  ])}
                  totals={["", "", fmt(order.totalPriceSet.shopMoney.amount, cur)]}
                  showTotalsInFooter
                />
              </BlockStack>
            </Card>
            {order.note ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm">Order note</Text>
                  <Text as="p">{order.note}</Text>
                </BlockStack>
              </Card>
            ) : null}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function MissingRecord({ id }: { id: string }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h2" variant="headingMd">Design {id}</Text>
        <Text as="p" tone="critical">
          No design record was found for this id. Orders placed before records were introduced only carry the line-item summary;
          the artwork and mockup links on the order itself still work from the Vercel dashboard.
        </Text>
      </BlockStack>
    </Card>
  );
}

function Design({ record }: { record: any }) {
  const cur = record.price?.currency ?? "ZAR";
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">{record.product.name} · {record.methodLabel}</Text>
            <Text as="p" tone="subdued">
              Design {record.designId} · {record.product.styleNumber} · {record.quantity} pieces
            </Text>
          </BlockStack>
          <InlineStack gap="200" blockAlign="center">
            <span style={{ width: 18, height: 18, borderRadius: 4, background: record.color.hex, border: "1px solid #e1e3e5", display: "inline-block" }} />
            <Text as="span">{record.color.label ?? record.color.name}</Text>
          </InlineStack>
        </InlineStack>

        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
          {record.mockups.map((m: any) => (
            <FilePanel key={m.side} label={`Mockup · ${m.label}`} url={m.url} />
          ))}
          {record.preview ? <FilePanel label="Preview (all sides)" url={record.preview} /> : null}
        </InlineGrid>

        <Divider />

        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">Artwork</Text>
          <DataTable
            columnContentTypes={["text", "text", "text", "text", "text", "text"]}
            headings={["Side", "Placement", "File", "Printed width", "Preflight", ""]}
            rows={record.layers.map((l: any) => [
              l.side,
              l.areaLabel ?? l.placement?.area,
              l.text ? `Text “${l.text.content}”` : l.fileName,
              l.printedWidthIn ? `${l.printedWidthIn.toFixed(1)} in` : "—",
              <PreflightCell key="pf" pf={l.preflight} isVector={l.isVector} />,
              l.url ? <Button key="dl" url={l.url} external size="slim">Open</Button> : "—",
            ])}
          />
        </BlockStack>

        <Divider />

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Size run</Text>
            <DataTable
              columnContentTypes={["text", "numeric"]}
              headings={["Size", "Qty"]}
              rows={record.sizes.map((s: any) => [s.size ?? s.label, s.quantity])}
              totals={["", record.quantity]}
              showTotalsInFooter
            />
          </BlockStack>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Price at checkout</Text>
            <DataTable
              columnContentTypes={["text", "numeric", "numeric"]}
              headings={["Line", "Qty", "Total"]}
              rows={record.price.lines.map((l: any) => [l.label, l.qty, fmt(l.total, cur)])}
              totals={["", "", fmt(record.price.subtotal, cur)]}
              showTotalsInFooter
            />
          </BlockStack>
        </InlineGrid>

        {record.notes ? (
          <>
            <Divider />
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Production notes</Text>
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13 }}>{record.notes}</pre>
              </Box>
            </BlockStack>
          </>
        ) : null}

        {record.fonts?.length ? (
          <Text as="p" tone="subdued">
            Uploaded fonts: {record.fonts.map((f: any, i: number) => (
              <span key={i}>{i ? ", " : ""}{f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a> : f.name}</span>
            ))}
          </Text>
        ) : null}
      </BlockStack>
    </Card>
  );
}

function FilePanel({ label, url }: { label: string; url: string | null }) {
  return (
    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
      <BlockStack gap="200" inlineAlign="center">
        {url ? <Thumbnail source={url} alt={label} size="large" /> : <Text as="p" tone="critical">Missing</Text>}
        <Text as="p" variant="bodySm">{label}</Text>
        {url ? <Button url={url} external size="slim">Open full size</Button> : null}
      </BlockStack>
    </Box>
  );
}

function PreflightCell({ pf, isVector }: { pf: any; isVector: boolean }) {
  if (!pf) return <Text as="span" tone="subdued">{isVector ? "Vector" : "Not analysed"}</Text>;
  return (
    <BlockStack gap="050">
      <Badge tone={preflightTone(pf.status)}>{pf.headline}</Badge>
      {pf.dpi ? <Text as="span" variant="bodySm" tone="subdued">{pf.dpi} DPI at print size</Text> : null}
      {pf.flags?.length ? <Text as="span" variant="bodySm" tone="subdued">{pf.flags.join(" · ")}</Text> : null}
    </BlockStack>
  );
}
