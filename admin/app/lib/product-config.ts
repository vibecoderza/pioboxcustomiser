// Shape of the `piobox.customizer` product metafield. The theme snippet hands this straight to
// productFromShopify(), so the keys here are that function's config contract — not an
// invention of the admin app.

export const CATEGORIES = ["Tees", "Fleece", "Bottoms", "Headwear", "Outerwear", "Accessories"] as const;
export const FITS = ["Classic", "Relaxed", "Oversized", "Athletic"] as const;

/** Photo roles the recolor engine and print zones rely on, in the order they matter. */
export const PHOTO_ROLES = [
  { key: "front", label: "Front (white/PFD)", required: true, help: "The recolour base. A white garment on a white background." },
  { key: "frontMask", label: "Front (black)", required: false, help: "Same shot in black. Optional, but sharpens the garment cut-out." },
  { key: "frontBlack", label: "Front shown for black", required: false, help: "Used as-is when the customer picks black, instead of recolouring." },
  { key: "back", label: "Back (white/PFD)", required: false, help: "Enables the Back side in the studio." },
  { key: "backBlack", label: "Back shown for black", required: false, help: "" },
] as const;

export type ProductConfig = {
  enabled: boolean;
  buttonLabel?: string;
  styleNumber?: string;
  category?: string;
  fit?: string;
  fabricWeight?: string;
  colorOption?: string;
  sizeOption?: string;
  swatches?: Record<string, string>;
  photos?: Record<string, string>;
  colorwayImages?: Record<string, string>;
  backColorwayImages?: Record<string, string>;
  recolorMode?: string | null;
};

export const EMPTY_CONFIG: ProductConfig = {
  enabled: false,
  buttonLabel: "Design yours",
  category: "Tees",
  fit: "Classic",
  colorOption: "Colour",
  sizeOption: "Size",
  swatches: {},
  photos: {},
  colorwayImages: {},
  backColorwayImages: {},
};

/** Matches the studio's own handleize, so colourway keys line up with what it derives. */
export function handleize(s: string) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function parseConfig(raw: string | null | undefined): ProductConfig {
  if (!raw) return { ...EMPTY_CONFIG };
  try {
    return { ...EMPTY_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

/** What is stopping this product working in the studio. Empty means ready. */
export function configProblems(cfg: ProductConfig, colourValues: string[]) {
  const problems: string[] = [];
  if (!cfg.photos?.front) problems.push("No front photo — the studio cannot recolour without one.");
  if (!cfg.styleNumber) problems.push("No style number.");
  for (const c of colourValues) {
    if (!cfg.swatches?.[c]) problems.push(`No swatch colour for “${c}”.`);
  }
  return problems;
}
