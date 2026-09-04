import { useCallback, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation, useRouteError, useSubmit } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  Badge, Banner, BlockStack, Box, Button, Card, Checkbox, Divider, InlineGrid, InlineStack, Layout,
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
  try { studioHost = JSON.parse(json.data?.shop?.metafield?.value ?? "{}").studioHost ?? ""; } catch { /* settings not set yet */ }

  const images = (p.media?.nodes ?? []).filter((m: any) => m?.image?.url)
    .map((m: any) => ({ url: m.image.url as string, alt: (m.image.altText as string) || "" }));
  const colourOpt = (p.options ?? []).find((o: any) => /colou?r/i.test(o.name));
  const sizeOpt = (p.options ?? []).find((o: any) => /size/i.test(o.name));
  const colours = (colourOpt?.optionValues ?? []).map((v: any) => v.name as string);

  const config = parseConfig(p.metafield?.value);
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
  const colours = JSON.parse(String(form.get("__colours") || "[]")) as string[];
  const photos = JSON.parse(String(form.get("__photos") || "{}")) as Record<string, string>;
  const photoFrames = JSON.parse(String(form.get("__frames") || "{}")) as Record<string, Frame>;

  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const pick = <T,>(entries: [string, T | undefined][]) =>
    Object.fromEntries(entries.filter(([, v]) => v !== undefined)) as Record<string, T>;

  const config: ProductConfig & { photoFrames?: Record<string, Frame> } = {
    ...EMPTY_CONFIG,
    enabled: form.get("enabled") === "on",
    buttonLabel: str("buttonLabel") ?? "Design yours",
    styleNumber: str("styleNumber"),
    category: str("category"),
    fit: str("fit"),
    fabricWeight: str("fabricWeight"),
    colorOption: str("colorOption"),
    sizeOption: str("sizeOption"),
    photos,
    photoFrames,
    swatches: pick(colours.map((c) => [c, str(`swatch.${c}`)])),
    colorwayImages: pick(colours.map((c) => [handleize(c), str(`cwFront.${c}`)])),
    backColorwayImages: pick(colours.map((c) => [handleize(c), str(`cwBack.${c}`)])),
  };

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
  return { ok: true, problems, message: config.enabled ? "Saved. Live in the studio." : "Saved. Still switched off." };
};

export default function Blank() {
  const { product, images, colours, config, studioHost, problems } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const saving = nav.state === "submitting";
  // The embedded frame does not scroll to the foot of a long form, so Save lives in the page
  // header where it is always reachable.
  const formRef = useRef<HTMLFormElement>(null);

  // Polaris inputs are controlled — defaultValue is ignored, so every field needs state or it
  // renders empty and a save silently blanks whatever was there before.
  const [enabled, setEnabled] = useState(config.enabled);
  const [category, setCategory] = useState(config.category ?? "Tees");
  const [fit, setFit] = useState(config.fit ?? "Classic");
  const [buttonLabel, setButtonLabel] = useState(config.buttonLabel ?? "Design yours");
  const [styleNumber, setStyleNumber] = useState(config.styleNumber ?? "");
  const [fabricWeight, setFabricWeight] = useState(config.fabricWeight ?? "");
  const [colorOption, setColorOption] = useState(config.colorOption ?? "Colour");
  const [sizeOption, setSizeOption] = useState(config.sizeOption ?? "Size");
  const [photos, setPhotos] = useState<Record<string, string>>(config.photos ?? {});
  const [frames, setFrames] = useState<Record<string, Frame>>((config as any).photoFrames ?? {});

  const setPhoto = (role: string, url: string) =>
    setPhotos((p) => (url ? { ...p, [role]: url } : Object.fromEntries(Object.entries(p).filter(([k]) => k !== role))));

  const frameFor = (url?: string) => (url ? frames[photoKey(url)] ?? null : null);
  const setFrame = useCallback((url: string | undefined, f: Frame | null) => {
    if (!url) return;
    const key = photoKey(url);
    setFrames((prev) => {
      if (!f) { const { [key]: _drop, ...rest } = prev; return rest; }
      return { ...prev, [key]: f };
    });
  }, []);

  return (
    <Page
      title={product.title}
      subtitle={`Blank setup · ${product.handle}`}
      backAction={{ url: "/app/blanks" }}
      titleMetadata={enabled ? <Badge tone="success">In the studio</Badge> : <Badge>Switched off</Badge>}
      primaryAction={{
        content: saving ? "Saving…" : "Save",
        loading: saving,
        // requestSubmit() fires the form's own submit path, which Remix intercepts. Passing the
        // element to useSubmit() relies on the ref being attached and fails silently if it is not.
        onAction: () => {
          const f = formRef.current;
          if (!f) return;
          if (typeof f.requestSubmit === "function") f.requestSubmit();
          else submit(f, { method: "post" });
        },
      }}
    >
      <TitleBar title={`${product.title} · blank setup`} />
      <Form method="post" ref={formRef}>
        <input type="hidden" name="__colours" value={JSON.stringify(colours)} />
        <input type="hidden" name="__photos" value={JSON.stringify(photos)} />
        <input type="hidden" name="__frames" value={JSON.stringify(frames)} />

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
                      const url = side === "front" ? photos.front : photos.back;
                      return (
                        <BlockStack gap="200" key={side}>
                          <Text as="h3" variant="headingSm">{side === "front" ? "Front" : "Back"}</Text>
                          <PrintAreaEditor
                            host={studioHost}
                            photoUrl={url ?? null}
                            side={side}
                            category={category}
                            fit={fit}
                            productName={product.title}
                            frame={frameFor(url)}
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
                      Click an image to assign it. These come from this product&rsquo;s own Shopify media — to add
                      more, upload them to the product, then reload this page.
                    </Text>
                  </BlockStack>
                  {images.length === 0 ? (
                    <Banner tone="warning" title="This product has no images yet">
                      <p>Add photos to the product in Shopify first — at minimum a white garment on a white background.</p>
                    </Banner>
                  ) : (
                    <BlockStack gap="500">
                      {PHOTO_ROLES.map((role) => (
                        <PhotoPicker
                          key={role.key}
                          role={role}
                          images={images}
                          value={photos[role.key] ?? ""}
                          onChange={(url) => setPhoto(role.key, url)}
                        />
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Colours</Text>
                  {colours.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No colour option on this product, so the studio offers one colourway and recolours it on demand.
                    </Text>
                  ) : (
                    <BlockStack gap="400">
                      {colours.map((c: string) => (
                        <ColourRow
                          key={c}
                          colour={c}
                          images={images}
                          swatch={config.swatches?.[c] ?? ""}
                          front={config.colorwayImages?.[handleize(c)] ?? ""}
                          back={config.backColorwayImages?.[handleize(c)] ?? ""}
                        />
                      ))}
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
                    name="enabled" checked={enabled} onChange={setEnabled}
                    helpText="Off keeps it for sale as a plain blank."
                  />
                  <TextField label="Button label" name="buttonLabel" value={buttonLabel} onChange={setButtonLabel} autoComplete="off" />
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">Specification</Text>
                  <TextField label="Style number" name="styleNumber" value={styleNumber} onChange={setStyleNumber} autoComplete="off" />
                  <Select label="Category" name="category" options={CATEGORIES.map((c) => ({ label: c, value: c }))} value={category} onChange={setCategory} helpText="Chooses the print-zone template." />
                  <Select label="Fit" name="fit" options={FITS.map((f) => ({ label: f, value: f }))} value={fit} onChange={setFit} helpText="Oversized uses drop-shoulder zones." />
                  <TextField label="Fabric weight" name="fabricWeight" value={fabricWeight} onChange={setFabricWeight} autoComplete="off" placeholder="185-200 GSM" />
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">Option names</Text>
                  <Text as="p" tone="subdued" variant="bodySm">Which Shopify options carry colour and size.</Text>
                  <TextField label="Colour option" name="colorOption" value={colorOption} onChange={setColorOption} autoComplete="off" />
                  <TextField label="Size option" name="sizeOption" value={sizeOption} onChange={setSizeOption} autoComplete="off" />
                </BlockStack>
              </Card>
              <Box paddingBlockEnd="400">
                <Button submit variant="primary" fullWidth loading={saving}>Save</Button>
              </Box>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}

function PhotoPicker({ role, images, value, onChange }: { role: any; images: any[]; value: string; onChange: (url: string) => void }) {
  return (
    <BlockStack gap="200">
      <InlineStack gap="200" blockAlign="center">
        <Text as="h3" variant="headingSm">{role.label}</Text>
        {role.required ? <Badge tone={value ? "success" : "critical"}>{value ? "Set" : "Required"}</Badge> : value ? <Badge tone="success">Set</Badge> : null}
      </InlineStack>
      {role.help ? <Text as="p" tone="subdued" variant="bodySm">{role.help}</Text> : null}
      <Box overflowX="scroll">
        <InlineStack gap="200" wrap={false}>
          <Tile selected={!value} onClick={() => onChange("")} label="None" />
          {images.map((im: any) => (
            <Tile key={im.url} selected={value === im.url} onClick={() => onChange(im.url)} src={im.url} label={im.alt} />
          ))}
        </InlineStack>
      </Box>
    </BlockStack>
  );
}

function Tile({ src, label, selected, onClick }: { src?: string; label?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label || undefined}
      style={{
        flex: "0 0 auto", width: 72, height: 72, padding: 0, borderRadius: 8, cursor: "pointer",
        border: selected ? "2px solid #303030" : "1px solid #d9d9d9",
        background: src ? `#fff center/contain no-repeat url("${src}")` : "#f6f6f7",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, color: "#616161",
      }}
    >
      {src ? "" : "None"}
    </button>
  );
}

function ColourRow({ colour, images, swatch, front, back }: { colour: string; images: any[]; swatch: string; front: string; back: string }) {
  const [hex, setHex] = useState(swatch);
  const [f, setF] = useState(front);
  const [b, setB] = useState(back);
  const valid = /^#[0-9a-fA-F]{6}$/.test(hex);
  const opts = [{ label: "— recolour automatically —", value: "" }, ...images.map((im: any, i: number) => ({ label: im.alt || `Image ${i + 1}`, value: im.url }))];
  return (
    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
      <BlockStack gap="300">
        <InlineStack gap="300" blockAlign="center">
          <span style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid #c9cccf", background: valid ? hex : "transparent", display: "inline-block" }} />
          <Text as="span" fontWeight="semibold">{colour}</Text>
          {f ? <Thumbnail source={f} alt="" size="small" /> : null}
        </InlineStack>
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
          <TextField
            label="Swatch colour" name={`swatch.${colour}`} value={hex} onChange={setHex}
            autoComplete="off" placeholder="#f4f4f5"
            error={hex && !valid ? "Use a 6-digit hex" : undefined}
          />
          <Select label="Front photo" name={`cwFront.${colour}`} options={opts} value={f} onChange={setF} />
          <Select label="Back photo" name={`cwBack.${colour}`} options={opts} value={b} onChange={setB} />
        </InlineGrid>
      </BlockStack>
    </Box>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
