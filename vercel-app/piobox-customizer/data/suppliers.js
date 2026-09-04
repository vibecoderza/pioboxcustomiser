// Supplier catalogues. A supplier provides the BLANK (cost, MOQ, SKU) and optionally the
// decoration. Our own templates and photography are never replaced — a supplier offer only
// attaches a cost and a stock code to a template we already own.
//
// In.It Apparel — "2026 APPAREL PRICE LIST" + "BRANDING PRICE GUIDE 2026".
// All figures ZAR, EX VAT, ex branding and ex delivery. These are BLANK WHOLESALE costs,
// not sell prices. Transcribed 2026-09-03; re-check against the supplier PDFs each season.

export const SUPPLIERS = {
  init: {
    id: "init",
    name: "In.It Apparel",
    url: "https://www.initapparel.co.za",
    email: "sales@initapparel.co.za",
    phone: "079 436 2152",
    currency: "ZAR",
    pricesExVat: true,
    // Apparel MOQ 25 per colour and style; below that In.It applies a surcharge (unquantified
    // in the guide). DTG/DTF have no MOQ. Screen and embroidery need 25 per artwork.
    blankMoq: 25,
    leadTimeDays: "7-14 working days",
    notes: "Blank wholesale ex VAT. Orders under 25/colour/style attract an unspecified surcharge.",
    products: [
      // --- Core range (designed for repeat ordering) ---
      { sku: "MPT03", name: "Core Classic T-Shirt", range: "Core", category: "Tees", cost: 13900 },
      { sku: "MPT05", name: "Core Classic Heavy T-Shirt", range: "Core", category: "Tees", cost: 22000 },
      { sku: "MBT01", name: "Core Boxy T-Shirt", range: "Core", category: "Tees", cost: 15800 },
      { sku: "LPT01", name: "Core Ladies Classic T-Shirt", range: "Core", category: "Tees", cost: 13900 },
      { sku: "LBC01", name: "Core Ladies Cropped Boxy T-Shirt", range: "Core", category: "Tees", cost: 13500 },

      // --- Local-wear, men's tees ---
      { sku: "MPT03-190", name: "Classic Heavy T-Shirt", gsm: 190, range: "Local-wear", category: "Tees", cost: 18000 },
      { sku: "MPT03-240", name: "Classic Ultra Heavy T-Shirt", gsm: 250, range: "Local-wear", category: "Tees", cost: 22000 },
      { sku: "MBT02", name: "Heavy Weight Boxy T-Shirt", gsm: 190, range: "Local-wear", category: "Tees", cost: 22600 },
      { sku: "MBT03", name: "Ultra Heavy Weight Boxy T-Shirt", gsm: 250, range: "Local-wear", category: "Tees", cost: 26400 },
      { sku: "MET02", name: "Men's Long Line T-Shirt", range: "Local-wear", category: "Tees", cost: 15300 },
      { sku: "MPT01", name: "Men's Premium T-Shirt", range: "Local-wear", category: "Tees", cost: 14500 },
      { sku: "MPT03L/S", name: "Men's Premium Long-sleeve Tee", range: "Local-wear", category: "Tees", cost: 17700 },
      { sku: "MRT01", name: "Men's Baseball Top Full Sleeve", range: "Local-wear", category: "Tees", cost: 17600 },
      { sku: "MRT013/4", name: "Men's Baseball Top 3/4 Sleeve", range: "Local-wear", category: "Tees", cost: 16800 },
      { sku: "MRT01S", name: "Men's Baseball Top Short Sleeve", range: "Local-wear", category: "Tees", cost: 16100 },
      { sku: "MRT02", name: "Men's Ringer T-Shirt", range: "Local-wear", category: "Tees", cost: 14500 },
      { sku: "MCV02", name: "Mens Standard Tank", range: "Local-wear", category: "Tees", cost: 11600 },
      { sku: "MSH02", name: "Men's Sleeveless T-Shirt", range: "Local-wear", category: "Tees", cost: 13300 },
      { sku: "MSV05", name: "Men's Extreme Stringer Vest", range: "Local-wear", category: "Tees", cost: 12300 },
      { sku: "MRV01", name: "Men's Ringer Vest", range: "Local-wear", category: "Tees", cost: 12300 },

      // --- Local-wear, ladies ---
      { sku: "LBC01-190", name: "Ladies Boxy Crop", gsm: 190, range: "Local-wear", category: "Tees", cost: 19500 },
      { sku: "LBC01-240", name: "Ladies Boxy Crop", gsm: 240, range: "Local-wear", category: "Tees", cost: 23000 },
      { sku: "LBT01", name: "Ladies Boxy/Oversized T-Shirt", range: "Local-wear", category: "Tees", cost: 15800 },
      { sku: "LCT01", name: "Ladies Cropped T-Shirt", range: "Local-wear", category: "Tees", cost: 12100 },
      { sku: "LCT03", name: "Ladies Extended Cropped T-Shirt", range: "Local-wear", category: "Tees", cost: 12500 },
      { sku: "LFT03", name: "Ladies Extended Shoulder T-Shirt", range: "Local-wear", category: "Tees", cost: 14500 },
      { sku: "LRT01", name: "Ladies Baseball Top Full Sleeve", range: "Local-wear", category: "Tees", cost: 17600 },
      { sku: "LRT013/4", name: "Ladies Baseball Top 3/4 Sleeve", range: "Local-wear", category: "Tees", cost: 14500 },
      { sku: "LRT01S", name: "Ladies Baseball Top Short Sleeve", range: "Local-wear", category: "Tees", cost: 16700 },
      { sku: "LRT02", name: "Ladies Ringer T-Shirt", range: "Local-wear", category: "Tees", cost: 14500 },
      { sku: "LRT06", name: "Ladies Cropped Baseball Top", range: "Local-wear", category: "Tees", cost: 16700 },
      { sku: "LFRV01", name: "Ladies Fitted Racerback Tank", range: "Local-wear", category: "Tees", cost: 11600 },
      { sku: "LCV01", name: "Ladies Cropped Vest", range: "Local-wear", category: "Tees", cost: 10800 },
      { sku: "LCV02", name: "Ladies Fitted Cropped Vest", range: "Local-wear", category: "Tees", cost: 10800 },
      { sku: "LSV05", name: "Ladies Gym Vest", range: "Local-wear", category: "Tees", cost: 12000 },
      { sku: "LRV01", name: "Ladies Ringer Vest", range: "Local-wear", category: "Tees", cost: 12700 },

      // --- Winter: sweaters and hoodies ---
      { sku: "LCS02", name: "Ladies Cropped Sweater", range: "Local-wear", category: "Fleece", cost: 29700 },
      { sku: "U2S01", name: "Unisex Two Tone Sweater", range: "Local-wear", category: "Fleece", cost: 38000 },
      { sku: "OSS01", name: "Over-sized Sweater", range: "Local-wear", category: "Fleece", cost: 46200 },
      { sku: "LCH01", name: "Ladies Cropped Hoodie", range: "Local-wear", category: "Fleece", cost: 36700 },
      { sku: "LFH01", name: "Unisex Fashion Hoodie", range: "Local-wear", category: "Fleece", cost: 42400 },
      { sku: "UCH01", name: "Unisex Cowl-Neck Hoodie", range: "Local-wear", category: "Fleece", cost: 42400 },
      { sku: "URH01", name: "Raglan Hoodie", range: "Local-wear", category: "Fleece", cost: 48700 },
      { sku: "UZH01", name: "Unisex Zip Through Hoodie", range: "Local-wear", category: "Fleece", cost: 48700 },
      { sku: "UUH01", name: "Unisex Undercut Hoodie", range: "Local-wear", category: "Fleece", cost: 50600 },
      { sku: "OSH01", name: "Over-sized Hoodie", range: "Local-wear", category: "Fleece", cost: 55000 },

      // --- Bottoms ---
      { sku: "MSP02", name: "Mens Skinny Leg Sweatpants", range: "Local-wear", category: "Bottoms", cost: 30400 },
      { sku: "MSS01", name: "Basic Terry Shorts", range: "Local-wear", category: "Bottoms", cost: 22800 },
      { sku: "LSS01", name: "Ladies Terry Hot-pants", range: "Local-wear", category: "Bottoms", cost: 18400 },
      { sku: "LSP013/4", name: "Ladies 3/4 Sweat Pants", range: "Local-wear", category: "Bottoms", cost: 29700 },

      // --- Print-wear (stocked for fast DTG / screen turnaround) ---
      { sku: "PT-S-1", name: "Unisex Promo T-Shirt", gsm: 145, range: "Print-wear", category: "Tees", cost: 6700 },
      { sku: "UT-M-1", name: "Classic Unisex T-Shirt", gsm: 160, range: "Print-wear", category: "Tees", cost: 18000 },
      { sku: "HT-C-1", name: "Heavy Weight Premium T-Shirt", gsm: 185, range: "Print-wear", category: "Tees", cost: 14000 },
      { sku: "US-C-1", name: "Unisex Crew Neck Sweater", gsm: 240, range: "Print-wear", category: "Fleece", cost: 32000 },
      { sku: "UH-H-1", name: "Unisex Hoodie", gsm: 240, range: "Print-wear", category: "Fleece", cost: 37500 },
      { sku: "CG-M-1", name: "Classic Golfer", gsm: 175, range: "Print-wear", category: "Tees", cost: 13000 },

      // --- Eco-wear ---
      { sku: "OCT01", name: "Organic Cotton T-Shirt", range: "Eco-wear", category: "Tees", cost: 15000 },
      { sku: "RUCT01", name: "Re-Wear Unisex T-Shirt", range: "Eco-wear", category: "Tees", cost: 13500 },
      { sku: "TB-B-1", name: "Organic Tote Bag", range: "Eco-wear", category: "Accessories", cost: 3800 },

      // --- Active-wear ---
      { sku: "AC-MPT03", name: "Men's Moisture-Managed Activewear Tee", gsm: 220, range: "Active-wear", category: "Tees", cost: 15400 },
      { sku: "AC-MSH04", name: "Men's Moisture-Managed Sleeveless Activewear Shirt", gsm: 220, range: "Active-wear", category: "Tees", cost: 14900 },
      { sku: "AC-MSS01", name: "Men's Mesh Shorts", range: "Active-wear", category: "Bottoms", cost: 19800 },

      // --- Head-wear ---
      { sku: "FS-H-1", name: "Flat Peak Snap Back", range: "Head-wear", category: "Headwear", cost: 11400 },
      { sku: "CS-H-1", name: "Curved Peak Snap Back", range: "Head-wear", category: "Headwear", cost: 11400 },
      { sku: "TC-H-1", name: "Trucker Cap", range: "Head-wear", category: "Headwear", cost: 11400 },
      { sku: "DC-C-1", name: "Dad Cap", range: "Head-wear", category: "Headwear", cost: 12700 },
      { sku: "SB-C-1", name: "Skull Beanie", range: "Head-wear", category: "Headwear", cost: 8500 },
      { sku: "CB-H-1", name: "Cuffed Beanie", range: "Head-wear", category: "Headwear", cost: 6100 },
      { sku: "BH-C-1", name: "Bucket Hat", range: "Head-wear", category: "Headwear", cost: 10100 },
    ],
  },
};

/**
 * Which supplier SKU supplies which of OUR templates.
 * Keyed by our styleNumber (BLNKUP-*). Only add a row when the supplier genuinely sells that
 * garment — an unmapped template simply has no supplier yet and cannot be costed.
 *
 * `confidence: "confirmed"` means a human checked it against the supplier. Anything marked
 * "proposed" is a suggestion awaiting sign-off and must not be used to sell.
 */
export const SUPPLIER_MAP = {
  // Signed off by Alan, 2026-09-03.
  "BLNKUP-01": { supplier: "init", sku: "HT-C-1", confidence: "confirmed" },

  // Plausible but NOT signed off. Left commented so nothing sells on a guessed cost.
  // Uncomment individually once you have confirmed fit and feel with In.It.
  // "BLNKUP-03": { supplier: "init", sku: "MBT03",     confidence: "proposed" }, // Drop Shoulder 230-250 -> Ultra Heavy Boxy 250gsm R264
  // "BLNKUP-04": { supplier: "init", sku: "MPT03L/S",  confidence: "proposed" }, // Long Sleeve Tee -> Premium Long-sleeve R177
  // "BLNKUP-05": { supplier: "init", sku: "OSH01",     confidence: "proposed" }, // Oversized Hoodie -> Over-sized Hoodie R550
  // "BLNKUP-08": { supplier: "init", sku: "UZH01",     confidence: "proposed" }, // Zip Hoodie -> Zip Through Hoodie R487
  // "BLNKUP-15": { supplier: "init", sku: "MSP02",     confidence: "proposed" }, // Jogger -> Skinny Leg Sweatpants R304
  // "BLNKUP-19": { supplier: "init", sku: "MSS01",     confidence: "proposed" }, // Sweat Short -> Basic Terry Shorts R228
  // "BLNKUP-H01":{ supplier: "init", sku: "CS-H-1",    confidence: "proposed" }, // 6-Panel Cap -> Curved Peak Snap Back R114
  // "BLNKUP-H02":{ supplier: "init", sku: "CB-H-1",    confidence: "proposed" }, // Ribbed Beanie -> Cuffed Beanie R61
  // "BLNKUP-A02":{ supplier: "init", sku: "TB-B-1",    confidence: "proposed" }, // Canvas Tote -> Organic Tote Bag R38
};

/**
 * Provisional blank costs for templates with no mapped supplier, so the studio can still
 * quote and sell them.
 *
 * ⚠️ These are NOT supplier-quoted. They are placeholders derived from the mid-point of
 * In.It's range in the same category — except Accessories and Outerwear, where In.It sells
 * nothing comparable and the figure is a pure guess set deliberately HIGH so a mistake costs
 * margin rather than money. Replace each one as you map a real supplier.
 */
export const PLACEHOLDER_BLANK_COSTS = {
  Tees: 15000,        // In.It tees run R67-R264
  Fleece: 45000,      // In.It fleece runs R297-R550
  Bottoms: 26000,     // In.It bottoms run R184-R304
  Headwear: 12000,    // In.It headwear runs R61-R127
  Accessories: 15000, // no comparable In.It stock — guess
  Outerwear: 50000,   // no comparable In.It stock — guess
};

export const supplierProduct = (supplierId, sku) =>
  SUPPLIERS[supplierId]?.products.find((p) => p.sku === sku) ?? null;

/**
 * Blank cost for one of our templates.
 * Returns { cost, source: "supplier" | "placeholder", ... } — always check `source` before
 * treating the number as real money.
 */
export function blankCostFor(styleNumber, category, { requireConfirmed = true } = {}) {
  const row = SUPPLIER_MAP[styleNumber];
  if (row && (!requireConfirmed || row.confidence === "confirmed")) {
    const p = supplierProduct(row.supplier, row.sku);
    if (p) return { ...p, cost: p.cost, source: "supplier", supplier: row.supplier, confidence: row.confidence };
  }
  const cost = PLACEHOLDER_BLANK_COSTS[category];
  return cost ? { cost, source: "placeholder", sku: null, name: `Placeholder ${category} blank`, supplier: null } : null;
}

/** Sell price from blank cost. House rule: 40% on top of cost, rounded to the nearest R5. */
export function sellPriceFrom(cost, { markup = 1.4, roundTo = 500 } = {}) {
  if (!(cost > 0)) return null;
  return Math.max(roundTo, Math.round((cost * markup) / roundTo) * roundTo);
}
