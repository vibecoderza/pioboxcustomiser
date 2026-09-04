import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Badge, Card, EmptyState, IndexTable, Layout, Page, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { designIdsFromLineItems } from "../lib/records.server";

const HELPER_TITLES = /^(decoration|setup)\b/i;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(
    `#graphql
      query CustomizerOrders {
        orders(first: 100, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            customer { displayName email }
            totalPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 100) {
              nodes { title quantity customAttributes { key value } }
            }
          }
        }
      }`,
  );
  const json = await res.json();
  const orders = (json.data?.orders?.nodes ?? [])
    .map((o: any) => {
      const designIds = designIdsFromLineItems(o.lineItems.nodes);
      // Garment lines carry the size run; the Decoration and Setup helper products are charges.
      const pieces = o.lineItems.nodes
        .filter((li: any) => !HELPER_TITLES.test(li.title))
        .reduce((n: number, li: any) => n + li.quantity, 0);
      return {
        id: o.id.split("/").pop(),
        name: o.name,
        createdAt: o.createdAt,
        financial: o.displayFinancialStatus,
        fulfillment: o.displayFulfillmentStatus,
        customer: o.customer?.displayName ?? "—",
        email: o.customer?.email ?? "",
        total: o.totalPriceSet.shopMoney,
        designIds,
        pieces,
      };
    })
    .filter((o: any) => o.designIds.length > 0);
  return { orders };
};

const money = (m: { amount: string; currencyCode: string }) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: m.currencyCode }).format(Number(m.amount));

const tone = (s: string) => (s === "PAID" ? "success" : s === "REFUNDED" || s === "VOIDED" ? "critical" : "attention");

export default function Orders() {
  const { orders } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page title="Customizer orders" subtitle="Orders that came through the design studio, with their artwork and mockups.">
      <TitleBar title="Customizer orders" />
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {orders.length === 0 ? (
              <EmptyState heading="No customizer orders yet" image="">
                <p>Orders placed through the design studio will appear here with their designs attached.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "order", plural: "orders" }}
                itemCount={orders.length}
                selectable={false}
                headings={[
                  { title: "Order" },
                  { title: "Date" },
                  { title: "Customer" },
                  { title: "Pieces" },
                  { title: "Designs" },
                  { title: "Total" },
                  { title: "Payment" },
                  { title: "Fulfilment" },
                ]}
              >
                {orders.map((o: any, i: number) => (
                  <IndexTable.Row id={o.id} key={o.id} position={i} onClick={() => navigate(`/app/orders/${o.id}`)}>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold">{o.name}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{new Date(o.createdAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">{o.customer}</Text>
                      {o.email ? <Text as="p" tone="subdued" variant="bodySm">{o.email}</Text> : null}
                    </IndexTable.Cell>
                    <IndexTable.Cell>{o.pieces}</IndexTable.Cell>
                    <IndexTable.Cell>{o.designIds.length}</IndexTable.Cell>
                    <IndexTable.Cell>{money(o.total)}</IndexTable.Cell>
                    <IndexTable.Cell><Badge tone={tone(o.financial)}>{o.financial}</Badge></IndexTable.Cell>
                    <IndexTable.Cell><Badge>{o.fulfillment}</Badge></IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
