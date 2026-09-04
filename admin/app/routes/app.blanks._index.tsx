import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Badge, Banner, BlockStack, Box, Card, IndexTable, Layout, Page, Text, Thumbnail } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { configProblems, parseConfig } from "../lib/product-config";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(
    `#graphql
      query Blanks {
        products(first: 100, sortKey: TITLE) {
          nodes {
            id
            title
            handle
            status
            featuredMedia { preview { image { url } } }
            options { name optionValues { name } }
            variantsCount { count }
            metafield(namespace: "piobox", key: "customizer") { value }
          }
        }
      }`,
  );
  const json = await res.json();
  const blanks = (json.data?.products?.nodes ?? []).map((p: any) => {
    const cfg = parseConfig(p.metafield?.value);
    const colourOpt = (p.options ?? []).find((o: any) => /colou?r/i.test(o.name));
    const colours = (colourOpt?.optionValues ?? []).map((v: any) => v.name);
    return {
      id: p.id.split("/").pop(),
      title: p.title,
      handle: p.handle,
      status: p.status,
      image: p.featuredMedia?.preview?.image?.url ?? null,
      variants: p.variantsCount.count,
      colours,
      configured: Boolean(p.metafield?.value),
      enabled: cfg.enabled,
      problems: p.metafield?.value ? configProblems(cfg, colours) : [],
    };
  });
  return { blanks };
};

export default function Blanks() {
  const { blanks } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const live = blanks.filter((b: any) => b.enabled && b.problems.length === 0).length;

  return (
    <Page
      title="Blanks"
      subtitle="Products customers can design on. Turning one on is a change here — the theme never needs editing."
    >
      <TitleBar title="Blanks" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {blanks.length > 0 && live === 0 ? (
              <Banner tone="info" title="No blanks are live yet">
                <p>
                  Open a product below, add its photos and colours, then switch it on. It appears in the
                  storefront studio straight away.
                </p>
              </Banner>
            ) : null}
            <Card padding="0">
              <IndexTable
                resourceName={{ singular: "blank", plural: "blanks" }}
                itemCount={blanks.length}
                selectable={false}
                headings={[
                  { title: "" },
                  { title: "Product" },
                  { title: "Colours" },
                  { title: "Variants" },
                  { title: "In the studio" },
                ]}
              >
                {blanks.map((b: any, i: number) => (
                  <IndexTable.Row id={b.id} key={b.id} position={i} onClick={() => navigate(`/app/blanks/${b.id}`)}>
                    <IndexTable.Cell>
                      {b.image ? <Thumbnail source={b.image} alt="" size="small" /> : <Box minWidth="40px" />}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <BlockStack gap="050">
                        <Text as="span" fontWeight="semibold">{b.title}</Text>
                        <Text as="span" tone="subdued" variant="bodySm">{b.handle}</Text>
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{b.colours.length ? b.colours.join(", ") : "—"}</IndexTable.Cell>
                    <IndexTable.Cell>{b.variants}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <StudioStatus blank={b} />
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function StudioStatus({ blank }: { blank: any }) {
  if (!blank.configured) return <Badge>Not set up</Badge>;
  if (blank.problems.length) return <Badge tone="warning">{`${blank.problems.length} to fix`}</Badge>;
  if (!blank.enabled) return <Badge tone="attention">Ready, switched off</Badge>;
  return <Badge tone="success">Live</Badge>;
}
