export type AgeCategory = "baby" | "kid" | "adult";

export interface PriceLineItem {
  name: string;
  age: number;
  category: AgeCategory;
  basePrice: number;
  lateFee: number;
  discount: number;
  finalPrice: number;
}

export interface PriceBreakdown {
  items: PriceLineItem[];
  total: number;
  isLatePeriod: boolean;
}

const BASE_PRICE: Record<AgeCategory, number> = {
  baby: 0,
  kid: 130,
  adult: 150,
};

// Every sibling from the 2nd onwards gets €20 off their own price
const KID_SIBLING_DISCOUNT = 20;

// Prices increase by €10 from July 1, 2026 onwards
const LATE_FEE = 10;
const LATE_FROM = new Date(2026, 6, 1); // month is 0-indexed

export const CATEGORY_LABEL: Record<AgeCategory, string> = {
  baby: "bábätko (0–3 r.)",
  kid: "dieťa (4–14 r.)",
  adult: "dospelý/á (15+ r.)",
};

export function getCategory(age: number): AgeCategory {
  if (age <= 3) return "baby";
  if (age <= 14) return "kid";
  return "adult";
}

function isLate(): boolean {
  return new Date() >= LATE_FROM;
}

export function calculatePrice(
  attendees: { name: string; surname: string; age: number }[],
): PriceBreakdown {
  const latePeriod = isLate();
  let kidCount = 0;

  const items: PriceLineItem[] = attendees.map((a) => {
    const category = getCategory(a.age);
    const basePrice = BASE_PRICE[category];
    const lateFee = latePeriod && basePrice > 0 ? LATE_FEE : 0;
    let discount = 0;

    if (category === "kid") {
      // 2nd, 3rd, ... sibling each get €20 off their own price
      if (kidCount > 0) discount = KID_SIBLING_DISCOUNT;
      kidCount++;
    }

    return {
      name: `${a.name} ${a.surname}`.trim(),
      age: a.age,
      category,
      basePrice,
      lateFee,
      discount,
      finalPrice: Math.max(0, basePrice + lateFee - discount),
    };
  });

  const total = items.reduce((sum, item) => sum + item.finalPrice, 0);
  return { items, total, isLatePeriod: latePeriod };
}
