import { useCallback, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation, useRouteError, useSubmit } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  Badge, Banner, BlockStack, Box, Card, Checkbox, InlineGrid, InlineStack, Layout,
  List, Page, Select, Text, TextField, Thumbnail,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { PrintAreaEditor } from "../components/PrintAreaEditor";
import { photoKey, type Frame } from "../lib/frame";
import {
  CATEGORIES, EMPTY_CONFIG, FITS, PHOTO_ROLES, configProblems, handleize, parseConfig,
  type ProductConfig,
} from "../lib/product-config";

type Config = ProductConfig & { photoFrames?: Record<string, Frame> };

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(
    `#graphql
      query Blank($id: ID!) {
        shop { metafield(namespace: "piobox", key: "settings") { value } }
        product(id: $id) {
          id title handle status
          options { name optionValues { name } }
          media(first: 100) { nodes { ... on MediaImage { image { url altText } } } }
          variants(first: 1) { nodes { sku } }
          metafield(namespace: "piobox", key: "customizer") { value }
        }
      }`,
    { variables: { id: `gid://shopify/Product/${params.id}` } },
  );
  const json = await res.json();
  const p = json.data?.product;
  if (!p) throw new Response("Product not found", { status: 404 });

  let studioHost = "";
  try { studioHost = JSON.parse(json.data?.shop?.metafield?.value ?? "{}").studioHost ?? ""; } catch { /* not set yet */ }

  const images = (p.media?.nodes ?? []).filter((m: any) => m?.image?.url)
    .map((m: any) => ({ url: m.image.url as string, alt: (m.image.altText as string) || "" }));
  const colourOpt = (p.options ?? []).find((o: any) => /colou?r/i.test(o.name));
  const sizeOpt = (p.options ?? []).find((o: any) => /size/i.test(o.name));
  const colours = (colourOpt?.optionValues ?? []).map((v: any) => v.name as string);

  const config = parseConfig(p.metafield?.value) as Config;
  if (!p.metafield?.value) {
    config.styleNumber = p.variants?.nodes?.[0]?.sku ?? "";
    config.colorOption = colourOpt?.name ?? "Colour";
    config.sizeOption = sizeOpt?.name ?? "Size";
  }
  return {
    product: { id: params.id, title: p.title, handle: p.handle },
    images, colours, config, studioHost,
    problems: configProblems(config, colours),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  // The whole config arrives as one JSON field built from React state. Relying on Polaris to
  // serialise its own controls silently dropped the enabled checkbox and half the colourway
  // selects, which quietly switched a live blank off — so nothing here reads individual inputs.
  let config: Config;
  try {
    config = JSON.parse(String(form.get("__config") ?? ""));
  } catch {
    return { ok: false, problems: ["The form did not submit its data. Reload and try again."], message: "Nothing was saved." };
  }
  const colours = JSON.parse(String(form.get("__colours") || "[]")) as string[];

  const problems = configProblems(config, colours);
  if (config.enabled && problems.length) {
    return { ok: false, problems, message: "Fix these before switching it on." };
  }

  const res = await admin.graphql(
    `#graphql
      mutation SaveBlank($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [{
          ownerId: `gid://shopify/Product/${params.id}`,
          namespace: "piobox", key: "customizer", type: "json",
          value: JSON.stringify(config),
        }],
      },
    },
  );
  const json = await res.json();
  const errors = json.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length) return { ok: false, problems: errors.map((e: any) => e.message), message: "Shopify rejected the save." };
  return { ok: true, problems, message: config.enabled ? "Saved. Live in the studio." : "Saved. Switched off, so it will not appear in the studio." };
};

export default function Blank() {
  const { product, images, colours, config: initial, studioHost, problems } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const saving = nav.state === "submitting";
  const formRef = useRef<HTMLFormElement>(null);

  const [cfg, setCfg] = useState<Config>({ ...EMPTY_CONFIG, ...initial });
  const set = useCallback(<K extends keyof Config>(k: K, v: Config[K]) => setCfg((c) => ({ ...c, [k]: v })), []);
  const setIn = useCallback((k: "swatches" | "colorwayImages" | "backColorwayImages" | "photos", key: string, v: string) => {
    setCfg((c) => {
      const next = { ...(c[k] ?? {}) } as Record<string, string>;
      if (v) next[key] = v; else delete next[key];
      return { ...c, [k]: next };
    });
  }, []);
  const setFrame = useCallback((url: string | undefined, f: Frame | null) => {
    if (!url) return;
    const key = photoKey(url);
    setCfg((c) => {
      const frames = { ...(c.photoFrames ?? {}) };
      if (f) frames[key] = f; else delete frames[key];
      return { ...c, photoFrames: frames };
    });
  }, []);

  const imageOptions = [
    { label: "— recolour automatically —", value: "" },
    ...images.map((im: any, i: number) => ({ label: im.alt || `Image ${i + 1}`, value: im.url })),
  ];
  const live = configProblems(cfg, colours);

  return (
    <Page
      title={product.title}
      subtitle={`Blank setup · ${product.handle}`}
      backAction={{ url: "/app/blanks" }}
      titleMetadata={cfg.enabled ? <Badge tone="success">In the studio</Badge> : <Badge>Switched off</Badge>}
      primaryAction={{
        content: saving ? "Saving…" : "Save",
        loading: saving,
        onAction: () => formRef.current?.requestSubmit(),
      }}
    >
      <TitleBar title={`${product.title} · blank setup`} />
      <Form method="post" ref={formRef}>
        <input type="hidden" name="__config" value={JSON.stringify(cfg)} />
        <input type="hidden" name="__colours" value={JSON.stringify(colours)} />

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {result?.message ? (
                <Banner tone={result.ok ? "success" : "critical"} title={result.message}>
                  {result.problems?.length ? <List>{result.problems.map((p: string, i: number) => <List.Item key={i}>{p}</List.Item>)}</List> : null}
                </Banner>
              ) : problems.length ? (
                <Banner tone="warning" title="Not ready for the studio yet">
                  <List>{problems.map((p: string, i: number) => <List.Item key={i}>{p}</List.Item>)}</List>
                </Banner>
              ) : null}

              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Print areas</Text>
                    <Text as="p" tone="subdued">
                      The garment is found automatically and the printable areas follow from it. Check the green
                      areas land where you would actually print, and drag the box if they do not.
                    </Text>
                  </BlockStack>
                  <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                    {(["front", "back"] as const).map((side) => {
                      const url = cfg.photos?.[side];
                      return (
                        <BlockStack gap="200" key={side}>
                          <Text as="h3" variant="headingSm">{side === "front" ? "Front" : "Back"}</Text>
                          <PrintAreaEditor
                            host={studioHost}
                            photoUrl={url ?? null}
                            side={side}
                            category={cfg.category ?? "Tees"}
                            fit={cfg.fit ?? "Classic"}
                            productName={product.title}
                            frame={url ? cfg.photoFrames?.[photoKey(url)] ?? null : null}
                            onChange={(f) => setFrame(url, f)}
                          />
                        </BlockStack>
                      );
                    })}
                  </InlineGrid>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Photos</Text>
                    <Text as="p" tone="subdued">
                      Click an image to assign it. These are this product&rsquo;s own Shopify media — to add more,
                      upload them to the product, then reload this page.
                    </Text>
                  </BlockStack>
                  {images.length === 0 ? (
                    <Banner tone="warning" title="This product has no images yet">
                      <p>Add photos to the product in Shopify first — at minimum a white garment on a white background.</p>
                    </Banner>
                  ) : (
                    <BlockStack gap="500">
                      {PHOTO_ROLES.map((role) => (
                        <BlockStack gap="200" key={role.key}>
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="h3" variant="headingSm">{role.label}</Text>
                            {role.required
                              ? <Badge tone={cfg.photos?.[role.key] ? "success" : "critical"}>{cfg.photos?.[role.key] ? "Set" : "Required"}</Badge>
                              : cfg.photos?.[role.key] ? <Badge tone="success">Set</Badge> : null}
                          </InlineStack>
                          {role.help ? <Text as="p" tone="subdued" variant="bodySm">{role.help}</Text> : null}
                          <Box overflowX="scroll">
                            <InlineStack gap="200" wrap={false}>
                              <Tile selected={!cfg.photos?.[role.key]} onClick={() => setIn("photos", role.key, "")} />
                              {images.map((im: any) => (
                                <Tile key={im.url} src={im.url} label={im.alt} selected={cfg.photos?.[role.key] === im.url} onClick={() => setIn("photos", role.key, im.url)} />
                              ))}
                            </InlineStack>
                          </Box>
                        </BlockStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Colours</Text>
                  <Text as="p" tone="subdued">
                    These mirror the product&rsquo;s Colour option in Shopify — add a colour there and it appears
                    here. The swatch is what customers see; a colourway photo is optional, and without one the
                    studio recolours the front photo.
                  </Text>
                  {colours.length === 0 ? (
                    <Text as="p" tone="subdued">No colour option on this product, so the studio offers one colourway.</Text>
                  ) : (
                    <BlockStack gap="400">
                      {colours.map((c: string) => {
                        const id = handleize(c);
                        const hex = cfg.swatches?.[c] ?? "";
                        const valid = /^#[0-9a-fA-F]{6}$/.test(hex);
                        return (
                          <Box key={c} background="bg-surface-secondary" padding="300" borderRadius="200">
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="center">
                                <span style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid #c9cccf", background: valid ? hex : "transparent", display: "inline-block" }} />
                                <Text as="span" fontWeight="semibold">{c}</Text>
                                {cfg.colorwayImages?.[id] ? <Thumbnail source={cfg.colorwayImages[id]} alt="" size="small" /> : null}
                              </InlineStack>
                              <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                                <TextField
                                  label="Swatch colour" value={hex} onChange={(v) => setIn("swatches", c, v)}
                                  autoComplete="off" placeholder="#f4f4f5"
                                  error={hex && !valid ? "Use a 6-digit hex" : undefined}
                                />
                                <Select label="Front photo" options={imageOptions} value={cfg.colorwayImages?.[id] ?? ""} onChange={(v) => setIn("colorwayImages", id, v)} />
                                <Select label="Back photo" options={imageOptions} value={cfg.backColorwayImages?.[id] ?? ""} onChange={(v) => setIn("backColorwayImages", id, v)} />
                              </InlineGrid>
                            </BlockStack>
                          </Box>
                        );
                      })}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">In the studio</Text>
                  <Checkbox
                    label="Customers can design on this blank"
                    checked={cfg.enabled}
                    onChange={(v) => set("enabled", v)}
                    helpText="Off keeps it for sale as a plain blank."
                  />
                  {cfg.enabled && live.length ? (
                    <Text as="p" tone="critical" variant="bodySm">{`Saving is blocked until ${live.length} thing${live.length === 1 ? "" : "s"} above ${live.length === 1 ? "is" : "are"} fixed.`}</Text>
                  ) : null}
                  <TextField label="Button label" value={cfg.buttonLabel ?? ""} onChange={(v) => set("buttonLabel", v)} autoComplete="off" />
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">Specification</Text>
                  <TextField label="Style number" value={cfg.styleNumber ?? ""} onChange={(v) => set("styleNumber", v)} autoComplete="off" />
                  <Select label="Category" options={CATEGORIES.map((c) => ({ label: c, value: c }))} value={cfg.category} onChange={(v) => set("category", v)} helpText="Chooses the print-zone template." />
                  <Select label="Fit" options={FITS.map((f) => ({ label: f, value: f }))} value={cfg.fit} onChange={(v) => set("fit", v)} helpText="Oversized uses drop-shoulder zones." />
                  <TextField label="Fabric weight" value={cfg.fabricWeight ?? ""} onChange={(v) => set("fabricWeight", v)} autoComplete="off" placeholder="185-200 GSM" />
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">Option names</Text>
                  <Text as="p" tone="subdued" variant="bodySm">Which Shopify options carry colour and size.</Text>
                  <TextField label="Colour option" value={cfg.colorOption ?? ""} onChange={(v) => set("colorOption", v)} autoComplete="off" />
                  <TextField label="Size option" value={cfg.sizeOption ?? ""} onChange={(v) => set("sizeOption", v)} autoComplete="off" />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}

function Tile({ src, label, selected, onClick }: { src?: string; label?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} title={label || undefined}
      style={{
        flex: "0 0 auto", width: 72, height: 72, padding: 0, borderRadius: 8, cursor: "pointer",
        border: selected ? "2px solid #303030" : "1px solid #d9d9d9",
        background: src ? `#fff center/contain no-repeat url("${src}")` : "#f6f6f7",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#616161",
      }}
    >
      {src ? "" : "None"}
    </button>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
