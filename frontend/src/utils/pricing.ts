export type Accommodation = "double" | "single" | "none";

export const ACCOMMODATION_PRICE: Record<Accommodation, number> = {
  double: 179,
  single: 219,
  none: 0,
};

export const ACCOMMODATION_LABEL: Record<Accommodation, string> = {
  double: "Dvojlôžková izba",
  single: "Jednolôžková izba",
  none: "Bez ubytovania a stravy",
};

export const ACCOMMODATION_NOTE: Record<Accommodation, string> = {
  double: "2× nocľah, 2× raňajky, 2× obed, 2× večera, miestna daň",
  single: "2× nocľah, 2× raňajky, 2× obed, 2× večera, miestna daň",
  none: "Účasť len na prednáškach, bez ubytovania a stravy",
};

export const ACCOMMODATION_ORDER: Accommodation[] = ["double", "single", "none"];

/** Room types that qualify for the employer recreation voucher (2-night stay). */
export function qualifiesForVoucher(accommodation: Accommodation): boolean {
  return accommodation !== "none";
}

export interface PricePerson {
  name: string;
  surname: string;
  accommodation: Accommodation;
}

export interface PriceLineItem {
  name: string;
  accommodation: Accommodation;
  price: number;
}

export interface PriceBreakdown {
  items: PriceLineItem[];
  /** Sum of the accommodation packages, without the voluntary contribution. */
  accommodationTotal: number;
  extraContribution: number;
  total: number;
}

export function calculatePrice(
  people: PricePerson[],
  extraContribution = 0,
): PriceBreakdown {
  const items: PriceLineItem[] = people.map((p) => ({
    name: `${p.name} ${p.surname}`.trim(),
    accommodation: p.accommodation,
    price: ACCOMMODATION_PRICE[p.accommodation],
  }));

  const accommodationTotal = items.reduce((sum, item) => sum + item.price, 0);
  const extra = Math.max(0, Math.round(extraContribution) || 0);

  return {
    items,
    accommodationTotal,
    extraContribution: extra,
    total: accommodationTotal + extra,
  };
}
